package app.study.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.widget.Toast;
import java.io.FileInputStream;
import java.io.InputStream;
import java.net.URL;
import java.security.MessageDigest;
import javax.net.ssl.HttpsURLConnection;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** 可选的小检查；课程始终从包内资源打开。 */
final class AppUpdates {
    private final Activity activity;
    private volatile boolean checking;
    private boolean closed;
    AppUpdates(Activity activity) { this.activity = activity; }
    void close() { closed = true; }

    /** 文件的 SHA-256，小写十六进制，与网站公布的格式一致。 */
    static String sha256(java.io.File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(file)) {
            byte[] chunk = new byte[8192];
            int count;
            while ((count = input.read(chunk)) != -1) digest.update(chunk, 0, count);
        }
        StringBuilder hex = new StringBuilder(64);
        for (byte value : digest.digest()) hex.append(String.format("%02x", value));
        return hex.toString();
    }

    /** 截取哈希的一段，够在对话框里区分两个包即可。 */
    static String shortHash(String hash) {
        return hash == null ? "" : hash.length() <= 8 ? hash : hash.substring(0, 8);
    }

    /**
     * 判断已发布的 APK 与已安装的包是什么关系。
     *
     * 版本号故意写死：这个项目的历史会被重写，递增版本号只是在编一个没人看的
     * 故事。「有没有新东西」由文件本身回答：拿正在运行的 APK 哈希，和网站提供的
     * APK 哈希比一比。结论只有相同或不同，永远不会说谁更新——内容可能回滚后
     * 重新发布，这样判定才准确。因为 versionCode 从不变化，不同的包总能原地覆盖安装。
     */
    enum Status { SAME, DIFFERENT }

    static Status status(JSONObject release, String appId, String expectedUrl, String ownHash) throws Exception {
        if (!appId.equals(release.getString("applicationId"))
            || !expectedUrl.equals(release.getString("apkUrl")) || release.getLong("versionCode") < 1)
            throw new IllegalStateException("Invalid update information");
        String published = release.getString("sha256");
        if (published == null || !published.matches("[0-9a-f]{64}"))
            throw new IllegalStateException("Invalid update information");
        if (ownHash == null || !ownHash.matches("[0-9a-f]{64}")) return Status.SAME;
        return published.equals(ownHash) ? Status.SAME : Status.DIFFERENT;
    }

    private void openDownload(String url, String hash) {
        // 哈希同时用来破缓存：文件名永远不变，没有它的话
        // 浏览器或下载管理器可能直接返回已经存过的 APK。
        try { activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url + "?v=" + Uri.encode(shortHash(hash))))); }
        catch (ActivityNotFoundException error) { Toast.makeText(activity, R.string.update_no_browser, Toast.LENGTH_LONG).show(); }
    }

    @SuppressWarnings("deprecation")
    void check(boolean manual) {
        if (checking) {
            if (manual) Toast.makeText(activity, R.string.update_busy, Toast.LENGTH_SHORT).show();
            return;
        }
        checking = true;
        if (manual) Toast.makeText(activity, R.string.update_checking, Toast.LENGTH_SHORT).show();
        new Thread(() -> {
            HttpsURLConnection connection = null;
            try {
                // 已安装的文件自己说明身份：正在运行的 APK 的哈希。
                String current = sha256(new java.io.File(activity.getPackageCodePath()));
                connection = (HttpsURLConnection) new URL(BuildConfig.UPDATE_BASE_URL + "version.json?t=" + System.currentTimeMillis()).openConnection();
                connection.setConnectTimeout(8000);
                connection.setReadTimeout(8000);
                // 跟随跳转：站点换了域名（github.io 会 301 到自定义域名）时更新检查仍然可用。
                // HttpURLConnection 不会跨协议跳转，https 只会跳到 https。
                connection.setInstanceFollowRedirects(true);
                connection.setUseCaches(false);
                if (connection.getResponseCode() != 200) throw new IllegalStateException("Update information unavailable");
                URL served = connection.getURL();
                if (!"https".equals(served.getProtocol())) throw new IllegalStateException("Update information unavailable");
                byte[] bytes;
                try (java.io.InputStream input = connection.getInputStream();
                    java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream()) {
                    byte[] chunk = new byte[1024];
                    int count;
                    while ((count = input.read(chunk)) != -1) {
                        output.write(chunk, 0, count);
                        if (output.size() > 16384) throw new IllegalStateException("Update information too large");
                    }
                    bytes = output.toByteArray();
                }
                if (bytes.length > 16384) throw new IllegalStateException("Update information too large");
                JSONObject release = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
                // 安装包必须和 version.json 在同一个目录：跳转之后，以实际取到 version.json 的地址为准。
                String expectedUrl = new URL(served, BuildConfig.UPDATE_APK_NAME).toString();
                Status state = status(release, activity.getPackageName(), expectedUrl, current);
                String published = release.getString("sha256");
                activity.runOnUiThread(() -> {
                    if (closed || activity.isFinishing() || activity.isDestroyed()) return;
                    if (state == Status.DIFFERENT) {
                        // versionCode 相同、文件不同，可以原地覆盖安装，所以
                        // 措辞不能吓得用户去卸载。
                        new AlertDialog.Builder(activity).setTitle(R.string.update_available_title)
                            .setMessage(activity.getString(R.string.update_available_message, shortHash(current), shortHash(published)))
                            .setPositiveButton(R.string.update_download, (dialog, which) -> openDownload(expectedUrl, published))
                            .setNegativeButton(R.string.later, null).show();
                    } else if (manual) {
                        new AlertDialog.Builder(activity).setTitle(R.string.update_title)
                            .setMessage(activity.getString(R.string.update_latest, shortHash(current))).setPositiveButton(R.string.ok, null).show();
                    }
                });
            } catch (Exception error) {
                if (manual) activity.runOnUiThread(() -> {
                    if (!closed && !activity.isFinishing() && !activity.isDestroyed())
                        new AlertDialog.Builder(activity).setTitle(R.string.update_failed_title)
                            .setMessage(R.string.update_failed_message)
                            .setPositiveButton(R.string.ok, null).show();
                });
            } finally {
                if (connection != null) connection.disconnect();
                checking = false;
            }
        }, "app-update-check").start();
    }
}
