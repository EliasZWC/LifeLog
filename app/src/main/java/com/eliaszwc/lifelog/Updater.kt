package com.eliaszwc.lifelog

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * 应用内更新。
 *
 * 流程：查 GitHub 最新 Release → 有新版本就把版本号推给网页弹窗 → 用户确认后下载 APK
 * → 下载完成拉起系统安装器。全部在后台线程做，结果回到主线程再回调。
 *
 * 仓库是公开的，不需要 token；未登录的 GitHub API 限额是每小时 60 次，
 * 所以调用方（MainActivity）要保证「每次进入前台只查一次」。
 */
object Updater {

    private const val TAG = "LifeLog"
    private const val LATEST_RELEASE_URL =
        "https://api.github.com/repos/EliasZWC/LifeLog/releases/latest"
    private const val USER_AGENT = "LifeLog-Android"
    private const val APK_DIR = "update"
    private const val APK_NAME = "lifelog-update.apk"

    /** 解析出来的一个可用版本 */
    data class Release(val version: String, val assetUrl: String, val size: Long)

    /** 安装失败的原因，会原样传给网页（对应 i18n 的 update.failed.*） */
    const val ERROR_PERMISSION = "permission"
    const val ERROR_NETWORK = "network"
    const val ERROR_INSTALL = "install"

    // -----------------------------------------------------------------------
    // 查版本
    // -----------------------------------------------------------------------

    /** 有新版本时回调非 null；网络/解析出错或已是最新都回调 null */
    fun check(context: Context, onResult: (Release?) -> Unit) {
        val localVersion = currentVersionName(context) ?: return

        Thread {
            val release = try {
                fetchLatest()
            } catch (t: Throwable) {
                Log.w(TAG, "检查更新失败", t)
                null
            }

            val newer = release?.takeIf { isNewer(it.version, localVersion) }
            if (newer != null) {
                Log.i(TAG, "发现新版本 ${newer.version}（当前 $localVersion）")
            }
            postToMain { onResult(newer) }
        }.start()
    }

    private fun fetchLatest(): Release? {
        val connection = (URL(LATEST_RELEASE_URL).openConnection() as HttpURLConnection).apply {
            connectTimeout = 10_000
            readTimeout = 15_000
            setRequestProperty("Accept", "application/vnd.github+json")
            setRequestProperty("User-Agent", USER_AGENT)
        }

        try {
            if (connection.responseCode != HttpURLConnection.HTTP_OK) {
                Log.w(TAG, "查询 Release 失败：HTTP ${connection.responseCode}")
                return null
            }

            val body = connection.inputStream.bufferedReader().use { it.readText() }
            val json = JSONObject(body)
            val tag = json.optString("tag_name").trim()
            if (tag.isEmpty()) return null

            val assets = json.optJSONArray("assets") ?: return null
            for (index in 0 until assets.length()) {
                val asset = assets.optJSONObject(index) ?: continue
                val name = asset.optString("name")
                val url = asset.optString("browser_download_url")
                if (!name.endsWith(".apk", ignoreCase = true) || url.isEmpty()) continue
                return Release(
                    version = tag.removePrefix("v"),
                    assetUrl = url,
                    size = asset.optLong("size"),
                )
            }
            return null
        } finally {
            connection.disconnect()
        }
    }

    /** 形如 "0.0.10" 的版本号，按段比较大小 */
    private fun isNewer(remote: String, local: String): Boolean {
        val a = parseVersion(remote) ?: return false
        val b = parseVersion(local) ?: return false

        for (index in 0 until maxOf(a.size, b.size)) {
            val left = a.getOrElse(index) { 0 }
            val right = b.getOrElse(index) { 0 }
            if (left != right) return left > right
        }
        return false
    }

    private fun parseVersion(text: String): List<Int>? {
        val cleaned = text.trim().removePrefix("v").substringBefore('-')
        if (cleaned.isEmpty()) return null
        val parts = cleaned.split('.')
        return parts.map { it.toIntOrNull() ?: return null }
    }

    private fun currentVersionName(context: Context): String? = try {
        context.packageManager.getPackageInfo(context.packageName, 0).versionName
    } catch (t: Throwable) {
        Log.w(TAG, "读取当前版本失败", t)
        null
    }

