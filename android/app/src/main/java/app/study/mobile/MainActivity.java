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
        android.widget.LinearLayout content = new android.widget.LinearLayout(this);
        content.setOrientation(android.widget.LinearLayout.VERTICAL);
        android.widget.Button updateButton = new android.widget.Button(this);
        updateButton.setText("检查更新");
        updateButton.setOnClickListener(view -> updates.check(true));
        content.addView(updateButton, new android.widget.LinearLayout.LayoutParams(-1, -2));
        content.addView(web, new android.widget.LinearLayout.LayoutParams(-1, 0, 1));
        frame.addView(content, new FrameLayout.LayoutParams(-1, -1));
        setContentView(frame);
        if (Build.VERSION.SDK_INT >= 27) {
            getWindow().setNavigationBarColor(Color.rgb(247, 247, 242));
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }
        // Android 15 draws edge to edge. Keep lessons and bottom navigation clear of system bars/IME.
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
                catch (ActivityNotFoundException e) { fileCallback.onReceiveValue(null); fileCallback = null; notice("找不到文件选择器"); }
                return true;
            }
        });
        speech = new NativeSpeech(this, web);
        web.addJavascriptInterface(speech, "AndroidSpeech");
        web.addJavascriptInterface(new ProgressFiles(), "AndroidFiles");
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
        try {
            return asset(path);
        } catch (IOException first) {
            // Static export routes use directory indexes; never fetch missing local assets online.
            if (!path.substring(path.lastIndexOf('/') + 1).contains(".")) {
                try { return asset(path + "/index.html"); } catch (IOException ignored) { }
            }
            return missing();
        }
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
            : path.endsWith(".rsc") ? "text/x-component"
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
        catch (ActivityNotFoundException e) { notice("没有可打开此链接的应用"); }
    }

    private void goBack() {
        // WebView.canGoBack can lose SPA history after a reload; consult the document's history.
        web.evaluateJavascript("(() => { const home = location.pathname === '/' && !location.search && !location.hash;"
            + "if (!home && history.length > 1) { history.back(); return true; } return false; })()", wentBack -> {
            if ("true".equals(wentBack)) return;
            new AlertDialog.Builder(this).setMessage("退出学习？")
                .setPositiveButton("退出", (dialog, button) -> finish()).setNegativeButton("继续学习", null).show();
        });
    }
    @SuppressWarnings("deprecation") @Override public void onBackPressed() { goBack(); }
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
    private void notice(String text) { runOnUiThread(() -> Toast.makeText(this, text, Toast.LENGTH_LONG).show()); }

    public final class ProgressFiles {
        @JavascriptInterface public void saveJson(String content, String filename) {
            if (content == null || content.length() > 10 * 1024 * 1024) { notice("备份文件过大"); return; }
            runOnUiThread(() -> {
                if (pendingExport != null) { notice("请先完成上一次保存"); return; }
                pendingExport = content;
                String safeName = filename == null ? "study-progress.json" : filename.replaceAll("[^A-Za-z0-9._-]", "_");
                Intent picker = new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json")
                    .addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE, safeName);
                try { startActivityForResult(picker, EXPORT_FILE); }
                catch (ActivityNotFoundException e) { pendingExport = null; notice("找不到文件保存器"); }
            });
        }
    }

    @SuppressWarnings("deprecation") @Override protected void onActivityResult(int request, int result, Intent data) {
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
                notice("学习记录已保存");
            } catch (IOException e) { notice("保存失败，请重试"); }
        }
    }
}
