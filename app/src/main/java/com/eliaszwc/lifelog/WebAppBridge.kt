package com.eliaszwc.lifelog

import android.webkit.JavascriptInterface

/**
 * 暴露给网页的接口，实例名见 `MainActivity.JS_BRIDGE_NAME`。
 *
 * 注意必须是 **public 的顶层类**：Android 的 JS 桥是用反射查找并调用
 * `@JavascriptInterface` 方法的，放在 private 内部类里在部分系统上会调用失败。
 * 回调里只做转交，避免把 Activity 的引用泄漏进 JS 层。
 */
class WebAppBridge(private val onThemeMode: (String) -> Unit) {

    @JavascriptInterface
    fun setThemeMode(mode: String) {
        onThemeMode(mode)
    }
}
