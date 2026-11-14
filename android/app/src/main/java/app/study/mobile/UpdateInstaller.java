package app.study.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.IntentSender;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.widget.Toast;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.security.MessageDigest;
import java.util.Locale;
import javax.net.ssl.HttpsURLConnection;

/**
 * 应用内下载更新包，再交给系统安装器。
 *
 * 普通应用没有静默安装的权限，能做到的只有「自己下载、自己校验、自己拉起系统安装器」；
 * 系统确认界面上那一次点击跳不过去，但用户不用再打开浏览器去找下好的文件。
 *
 * 字节直接写进 PackageInstaller 会话，不落成文件：不要存储权限，不引 FileProvider，
 * 校验不过也留不下一个几十 MB 的残包。
 */
final class UpdateInstaller {
    /** 下载走不通时的退路：把地址交给浏览器。 */
    interface BrowserFallback { void open(String url, String hash); }

    private static final String CHANNEL = "app-updates";
    private static final String ACTION_CANCEL = BuildConfig.APPLICATION_ID + ".update.CANCEL";
    private static final String ACTION_RESULT = BuildConfig.APPLICATION_ID + ".update.RESULT";
    private static final int NOTIFICATION = 1;

    private final Activity activity;
    private final BrowserFallback fallback;
    private final BroadcastReceiver receiver;
    private volatile boolean running;
    private volatile boolean cancelled;
    private volatile boolean closed;
    /** 等「允许安装未知应用」授权回来之后要接着做的事。 */
    private String pendingUrl;
    private String pendingHash;
    /** 系统安装器交回来的确认界面；App 在后台时只能由用户点通知拉起。 */
    private volatile Intent confirmation;
    // 下载线程与安装结果回调都会刷新通知，节流标记要跨线程可见。
    private volatile int shownPercent = -1;
    private long shownBytes;
    /** Activity 是否在前台（onResume 与 onPause 之间）。只在主线程读写。 */
    private boolean foreground;
    /** 这次更新的确认界面已经拉起过：从它返回时不再重复弹。只在主线程读写。 */
    private boolean confirmationLaunched;

