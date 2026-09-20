package com.eliaszwc.lifelog

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.View
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.addCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.pm.PackageInfoCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.roundToInt

/**
 * LifeLog 的网页套壳容器。
 *
 * 网页资源位于 `assets/www/`，通过 [WebViewAssetLoader] 以 https 源
 * `https://appassets.androidplatform.net/assets/www/` 提供，这样 localStorage
 * 等 Web API 可以正常工作（直接用 `file://` 会有诸多限制）。
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    /**
     * 布局根视图。必须存成字段，并且**不能叫 rootView**：
     * - 在 `with(webView) { ... }` 作用域里写 `findViewById(...)` 会被解析成
     *   `webView.findViewById(...)`，从 WebView 往下找是找不到父级的根视图的；
     * - `View` 有 `getRootView()`，Kotlin 会暴露成合成属性 `rootView`，同名字段会被遮蔽。
     */
    private lateinit var layoutRoot: View

    /**
     * 应用内主题设置：`light` / `dark` / `system`。
     * 与网页端 localStorage 里的 `lifelog.theme` 保持同步，
     * 网页改设置时通过 [WebAppBridge.setThemeMode] 通知过来。
     */
    private var themeMode: String = THEME_SYSTEM

    /** 页面加载完成前不往网页里注入脚本 */
    private var pageReady = false

    /** 网页里 <input type="file"> 点开后，等系统选择器返回时要用 */
    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    /** 设置页「导出数据」：等系统「另存为」返回时要把这份 CSV 写进用户选的位置 */
    private var pendingExportCsv: String? = null

    /** 本次进入前台是否已经查过更新（GitHub API 有频次限制，不重复查） */
    private var updateChecked = false
    /** 更新弹窗还开着就不重置上面的标志，否则从安装器回来会又弹一次 */
    private var updateFlowActive = false
    /** 已发现的新版本 */
    private var pendingRelease: Updater.Release? = null
    /** 已下载好、可以安装的安装包 */
    private var downloadedApk: File? = null
    /** 正在下载，避免重复触发 */
    private var downloading = false

    private val openDocument =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = filePathCallback
            filePathCallback = null
            if (callback == null) {
                return@registerForActivityResult
            }
            val uri = if (result.resultCode == RESULT_OK) result.data?.data else null
            callback.onReceiveValue(if (uri != null) arrayOf(uri) else null)
        }

    /** 用系统「另存为」把数据导出成 CSV，用户取消就当什么都没发生 */
    private val createCsvDocument =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val csv = pendingExportCsv
            pendingExportCsv = null
            val uri = if (result.resultCode == RESULT_OK) result.data?.data else null

            if (csv == null) {
                return@registerForActivityResult
            }
            if (uri == null) {
                // 用户主动取消，不弹提示
                notifyExported(true, "")
                return@registerForActivityResult
            }
            writeExport(uri, csv)
        }

    private val assetLoader: WebViewAssetLoader by lazy {
        WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        CrashLog.install(this)

        // 上次启动崩过就把堆栈直接显示出来，没 adb 也能定位
        CrashLog.readAndClear(this)?.let { trace ->
            showDiagnostics(getString(R.string.diagnostics_last_crash), trace)
            return
        }

        try {
            startApp(savedInstanceState)
        } catch (t: Throwable) {
            Log.e(TAG, "启动失败", t)
            showDiagnostics(
                getString(R.string.diagnostics_start_failed),
                Log.getStackTraceString(t),
            )
        }
    }

    private fun startApp(savedInstanceState: Bundle?) {
        themeMode = readThemeMode()

        // 全屏内容；系统栏要让开多少交给网页自己决定（targetSdk 35 起系统强制 edge-to-edge）
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        applyTheme()

        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.web_view)
        configureWebView()

        // WebView 铺满整屏（包括状态栏与系统导航条区域），使遮罩、弹窗能盖住整屏
        layoutRoot = findViewById(R.id.root)
        ViewCompat.setOnApplyWindowInsetsListener(layoutRoot) { _, insets ->
            pushInsetsToWeb(insets)
            insets
        }

        // 返回键优先让网页回退历史
        onBackPressedDispatcher.addCallback(this) {
            if (::webView.isInitialized && webView.canGoBack()) {
                webView.goBack()
            } else {
                isEnabled = false
                onBackPressedDispatcher.onBackPressed()
            }
        }

        if (savedInstanceState == null) {
            webView.loadUrl(WEB_ENTRY_URL)
        }
    }

    /** 出问题时用最简单的控件把信息显示出来，而不是直接闪退 */
    private fun showDiagnostics(title: String, body: String) {
        val content = TextView(this).apply {
            text = title + "\n\n" + body
            textSize = 11f
            typeface = Typeface.MONOSPACE
            setTextIsSelectable(true)
            setTextColor(Color.BLACK)
            setBackgroundColor(Color.WHITE)
            setPadding(40, 80, 40, 40)
        }
        setContentView(ScrollView(this).apply { addView(content) })
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() = with(webView) {
        setBackgroundColor(Color.TRANSPARENT)
        isLongClickable = false
        setOnLongClickListener { true }
        addJavascriptInterface(
            WebAppBridge(
                onThemeMode = { mode -> runOnUiThread { setThemeMode(mode) } },
                onSaveCsv = { csv -> handleSaveCsv(csv) },
                onExportCsv = { csv -> runOnUiThread { handleExportCsv(csv) } },
                onDownloadUpdate = { runOnUiThread { startUpdateDownload() } },
                onInstallUpdate = { runOnUiThread { installDownloaded() } },
                onCloseUpdate = { runOnUiThread { closeUpdateFlow() } },
            ),
            JS_BRIDGE_NAME,
        )

        settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            // 只加载应用内置资源，关闭本地文件与内容提供器访问
            allowFileAccess = false
            allowContentAccess = false
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            mediaPlaybackRequiresUserGesture = true
            textZoom = 100
            cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
        }

        webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest,
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest,
            ): Boolean {
                val url = request.url
                // 站内（appassets 域名）导航留在 WebView 内
                if (url.host == APP_ASSETS_HOST) return false
                return openExternally(url.toString())
            }

            override fun onPageFinished(view: WebView, url: String?) {
                pageReady = true
                // 页面脚本就绪后把版本号、CSV 内容与内边距补发一次
                pushVersionToWeb()
                pushCsvToWeb()
                if (::layoutRoot.isInitialized) {
                    ViewCompat.requestApplyInsets(layoutRoot)
                }
                // 首次进入时 onResume 可能比页面更早就跑完了，这里补一次
                maybeCheckUpdate()
            }
        }

        // 网页里点 <input type="file"> 时拉起系统文件选择器（用于导入 CSV）
        webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?,
            ): Boolean {
                if (filePathCallback == null || fileChooserParams == null) {
                    return false
                }

                this@MainActivity.filePathCallback?.onReceiveValue(null)
                this@MainActivity.filePathCallback = filePathCallback

                return try {
                    openDocument.launch(fileChooserParams.createIntent())
                    true
                } catch (t: Throwable) {
                    Log.w(TAG, "拉起文件选择器失败", t)
                    this@MainActivity.filePathCallback = null
                    false
                }
            }
        }
    }

    // -----------------------------------------------------------------------
    // 与网页同步
    // -----------------------------------------------------------------------

    private fun evaluateInWeb(script: String) {
        // 页面没就绪时注入没有意义，也容易出问题
        if (!pageReady || !::webView.isInitialized) return
        try {
            webView.evaluateJavascript(script, null)
        } catch (t: Throwable) {
            Log.w(TAG, "evaluateJavascript 失败", t)
        }
    }

    private fun toDp(pixels: Int): Int = (pixels / resources.displayMetrics.density).roundToInt()

    /**
     * 把系统栏与输入法尺寸按 dp 推给网页（CSS 像素即 dp）。
     * 网页用它给内容让位；键盘高度单独给，好让表单整体上移。
     */
    private fun pushInsetsToWeb(insets: WindowInsetsCompat) {
        val bars = insets.getInsets(
            WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
        )
        val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom

        evaluateInWeb(
            "window.LifeLogShell && window.LifeLogShell.setInsets(" +
                "${toDp(bars.top)}, ${toDp(bars.right)}, ${toDp(bars.bottom)}, " +
                "${toDp(bars.left)}, ${toDp(keyboard)});"
        )
    }

    /** 版本号只在 build.gradle.kts 里维护，这里读系统的值传给网页显示 */
    private fun pushVersionToWeb() {
        val info: PackageInfo = try {
            packageManager.getPackageInfo(packageName, 0)
        } catch (_: Exception) {
            return
        }

        val name = info.versionName ?: return
        val code = PackageInfoCompat.getLongVersionCode(info)
        evaluateInWeb("window.LifeLogShell && window.LifeLogShell.setVersion(\"$name\", $code);")
    }

    /** 把 LifeLog 目录里的 CSV 内容与路径推给网页（文件不存在时内容为空串） */
    private fun pushCsvToWeb() {
        val context = applicationContext
        Thread {
            val csv = CsvStore.read(context) ?: ""
            val path = CsvStore.describe(context)
            runOnUiThread {
                evaluateInWeb(
                    "window.LifeLogShell && window.LifeLogShell.onStorageReady(" +
                        "${JSONObject.quote(csv)}, ${JSONObject.quote(path)});"
                )
            }
        }.start()
    }

    /** 网页把最新的 CSV 交过来落盘，成功与否回推给网页 */
    private fun handleSaveCsv(csv: String) {
        val context = applicationContext
        Thread {
            var ok = false
            var detail = "unknown error"
            try {
                detail = CsvStore.write(context, csv)
                ok = true
            } catch (t: Throwable) {
                Log.w(TAG, "写 CSV 失败", t)
                detail = t.message ?: "unknown error"
            }
            runOnUiThread {
                evaluateInWeb(
                    "window.LifeLogShell && window.LifeLogShell.onCsvSaved(" +
                        "$ok, ${JSONObject.quote(detail)});"
                )
            }
        }.start()
    }

    /** 用系统浏览器 / 其它应用打开站外链接 */
    private fun openExternally(url: String): Boolean = try {
        startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url)))
        true
    } catch (_: ActivityNotFoundException) {
        true
    }

    // -----------------------------------------------------------------------
    // 导出数据
    // -----------------------------------------------------------------------

    /** 设置页「导出数据」：弹系统「另存为」让用户选位置 */
    private fun handleExportCsv(csv: String) {
        pendingExportCsv = csv

        val stamp = SimpleDateFormat("yyyyMMdd-HHmm", Locale.US).format(Date())
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = CsvStore.MIME
            putExtra(Intent.EXTRA_TITLE, "lifelog-$stamp.csv")
        }

        try {
            createCsvDocument.launch(intent)
        } catch (t: Throwable) {
            Log.w(TAG, "拉起导出选择器失败", t)
            pendingExportCsv = null
            notifyExported(false, t.message ?: "no-picker")
        }
    }

    /** 把 CSV 写进「另存为」选中的文档 */
    private fun writeExport(uri: Uri, csv: String) {
        val resolver = applicationContext.contentResolver
        Thread {
            var ok = false
            var detail = uri.lastPathSegment ?: "csv"
            try {
                val stream = resolver.openOutputStream(uri)
                    ?: throw IllegalStateException("openOutputStream 返回 null")
                stream.use {
                    it.write(csv.toByteArray(Charsets.UTF_8))
                    it.flush()
                }
                ok = true
            } catch (t: Throwable) {
                Log.w(TAG, "导出 CSV 失败", t)
                detail = t.message ?: "unknown error"
            }
            runOnUiThread { notifyExported(ok, detail) }
        }.start()
    }

    private fun notifyExported(ok: Boolean, detail: String) {
        evaluateInWeb(
            "window.LifeLogShell && window.LifeLogShell.onExported(" +
                "$ok, ${JSONObject.quote(detail)});"
        )
    }

    // -----------------------------------------------------------------------
    // 应用内更新
    // -----------------------------------------------------------------------

    override fun onResume() {
        super.onResume()
        maybeCheckUpdate()
    }

    override fun onStop() {
        super.onStop()
        // 退到后台再回来算「重新进入 app」；更新流程进行中不重置，
        // 否则从系统安装器切回来会又弹一次窗。
        if (!updateFlowActive) {
            updateChecked = false
        }
    }

    /** 每次进入前台只查一次；页面还没就绪时什么都不做，等 onPageFinished 再来 */
    private fun maybeCheckUpdate() {
        if (updateChecked || updateFlowActive || !pageReady) return
        updateChecked = true

        Updater.check(this) { release ->
            if (release == null || updateFlowActive) return@check

            pendingRelease = release
            updateFlowActive = true

            val localVersion = try {
                packageManager.getPackageInfo(packageName, 0).versionName ?: ""
            } catch (_: Exception) {
                ""
            }

            evaluateInWeb(
                "window.LifeLogShell && window.LifeLogShell.onUpdateAvailable(" +
                    "${JSONObject.quote(release.version)}, " +
                    "${JSONObject.quote(localVersion)}, " +
                    "${JSONObject.quote(Updater.formatSize(release.size))});"
            )
        }
    }

    /** 网页点了「更新」：开始下载新版 APK */
    private fun startUpdateDownload() {
        val release = pendingRelease ?: return
        if (downloading) return
        downloading = true

        Updater.download(
            this,
            release.assetUrl,
            onProgress = { percent ->
                evaluateInWeb(
                    "window.LifeLogShell && window.LifeLogShell.onUpdateProgress($percent);"
                )
            },
            onDone = { file ->
                downloading = false
                if (file == null) {
                    updateFlowActive = false
                    notifyUpdateFailed(Updater.ERROR_NETWORK, downloaded = false)
                    return@download
                }
                downloadedApk = file
                installDownloaded()
            },
        )
    }

    /** 安装已下好的包（也可能是上次被权限拦下后的重试） */
    private fun installDownloaded() {
        val apk = downloadedApk ?: return

        val error = Updater.install(this, apk)
        if (error == null) {
            evaluateInWeb("window.LifeLogShell && window.LifeLogShell.onUpdateReady();")
        } else {
            notifyUpdateFailed(error, downloaded = true)
        }
    }

    private fun notifyUpdateFailed(reason: String, downloaded: Boolean) {
        evaluateInWeb(
            "window.LifeLogShell && window.LifeLogShell.onUpdateFailed(" +
                "${JSONObject.quote(reason)}, $downloaded);"
        )
    }

    /** 弹窗被关掉：清干净状态，下次进入 app 可以重新检查 */
    private fun closeUpdateFlow() {
        updateFlowActive = false
        pendingRelease = null
        downloadedApk = null
    }

    // -----------------------------------------------------------------------
    // 主题
    // -----------------------------------------------------------------------

    private fun readThemeMode(): String =
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
            .getString(KEY_THEME_MODE, THEME_SYSTEM)
            ?.takeIf { it in THEME_MODES }
            ?: THEME_SYSTEM

    private fun isDarkAppearance(): Boolean = when (themeMode) {
        THEME_LIGHT -> false
        THEME_DARK -> true
        else -> (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES
    }

    /** 把当前主题落到窗口背景与状态栏／导航栏图标颜色上 */
    private fun applyTheme() {
        val dark = isDarkAppearance()
        try {
            window.setBackgroundDrawableResource(
                if (dark) R.color.app_background_dark else R.color.app_background_light
            )
            WindowInsetsControllerCompat(window, window.decorView).apply {
                isAppearanceLightStatusBars = !dark
                isAppearanceLightNavigationBars = !dark
            }
        } catch (t: Throwable) {
            // 纯外观问题，绝不能因此崩溃
            Log.w(TAG, "应用主题失败", t)
        }
    }

    private fun setThemeMode(mode: String) {
        val normalized = if (mode in THEME_MODES) mode else THEME_SYSTEM
        if (normalized == themeMode) return

        themeMode = normalized
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
            .edit()
            .putString(KEY_THEME_MODE, themeMode)
            .apply()
        applyTheme()
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        // 「跟随系统」时系统深浅色切换需要重新解析
        applyTheme()
    }

    override fun onDestroy() {
        if (::webView.isInitialized) {
            webView.destroy()
        }
        super.onDestroy()
    }

    private companion object {
        const val TAG = "LifeLog"

        const val APP_ASSETS_HOST = "appassets.androidplatform.net"
        const val WEB_ENTRY_URL = "https://appassets.androidplatform.net/assets/www/index.html"

        const val JS_BRIDGE_NAME = "LifeLogNative"

        const val PREFS_NAME = "lifelog"
        const val KEY_THEME_MODE = "theme_mode"

        const val THEME_LIGHT = "light"
        const val THEME_DARK = "dark"
        const val THEME_SYSTEM = "system"
        val THEME_MODES = listOf(THEME_LIGHT, THEME_DARK, THEME_SYSTEM)
    }
}
