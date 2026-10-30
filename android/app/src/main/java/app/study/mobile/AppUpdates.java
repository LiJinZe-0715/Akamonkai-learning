package app.study.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.widget.Toast;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** Small optional check; courses always open from the bundled assets. */
final class AppUpdates {
    private final Activity activity;
    private volatile boolean checking;
    private boolean closed;
    AppUpdates(Activity activity) { this.activity = activity; }
    void close() { closed = true; }

    static int compareVersions(String candidate, String installed) {
        String format = "[0-9]+(?:\\.[0-9]+){1,2}";
        if (candidate == null || installed == null || candidate.length() > 80 || installed.length() > 80
            || !candidate.matches(format) || !installed.matches(format))
            throw new IllegalArgumentException("Invalid numeric version");
        String[] left = candidate.split("\\.");
        String[] right = installed.split("\\.");
        // New releases use two components; accept legacy three-component APKs too.
        for (int index = 0; index < Math.max(left.length, right.length); index++) {
            java.math.BigInteger a = new java.math.BigInteger(index < left.length ? left[index] : "0");
            java.math.BigInteger b = new java.math.BigInteger(index < right.length ? right[index] : "0");
            int order = a.compareTo(b);
            if (order != 0) return order;
        }
        return 0;
    }

    static boolean isNewer(JSONObject release, String appId, String expectedUrl, String current) throws Exception {
        if (!appId.equals(release.getString("applicationId"))
            || !expectedUrl.equals(release.getString("apkUrl")) || release.getLong("versionCode") < 1)
            throw new IllegalStateException("Invalid update information");
        return compareVersions(release.getString("versionName"), current) > 0;
    }

    @SuppressWarnings("deprecation") void check(boolean manual) {
        if (checking) {
            if (manual) Toast.makeText(activity, "正在检查更新，请稍候", Toast.LENGTH_SHORT).show();
            return;
        }
        checking = true;
        if (manual) Toast.makeText(activity, "正在检查更新…", Toast.LENGTH_SHORT).show();
        new Thread(() -> {
            HttpsURLConnection connection = null;
            try {
                PackageInfo installed = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
                String current = installed.versionName;
                connection = (HttpsURLConnection) new URL(BuildConfig.UPDATE_BASE_URL + "version.json?t=" + System.currentTimeMillis()).openConnection();
                connection.setConnectTimeout(8000);
                connection.setReadTimeout(8000);
                connection.setInstanceFollowRedirects(false);
                connection.setUseCaches(false);
                if (connection.getResponseCode() != 200) throw new IllegalStateException("Update information unavailable");
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
                String expectedUrl = BuildConfig.UPDATE_BASE_URL + BuildConfig.UPDATE_APK_NAME;
                boolean newer = isNewer(release, activity.getPackageName(), expectedUrl, current);
                String version = release.getString("versionName");
                activity.runOnUiThread(() -> {
                    if (closed || activity.isFinishing() || activity.isDestroyed()) return;
                    if (newer) {
                        new AlertDialog.Builder(activity).setTitle("发现新版本 " + version)
                            .setMessage("当前版本：" + installed.versionName + "\n下载后打开 APK，按系统提示安装更新。学习记录会保留，请勿先卸载 App。")
                            .setPositiveButton("下载更新", (dialog, which) -> {
                                try { activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(expectedUrl + "?v=" + Uri.encode(version)))); }
                                catch (ActivityNotFoundException error) { Toast.makeText(activity, "请先安装浏览器再下载更新", Toast.LENGTH_LONG).show(); }
                            }).setNegativeButton("稍后", null).show();
                    } else if (manual) {
                        new AlertDialog.Builder(activity).setTitle("检查更新")
                            .setMessage("已是最新版本：" + installed.versionName).setPositiveButton("确定", null).show();
                    }
                });
            } catch (Exception error) {
                if (manual) activity.runOnUiThread(() -> {
                    if (!closed && !activity.isFinishing() && !activity.isDestroyed())
                        new AlertDialog.Builder(activity).setTitle("暂时无法检查更新")
                            .setMessage("请检查网络，或稍后再试。首次发布前，网站上可能还没有版本信息；离线学习不受影响。")
                            .setPositiveButton("确定", null).show();
                });
            } finally {
                if (connection != null) connection.disconnect();
                checking = false;
            }
        }, "app-update-check").start();
    }
}