    UpdateInstaller(Activity activity, BrowserFallback fallback) {
        this.activity = activity;
        this.fallback = fallback;
        this.receiver = new ResultReceiver();
        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_CANCEL);
        filter.addAction(ACTION_RESULT);
        // 只在进程内收发：取消与安装结果都是本应用自己发的。
        if (Build.VERSION.SDK_INT >= 33) activity.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else activity.registerReceiver(receiver, filter);
        // 装完新包时进程会被系统杀掉，那条「等待确认安装」的通知来不及撤，这里补一刀。
        cancelNotification();
    }

    boolean busy() { return running || pendingUrl != null; }

    /** 入口：没授权就先要授权，授权过了直接开始下载。 */
    void start(String url, String hash) {
        if (busy()) { toast(R.string.update_progress_busy); return; }
        if (!activity.getPackageManager().canRequestPackageInstalls()) {
            pendingUrl = url;
            pendingHash = hash;
            askInstallPermission();
            return;
        }
        requestNotificationPermission();
        download(url, hash);
    }

    /** 从系统设置页回来：授权过了就接着下，没授权就明说。 */
    void resume() {
        foreground = true;
        // 后台下载完、又没有通知可点（通知权限被拒）时，确认界面留到回到前台这一刻再弹。
        launchConfirmation();
        if (pendingUrl == null) return;
        String url = pendingUrl, hash = pendingHash;
        clearPendingInstall();
        if (activity.getPackageManager().canRequestPackageInstalls()) {
            requestNotificationPermission();
            download(url, hash);
        } else {
            toast(R.string.update_permission_denied);
        }
    }

    void close() {
        closed = true;
        cancelled = true;
        try { activity.unregisterReceiver(receiver); } catch (IllegalArgumentException notRegistered) { /* 已注销 */ }
        cancelNotification();
    }

    // ---- 授权 ----

    private void askInstallPermission() {
        new AlertDialog.Builder(activity).setTitle(R.string.update_permission_title)
            .setMessage(R.string.update_permission_message)
            .setPositiveButton(R.string.update_permission_settings, (dialog, which) -> openInstallSettings())
            .setNegativeButton(R.string.later, (dialog, which) -> clearPendingInstall())
            // 返回键或点框外关闭也要清掉待办，否则 busy() 一直为真，检查更新卡在「正在进行」。
            .setOnCancelListener(dialog -> clearPendingInstall())
            .show();
    }

    void pause() { foreground = false; }

    /**
     * 拉起系统的安装确认界面。只在前台做：Android 10 起后台不许直接拉起界面。
     * 判断用的是 Activity 的前后台状态而不是窗口焦点——下拉通知栏、弹着对话框时
     * 窗口没有焦点，但 Activity 仍在前台，照样可以拉起。
     */
    private void launchConfirmation() {
        Intent confirm = confirmation;
        if (confirm == null || confirmationLaunched || !foreground
            || closed || activity.isFinishing() || activity.isDestroyed()) return;
        confirmationLaunched = true;
        try { activity.startActivity(confirm); }
        // 没拉起来就当没弹过，下次回到前台再试；通知上的入口也还在。
        catch (RuntimeException blocked) { confirmationLaunched = false; }
    }

    private void clearPendingInstall() {
        pendingUrl = null;
        pendingHash = null;
    }

    private void openInstallSettings() {
        Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:" + activity.getPackageName()));
        try { activity.startActivity(settings); }
        catch (RuntimeException unsupported) {
            // 少数 ROM 没有这一页：退化成让用户自己用浏览器装。
            String url = pendingUrl, hash = pendingHash;
            clearPendingInstall();
            toast(R.string.update_permission_missing);
            if (url != null) fallback.open(url, hash);
        }
    }

    /** Android 13 起通知要运行时授权；不给也继续下载，只是看不到进度。 */
    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT < 33) return;
        if (activity.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED) return;
        activity.requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION);
    }

    // ---- 下载与安装 ----

    private void download(String url, String hash) {
        running = true;
        cancelled = false;
        confirmation = null;
        confirmationLaunched = false;
        shownPercent = -1;
        shownBytes = 0;
        toast(R.string.update_started);
        new Thread(() -> {
            HttpsURLConnection connection = null;
            PackageInstaller.Session session = null;
            try {
                connection = open(url, hash);
                long total = connection.getContentLengthLong();
                session = openSession(total);
                String actual = copy(connection.getInputStream(), session, total);
                if (!hash.equals(actual)) throw new IOException("Update content does not match");
                session.commit(resultSender());
                session = null;
                waitingForInstall();
            } catch (Cancelled cancelledDownload) {
                abandon(session);
                cancelNotification();
                toast(R.string.update_cancelled);
            } catch (Exception error) {
                abandon(session);
                failed(url, hash);
            } finally {
                if (connection != null) connection.disconnect();
                running = false;
            }
        }, "app-update-download").start();
    }

    private HttpsURLConnection open(String url, String hash) throws IOException {
        // 哈希同时用来破缓存：文件名永远不变，没有它的话 CDN 可能直接给出旧包。
        String address = url + "?v=" + Uri.encode(AppUpdates.shortHash(hash));
        HttpsURLConnection connection = (HttpsURLConnection) URI.create(address).toURL().openConnection();
        connection.setConnectTimeout(8000);
        connection.setReadTimeout(15000);
        // 站点换域名时 github.io 会 301；HttpURLConnection 只跟随同协议跳转，https 不会掉到 http。
        connection.setInstanceFollowRedirects(true);
        connection.setUseCaches(false);
        if (connection.getResponseCode() != 200) throw new IOException("Update is unavailable");
        if (!"https".equals(connection.getURL().getProtocol())) throw new IOException("Update must be served over HTTPS");
        return connection;
    }

    private PackageInstaller.Session openSession(long total) throws IOException {
        PackageInstaller installer = activity.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params =
            new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(activity.getPackageName());
        if (total > 0) params.setSize(total);
        return installer.openSession(installer.createSession(params));
    }

    /** 边写会话边算哈希；返回整包的 sha256，长度或哈希不对由调用方丢弃会话。 */
    private String copy(InputStream raw, PackageInstaller.Session session, long total) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        long done = 0;
        try (InputStream input = raw; OutputStream output = session.openWrite("base.apk", 0, total > 0 ? total : -1)) {
            byte[] chunk = new byte[64 * 1024];
            int count;
            while ((count = input.read(chunk)) != -1) {
                if (cancelled || closed) throw new Cancelled();
                output.write(chunk, 0, count);
                digest.update(chunk, 0, count);
                done += count;
                progress(done, total);
            }
            output.flush();
            session.fsync(output);
        }
        // 提前断流时哈希必然不对，这里先给一个更直白的理由。
        if (!complete(done, total)) throw new IOException("Update is shorter than announced");
        return hex(digest.digest());
    }

    private IntentSender resultSender() {
        Intent intent = new Intent(ACTION_RESULT).setPackage(activity.getPackageName());
        // 安装结果由系统往这个 Intent 里填 extra，31 起必须显式声明可变。
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
            | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
        return PendingIntent.getBroadcast(activity, 0, intent, flags).getIntentSender();
    }

    private void abandon(PackageInstaller.Session session) {
        if (session == null) return;
        try { session.abandon(); } catch (RuntimeException gone) { /* 会话已被系统回收 */ }
    }

    // ---- 通知与提示 ----

    private void progress(long done, long total) {
        int percent = percent(done, total);
        // 已知总长按 1% 节流，未知总长按 1 MB 节流：九十兆的包不能每 64 KB 刷一次通知。
        if (percent >= 0) {
            if (percent == shownPercent) return;
        } else if (done - shownBytes < 1024 * 1024) return;
        shownPercent = percent;
        shownBytes = done;
        post(notification()
            .setProgress(100, Math.max(percent, 0), percent < 0)
            .setContentText(percent >= 0
                ? percent + "% · " + megabytes(done) + " / " + megabytes(total)
                : megabytes(done))
            .setOngoing(true)
            .build());
    }

    /** 已交给系统：通知不再是进度条，改为提醒用户去系统界面上确认。 */
    private void waitingForInstall() {
        shownPercent = -1;
        Notification.Builder builder = notification().setOngoing(false).setAutoCancel(true)
            .setProgress(0, 0, false)
            .setContentText(activity.getString(R.string.update_notification_waiting));
        // 安装回调可能比下载线程先到，两条路径都读当前保存的确认界面，先到的那条不会被后到的覆盖掉。
        Intent confirm = confirmation;
        if (confirm != null) builder.setContentIntent(confirmationSender(confirm));
        post(builder.build());
    }

    private Notification.Builder notification() {
        channel();
        // 图标复用系统的下载图标：一个只在通知栏露面的进度条不值得往包里塞一份素材。
        Icon icon = Icon.createWithResource(activity, android.R.drawable.stat_sys_download);
        return new Notification.Builder(activity, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle(activity.getString(R.string.update_notification_title))
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .addAction(new Notification.Action.Builder(icon, activity.getString(R.string.update_cancel), cancelSender()).build());
    }

    private void channel() {
        NotificationManager manager = activity.getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL,
            activity.getString(R.string.update_channel), NotificationManager.IMPORTANCE_LOW);
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    private PendingIntent cancelSender() {
        Intent intent = new Intent(ACTION_CANCEL).setPackage(activity.getPackageName());
        return PendingIntent.getBroadcast(activity, 1, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_IMMUTABLE : 0));
    }

    /** 系统给的确认界面挂到通知上：后台下载完成时，点击通知是拉起它的合法入口。 */
    private PendingIntent confirmationSender(Intent confirm) {
        // 从通知启动相当于非 Activity context，必须带 NEW_TASK；复制一份，不改系统传来的 Intent。
        Intent intent = new Intent(confirm).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
            | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getActivity(activity, 2, intent, flags);
    }

    /** 没授权通知时 notify 会被静默丢掉，这里先看一眼，免得白忙。 */
    private void post(Notification notification) {
        if (Build.VERSION.SDK_INT >= 33 && activity.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager manager = activity.getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(NOTIFICATION, notification);
    }

    private void cancelNotification() {
        NotificationManager manager = activity.getSystemService(NotificationManager.class);
        if (manager != null) manager.cancel(NOTIFICATION);
    }

    private void failed(String url, String hash) {
        cancelNotification();
        activity.runOnUiThread(() -> {
            if (closed || activity.isFinishing() || activity.isDestroyed()) return;
            new AlertDialog.Builder(activity).setTitle(R.string.update_download_failed_title)
                .setMessage(R.string.update_download_failed_message)
                .setPositiveButton(R.string.update_use_browser, (dialog, which) -> fallback.open(url, hash))
                .setNegativeButton(R.string.later, null).show();
        });
    }

    private void toast(int text) {
        activity.runOnUiThread(() -> {
            if (!closed) Toast.makeText(activity, text, Toast.LENGTH_SHORT).show();
        });
    }

    // ---- 纯计算，便于在设备上单测 ----

    /** 未知总长时返回 -1，调用方据此改成不确定进度条。 */
    static int percent(long done, long total) {
        if (total <= 0) return -1;
        long value = done * 100 / total;
        return (int) Math.max(0, Math.min(100, value));
    }

    /** 服务器没给 Content-Length 时无从比较，按「完整」处理。 */
    static boolean complete(long received, long declared) {
        return declared <= 0 || received == declared;
    }

    static String megabytes(long bytes) {
        return String.format(Locale.ROOT, "%.1f MB", bytes / 1048576.0);
    }

    static String hex(byte[] digest) {
        StringBuilder text = new StringBuilder(digest.length * 2);
        for (byte value : digest) text.append(String.format("%02x", value));
        return text.toString();
    }

    private static final class Cancelled extends IOException {
        private static final long serialVersionUID = 1L;
    }

    private final class ResultReceiver extends BroadcastReceiver {
        @SuppressWarnings("deprecation")
        @Override public void onReceive(Context context, Intent intent) {
            if (ACTION_CANCEL.equals(intent.getAction())) { cancelled = true; return; }
            if (!ACTION_RESULT.equals(intent.getAction())) return;
            int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
            if (status == PackageInstaller.STATUS_SUCCESS) { confirmation = null; cancelNotification(); return; }
            if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                // 系统安装器把确认界面交回给我们启动，这一步不做就什么都不会弹。
                Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
                if (confirm == null) return;
                confirmation = confirm;
                // Android 10 起后台不许直接拉起界面：先把入口挂到通知上；在前台就立刻弹，
                // 在后台就留着，回到前台时由 resume() 弹。
                waitingForInstall();
                launchConfirmation();
                return;
            }
            // 安装被取消或失败：这次的确认界面作废，回到前台时不能再弹。
            confirmation = null;
            cancelNotification();
            toast(R.string.update_install_failed);
        }
    }
}
