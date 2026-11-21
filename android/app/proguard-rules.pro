# 网页通过 addJavascriptInterface 调用这些方法（AndroidSpeech / AndroidFiles）。
# R8 看不到 JS 侧的调用，不保留就会被当成死代码删掉或改名，网页里调用时静默失败。
-keepclassmembers class app.study.mobile.** {
    @android.webkit.JavascriptInterface <methods>;
}
# R8 只认标准的属性名；JavascriptInterface 不是属性名，写了会被忽略。
-keepattributes RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations
