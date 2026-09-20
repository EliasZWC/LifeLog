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
import androidx.core.content.pm.PackageInfoCompat
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

    /** 解析出来的一个可用版本 */
    data class Release(val version: String, val assetUrl: String, val size: Long)

    /** 安装失败的原因，会原样传给网页（对应 i18n 的 update.failed.*） */
    const val ERROR_PERMISSION = "permission"
    const val ERROR_NETWORK = "network"
    const val ERROR_INSTALL = "install"
    /** 下下来的东西不是个合法 APK（多半是错误页/半截文件） */
    const val ERROR_INVALID = "invalid"
    /** 包里的版本号跟发布标签对不上 —— 装下去会变成别的版本 */
    const val ERROR_MISMATCH = "mismatch"
    /** 包不比当前装的版本新，装下去等于没更新 */
    const val ERROR_DOWNGRADE = "downgrade"
    /** 字节数跟 Release 里声明的不一致，文件残缺 */
    const val ERROR_TRUNCATED = "truncated"

    private class UpdateException(val code: String) : Exception(code)

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
     * 下载 APK 到 cacheDir/update 并校验。
     * @param onProgress 0~100，进度不可知时不会调用
     * @param onDone 成功给 (文件, null)；失败给 (null, 错误码)
     */
    fun download(
        context: Context,
        release: Release,
        onProgress: (Int) -> Unit,
        onDone: (File?, String?) -> Unit,
    ) {
        val appContext = context.applicationContext

        Thread {
            var file: File? = null
            var error: String? = null
            try {
                file = fetchApk(appContext, release, onProgress)
            } catch (e: UpdateException) {
                Log.w(TAG, "下载校验未通过：${e.code}")
                error = e.code
            } catch (t: Throwable) {
                Log.w(TAG, "下载更新失败", t)
                error = ERROR_NETWORK
            }

            val resultFile = file
            val resultError = error
            postToMain { onDone(resultFile, resultError) }
        }.start()
    }

    private fun fetchApk(context: Context, release: Release, onProgress: (Int) -> Unit): File {
        val root = File(context.cacheDir, APK_DIR)
        // 整个目录先清空：绝不留下上一次的安装包
        root.deleteRecursively()

        // 目录名 + 文件名都带上版本号 —— 每次更新的 content:// URI 都不一样。
        // 用固定路径的话，安装器（部分定制 ROM 尤其明显）会按 URI 复用上一次
        // 扫描/暂存过的那份包，于是“提示的是新版，装下去的却是旧版”，
        // 而且因为版本没变，下次进 app 又提示同一个新版，无限循环。
        val dir = File(root, safeFileName(release.version))
        dir.mkdirs()

        val target = File(dir, "lifelog.apk")

        val connection = (URL(release.assetUrl).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 30_000
            instanceFollowRedirects = true
            useCaches = false
            setRequestProperty("User-Agent", USER_AGENT)
            setRequestProperty("Cache-Control", "no-cache")
        }

        try {
            val code = connection.responseCode
            if (code != HttpURLConnection.HTTP_OK) {
                throw UpdateException(ERROR_NETWORK)
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
        } finally {
            connection.disconnect()
        }

        verify(context, target, release)
        return target
    }

    private fun safeFileName(version: String): String =
        version.replace(Regex("[^0-9A-Za-z._-]"), "_")

    /**
     * 拉起安装器前必须确认：这确实是一个比当前版本新的、与发布标签一致的 APK。
     * 不校验的话，一旦下载到旧包（缓存 / 代理 / 历史文件），
     * 就会变成「提示新版、装的是旧版」而且永远循环提示。
     */
    private fun verify(context: Context, apk: File, release: Release) {
        val length = apk.length()
        if (length <= 0L) throw UpdateException(ERROR_INVALID)
        if (release.size > 0 && length != release.size) {
            Log.w(TAG, "下载大小 ${length} ≠ Release 声明的 ${release.size}")
            throw UpdateException(ERROR_TRUNCATED)
        }

        val archive = context.packageManager.getPackageArchiveInfo(apk.absolutePath, 0)
            ?: throw UpdateException(ERROR_INVALID)

        val name = archive.versionName
        if (name != release.version) {
            Log.w(TAG, "包内 versionName=$name ≠ 发布标签 ${release.version}")
            throw UpdateException(ERROR_MISMATCH)
        }

        val code = PackageInfoCompat.getLongVersionCode(archive)
        val installed = installedVersionCode(context)
        if (code <= installed) {
            Log.w(TAG, "包内 versionCode=$code 不大于已安装的 $installed")
            throw UpdateException(ERROR_DOWNGRADE)
        }

        Log.i(TAG, "更新包已校验：$name (code $code)，$length 字节")
    }

    /** 当前已安装版本的 versionCode */
    fun installedVersionCode(context: Context): Long = try {
        PackageInfoCompat.getLongVersionCode(
            context.packageManager.getPackageInfo(context.packageName, 0)
        )
    } catch (t: Throwable) {
        0L
    }

    /** 当前已安装版本的 versionName */
    fun installedVersionName(context: Context): String = try {
        context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: ""
    } catch (t: Throwable) {
        ""
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