    /** 把字节数写成人类可读的文本，给弹窗显示用 */
    fun formatSize(bytes: Long): String {
        if (bytes <= 0) return ""
        val mb = bytes / 1024.0 / 1024.0
        return if (mb >= 1) {
            String.format("%.1f MB", mb)
        } else {
            String.format("%.0f KB", bytes / 1024.0)
        }
    }

    // -----------------------------------------------------------------------
    // 下载
    // -----------------------------------------------------------------------

    /**
     * 下载 APK 到 cacheDir/update。
     * @param onProgress 0~100，进度不可知时不会调用
     * @param onDone 成功给文件，失败给 null
     */
    fun download(
        context: Context,
        url: String,
        onProgress: (Int) -> Unit,
        onDone: (File?) -> Unit,
    ) {
        val appContext = context.applicationContext

        Thread {
            val result = try {
                fetchApk(appContext, url, onProgress)
            } catch (t: Throwable) {
                Log.w(TAG, "下载更新失败", t)
                null
            }
            postToMain { onDone(result) }
        }.start()
    }

    private fun fetchApk(context: Context, url: String, onProgress: (Int) -> Unit): File {
        val dir = File(context.cacheDir, APK_DIR)
        if (dir.exists()) {
            // 清掉上一轮的残留，免得装到旧包
            dir.listFiles()?.forEach { it.delete() }
        } else {
            dir.mkdirs()
        }

        val target = File(dir, APK_NAME)
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 30_000
            instanceFollowRedirects = true
            setRequestProperty("User-Agent", USER_AGENT)
        }

        try {
            val code = connection.responseCode
            if (code != HttpURLConnection.HTTP_OK) {
                throw IllegalStateException("下载失败：HTTP $code")
            }

            val total = connection.contentLength.toLong()
            var copied = 0L
            var lastPercent = -1

            connection.inputStream.use { input ->
                target.outputStream().use { output ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val read = input.read(buffer)
                        if (read <= 0) break
                        output.write(buffer, 0, read)
                        copied += read
                        if (total > 0) {
                            val percent = (copied * 100 / total).toInt()
                            if (percent != lastPercent) {
                                lastPercent = percent
                                postToMain { onProgress(percent) }
                            }
                        }
                    }
                    output.flush()
                }
            }

            if (target.length() <= 0L) {
                throw IllegalStateException("下载到的文件是空的")
            }
            return target
        } finally {
            connection.disconnect()
        }
    }

    // -----------------------------------------------------------------------
    // 安装
    // -----------------------------------------------------------------------

    /**
     * 拉起系统安装器。
     * @return null 表示已成功拉起；否则返回错误码（见 ERROR_*）
     */
    fun install(activity: Activity, apk: File): String? {
        if (!apk.exists()) return ERROR_INSTALL

        // Android 8 起装「未知来源」的应用需要用户先在系统设置里授权
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !activity.packageManager.canRequestPackageInstalls()
        ) {
            openInstallPermissionSettings(activity)
            return ERROR_PERMISSION
        }

        return try {
            val uri = FileProvider.getUriForFile(
                activity,
                activity.packageName + FILE_PROVIDER_SUFFIX,
                apk,
            )
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, APK_MIME)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            activity.startActivity(intent)
            null
        } catch (t: Throwable) {
            Log.w(TAG, "拉起安装器失败", t)
            ERROR_INSTALL
        }
    }

    private fun openInstallPermissionSettings(activity: Activity) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        try {
            activity.startActivity(
                Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
                    .setData(Uri.parse("package:" + activity.packageName)),
            )
        } catch (t: Throwable) {
            Log.w(TAG, "打开「安装未知应用」设置失败", t)
        }
    }

    /** cacheDir/update 下的文件已被 FileProvider 暴露 */
    const val APK_MIME = "application/vnd.android.package-archive"
    const val FILE_PROVIDER_SUFFIX = ".fileprovider"

    private fun postToMain(block: () -> Unit) {
        Handler(Looper.getMainLooper()).post(block)
    }
}
