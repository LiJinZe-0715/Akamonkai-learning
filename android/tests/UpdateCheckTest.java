package app.study.mobile;

import org.json.JSONObject;

/** Run on Android via app_process; uses Android's real JSON parser. */
public final class UpdateCheckTest {
    private static final String APP = "app.study.test";
    private static final String URL = "https://example.com/downloads/test.apk";
    private static JSONObject release(String version, int code) throws Exception {
        return new JSONObject().put("applicationId", APP).put("apkUrl", URL)
            .put("versionCode", code).put("versionName", version);
    }
    private static void check(String next, String current, int sign) {
        if (Integer.signum(AppUpdates.compareVersions(next, current)) != sign)
            throw new AssertionError(next + " compared incorrectly with " + current);
    }
    private static void reject(JSONObject value) throws Exception {
        try { AppUpdates.isNewer(value, APP, URL, "0.1"); }
        catch (Exception expected) { return; }
        throw new AssertionError("Unsafe update information accepted");
    }
    public static void main(String[] args) throws Exception {
        check("0.2", "0.1", 1);
        check("0.10", "0.9", 1);
        check("1.0", "0.99", 1);
        check("0.9", "0.10", -1);
        check("0.1", "0.1", 0);
        check("0.01", "0.1", 0);
        check("0.1", "0.0.1", 1);
        check("0.1", "0.1.0", 0);
        check("0.1", "1.1.0", -1);
        check("999999999999999999999.0", "9.99", 1);
        if (!AppUpdates.isNewer(release("0.2", 1), APP, URL, "0.1"))
            throw new AssertionError("Version name must control update even with a smaller code");
        if (AppUpdates.isNewer(release("0.1", 999), APP, URL, "0.1"))
            throw new AssertionError("Larger internal code must not prompt same display version");
        if (AppUpdates.isNewer(release("0.1", 999), APP, URL, "0.2"))
            throw new AssertionError("Larger internal code must not prompt an older display version");
        reject(release("0.2", 3).put("applicationId", "another.app"));
        reject(release("0.2", 3).put("apkUrl", "https://untrusted.example/test.apk"));
        reject(release("0.2", 0));
        for (String invalid : new String[]{"", "0", "0.-1", "0.1-beta", "0.1.2.3", " 0.1", "0..1"})
            reject(release(invalid, 3));
        JSONObject incomplete = release("0.2", 3); incomplete.remove("versionName"); reject(incomplete);
        System.out.println("Numeric display-version ordering and update validation checks passed");
    }
}
