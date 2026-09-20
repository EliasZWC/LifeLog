# Livolog 混淆规则
# 当前 release 未开启代码压缩，此处保留占位以便后续启用 minify 时补充规则。

# WebView 通过 JS 接口反射调用的类需要保留（后续新增 @JavascriptInterface 时记得加）
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
