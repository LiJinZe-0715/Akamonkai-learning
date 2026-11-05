package app.study.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.WindowInsets;
import android.view.View;
import android.view.KeyEvent;
import android.widget.Toast;
import android.widget.FrameLayout;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;

// minSdk 26：startActivityForResult、onBackPressed、setSystemUiVisibility 等在新系统上已标记过时，
// 但旧系统只有它们。整类压掉 javac 的过时提示，否则每次打包都会打印一段（在中文 Windows 上还是乱码）。
@SuppressWarnings("deprecation")
public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final int IMPORT_FILE = 1, EXPORT_FILE = 2;
    private WebView web;
    private NativeSpeech speech;
    private AppUpdates updates;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingExport;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(247, 247, 242));
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(Color.rgb(247, 247, 242));
        updates = new AppUpdates(this);
        // 「检查更新」在网页的设置页里，通过 AndroidApp.checkUpdates() 调过来；壳本身不再占一行按钮。
        frame.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(frame);
        if (Build.VERSION.SDK_INT >= 27) {
            getWindow().setNavigationBarColor(Color.rgb(247, 247, 242));
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }
        // Android 15 会绘制到屏幕边缘；课文和底部导航要避开系统栏与输入法。
        if (Build.VERSION.SDK_INT >= 30) {
            frame.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars()
                    | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                return insets;
            });
        } else {
            frame.setFitsSystemWindows(true);
        }
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return localAsset(request.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isLocal(uri)) return false;
                if (request.isForMainFrame()) openExternal(uri);
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                speech.notifyVoices();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("application/json")
                    .addCategory(Intent.CATEGORY_OPENABLE);
                try { startActivityForResult(picker, IMPORT_FILE); }
                catch (ActivityNotFoundException e) { fileCallback.onReceiveValue(null); fileCallback = null; notice(R.string.no_file_picker); }
                return true;
            }
        });
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true);
        speech = new NativeSpeech(this, web);
        web.addJavascriptInterface(speech, "AndroidSpeech");
        web.addJavascriptInterface(new ProgressFiles(), "AndroidFiles");
        web.addJavascriptInterface(new AppBridge(), "AndroidApp");
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(0, this::goBack);
        }
        if (state == null || web.restoreState(state) == null) web.loadUrl("https://" + HOST + "/");
        if (state == null) updates.check(false);
    }

    private static boolean isLocal(Uri uri) {
        return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost()) && uri.getPort() == -1;
    }

    private WebResourceResponse localAsset(Uri uri) {
        if (!isLocal(uri)) return null;
        String path = uri.getPath();
        if (path == null || path.contains("..") || path.contains("\\")) return missing();
        path = path.substring(1);
        if (path.isEmpty() || path.endsWith("/")) path += "index.html";
        // 单页应用：路由全在查询串里，路径只有 / 和静态文件。缺的文件绝不去网上取。
        try { return asset(path); } catch (IOException absent) { return missing(); }
    }

    private WebResourceResponse asset(String path) throws IOException {
        String mime = path.endsWith(".html") ? "text/html"
            : path.endsWith(".js") || path.endsWith(".mjs") ? "text/javascript"
            : path.endsWith(".css") ? "text/css"
            : path.endsWith(".json") ? "application/json"
            : path.endsWith(".svg") ? "image/svg+xml"
            : path.endsWith(".png") ? "image/png"
            : path.endsWith(".jpg") || path.endsWith(".jpeg") ? "image/jpeg"
            : path.endsWith(".webp") ? "image/webp"
            : path.endsWith(".woff2") ? "font/woff2"
            : path.endsWith(".txt") ? "text/plain" : "application/octet-stream";
        return new WebResourceResponse(mime, "UTF-8", 200, "OK",
            Map.of("Cache-Control", "no-cache", "X-Content-Type-Options", "nosniff"), getAssets().open("public/" + path));
    }

    private WebResourceResponse missing() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", Map.of(),
            new ByteArrayInputStream("Missing bundled resource".getBytes(StandardCharsets.UTF_8)));
    }

    private void openExternal(Uri uri) {
        if (!"https".equals(uri.getScheme()) && !"http".equals(uri.getScheme()) && !"mailto".equals(uri.getScheme())) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
        catch (ActivityNotFoundException e) { notice(R.string.no_link_app); }
    }

    /** 三条返回路径（OnBackInvokedCallback、dispatchKeyEvent、onBackPressed）可能同时到达。 */
    private long lastBackAt = 0;

    private void goBack() {
        // 同一次按键只处理一次：否则会一次退两页。
        long now = System.currentTimeMillis();
        if (now - lastBackAt < 400) return;
        lastBackAt = now;
        // 重载后 WebView.canGoBack 可能丢失 SPA 的历史记录，改查文档自身的 history。
        web.evaluateJavascript("(() => { const home = location.pathname === '/' && !location.search && !location.hash;"
            + "if (!home && history.length > 1) { history.back(); return true; } return false; })()", wentBack -> {
            if ("true".equals(wentBack)) return;
            new AlertDialog.Builder(this).setMessage(R.string.exit_prompt)
                .setPositiveButton(R.string.exit, (dialog, button) -> finish()).setNegativeButton(R.string.keep_studying, null).show();
        });
    }
    @Override public void onBackPressed() { goBack(); }
    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK) {
            if (event.getAction() == KeyEvent.ACTION_UP && !event.isCanceled()) goBack();
            return true;
        }
        return super.dispatchKeyEvent(event);
    }
    @Override protected void onSaveInstanceState(Bundle state) { web.saveState(state); super.onSaveInstanceState(state); }
    @Override protected void onPause() {
        web.evaluateJavascript("window.speechSynthesis && window.speechSynthesis.cancel()", null);
        speech.stop();
        web.onPause();
        super.onPause();
    }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    @Override protected void onDestroy() {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        updates.close();
        speech.shutdown();
        web.destroy();
        super.onDestroy();
    }
    private void notice(int text) { runOnUiThread(() -> Toast.makeText(this, text, Toast.LENGTH_LONG).show()); }

    /** 网页设置页里的「检查更新」。JS 接口跑在后台线程，提示要回到主线程弹。 */
    public final class AppBridge {
        @JavascriptInterface public void checkUpdates() {
            runOnUiThread(() -> updates.check(true));
        }
    }

    public final class ProgressFiles {
        @JavascriptInterface public void saveJson(String content, String filename) {
            if (content == null || content.length() > 10 * 1024 * 1024) { notice(R.string.backup_too_large); return; }
            runOnUiThread(() -> {
                if (pendingExport != null) { notice(R.string.save_pending); return; }
                pendingExport = content;
                String safeName = filename == null ? "study-progress.json" : filename.replaceAll("[^A-Za-z0-9._-]", "_");
                Intent picker = new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json")
                    .addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE, safeName);
                try { startActivityForResult(picker, EXPORT_FILE); }
                catch (ActivityNotFoundException e) { pendingExport = null; notice(R.string.no_file_saver); }
            });
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == IMPORT_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(result == RESULT_OK && data != null && data.getData() != null
                ? new Uri[]{data.getData()} : null);
            fileCallback = null;
        }
        if (request == EXPORT_FILE) {
            String content = pendingExport;
            pendingExport = null;
            if (result != RESULT_OK || data == null || data.getData() == null || content == null) return;
            try (OutputStream stream = getContentResolver().openOutputStream(data.getData(), "wt")) {
                if (stream == null) throw new IOException("No output stream");
                stream.write(content.getBytes(StandardCharsets.UTF_8));
                notice(R.string.saved);
            } catch (IOException e) { notice(R.string.save_failed); }
        }
    }
}
