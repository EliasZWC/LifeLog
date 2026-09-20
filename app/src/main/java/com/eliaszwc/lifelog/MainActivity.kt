package com.eliaszwc.lifelog

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.addCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader

/**
 * LifeLog 的网页套壳容器。
 *
 * 网页资源位于 `assets/www/`，通过 [WebViewAssetLoader] 以 https 源
 * `https://appassets.androidplatform.net/assets/www/` 提供，这样 localStorage
 * 等 Web API 可以正常工作（直接用 `file://` 会有诸多限制）。
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    private val assetLoader: WebViewAssetLoader by lazy {
        WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 全屏内容 + 自行处理系统栏内边距（targetSdk 35 起系统强制 edge-to-edge）
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        applySystemBarAppearance()

        setContentView(R.layout.activity_main)

        val root = findViewById<FrameLayout>(R.id.root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }

        webView = findViewById(R.id.web_view)
        configureWebView()

        // 返回键优先让网页回退历史
        onBackPressedDispatcher.addCallback(this) {
            if (webView.canGoBack()) {
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

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() = with(webView) {
        setBackgroundColor(Color.TRANSPARENT)
        isLongClickable = false
        setOnLongClickListener { true }

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
        }
    }

    /** 用系统浏览器 / 其它应用打开站外链接 */
    private fun openExternally(url: String): Boolean = try {
        startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url)))
        true
    } catch (_: ActivityNotFoundException) {
        true
    }

    private fun applySystemBarAppearance() {
        val nightMode = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = !nightMode
            isAppearanceLightNavigationBars = !nightMode
        }
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        applySystemBarAppearance()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    private companion object {
        const val APP_ASSETS_HOST = "appassets.androidplatform.net"
        const val WEB_ENTRY_URL = "https://appassets.androidplatform.net/assets/www/index.html"
    }
}
