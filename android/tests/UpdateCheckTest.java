package app.study.mobile;

import org.json.JSONObject;

/** 通过 app_process 在 Android 上运行；使用 Android 自带的 JSON 解析器。 */
public final class UpdateCheckTest {
    private static final String APP = "app.study.test";
    private static final String URL = "https://example.com/downloads/test.apk";
    private static final String MINE = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    private static final String THEIRS = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
    private static JSONObject release(String hash, int code) throws Exception {
        return new JSONObject().put("applicationId", APP).put("apkUrl", URL)
            .put("versionCode", code).put("versionName", "1.3").put("sha256", hash);
    }
    private static void expect(AppUpdates.Status expected, String published, String installed) throws Exception {
        AppUpdates.Status actual = AppUpdates.status(release(published, 4), APP, URL, installed);
        if (actual != expected)
            throw new AssertionError(published + " against " + installed + ": expected " + expected + " but got " + actual);
    }
    private static void reject(JSONObject value) throws Exception {
        try { AppUpdates.status(value, APP, URL, MINE); }
        catch (Exception expected) { return; }
        throw new AssertionError("Unsafe update information accepted");
    }
    public static void main(String[] args) throws Exception {
        // 由文件说了算：字节相同就不提示，不同才值得提醒。
        expect(AppUpdates.Status.SAME, MINE, MINE);
        expect(AppUpdates.Status.DIFFERENT, THEIRS, MINE);
        // 网站回滚了也仍然算「不同」，这没问题：版本号从不变化，
        // 所以内容更旧的 APK 会直接覆盖安装到现有包上。
        expect(AppUpdates.Status.DIFFERENT, MINE, THEIRS);

        // 自身哈希读不出来时必须保持安静，不能每次启动都骚扰用户。
        expect(AppUpdates.Status.SAME, THEIRS, null);
        expect(AppUpdates.Status.SAME, THEIRS, "dev");

        // 写死的版本号绝不能影响判定结果。
        if (AppUpdates.status(release(THEIRS, 4), APP, URL, MINE) != AppUpdates.Status.DIFFERENT)
            throw new AssertionError("Equal version numbers must not hide a different APK");

        reject(release(THEIRS, 4).put("applicationId", "another.app"));
        reject(release(THEIRS, 4).put("apkUrl", "https://untrusted.example/test.apk"));
        reject(release(THEIRS, 0));
        JSONObject missing = release(THEIRS, 4); missing.remove("sha256"); reject(missing);
        for (String invalid : new String[]{"", "xyz", "0123456789ABCDEF", "0123456789abcdef",
                "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcde", "../0123456789abcdef"})
            reject(release(invalid, 4));

        // 64 个字符的哈希也要让对话框里的文字看得清。
        if (!"01234567".equals(AppUpdates.shortHash(MINE)))
            throw new AssertionError("Hash label must be the first eight characters");
        if (!"dev".equals(AppUpdates.shortHash("dev")))
            throw new AssertionError("Short values must pass through unchanged");

        System.out.println("APK hash update classification checks passed");
    }
}
