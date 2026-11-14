package app.study.mobile;

import android.app.Activity;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.PlaybackParams;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import java.io.File;
import java.io.IOException;
import java.util.ArrayDeque;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 网页朗读的原生实现：先合成成音频文件，再按顺序播放。
 *
 * 为什么不直接 tts.speak：直接朗读时，引擎往播放缓冲里写音频，框架只让它领先约半秒，
 * 写满就阻塞到播放追上来。于是下一句要到上一句快读完才开始合成，句与句之间空等两三秒
 * （VOICEVOX 合成一句要两三秒）。合成到文件不受这个限制：读第 N 句的同时，第 N+1 句
 * 已经完整合成好，上一句一结束下一句立刻接上——这就是「交替渲染」。
 *
 * 所有状态只在主线程上读写；TTS 的回调来自 binder 线程，一律先切回主线程。
 */
public final class NativeSpeech {
    /** 真机排查朗读：adb logcat -s AkamonkaiSpeech。只记长度、声音名与耗时，不记课文内容。 */
    private static final String TAG = "AkamonkaiSpeech";
    private final Activity activity;
    private final WebView web;
    private final File folder;
    private TextToSpeech tts;
    private volatile boolean ready;
    private volatile String voices = "[]";

    /** 一句：网页给的 id、合成出来的文件、合成到哪一步了。 */
    private static final class Line {
        final String id;
        final File file;
        final long queuedAt = SystemClock.elapsedRealtime();
        final long pauseMs;
        /** 播放倍速：合成阶段交给引擎不保险，播放阶段由 MediaPlayer 保证生效。 */
        final float rate;
        long playedAt;
        boolean synthesized, failed;
        Line(String id, File file, long pauseMs, float rate) {
            this.id = id; this.file = file; this.pauseMs = pauseMs; this.rate = rate;
        }
    }

    /** 按朗读顺序排着的句子；队首是正在播或下一个要播的。 */
    private final ArrayDeque<Line> lines = new ArrayDeque<>();
    private MediaPlayer player;
    /** 每次停止都换一代：上一代还在合成的句子，回调回来一律不认。 */
    private int generation;
    /** 上一句播完的时刻，用来在日志里算句间停顿；0 表示这一段还没有播完过任何一句。 */
    private long lastEndedAt;
    /** 句间停顿用的计时；停止时整个清掉。 */
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean waiting;

    NativeSpeech(Activity activity, WebView web) {
        this.activity = activity;
        this.web = web;
        folder = new File(activity.getCacheDir(), "speech");
        clearFolder();
        tts = new TextToSpeech(activity, status -> activity.runOnUiThread(() -> {
            ready = status == TextToSpeech.SUCCESS;
            Log.i(TAG, "init status=" + status + " engine=" + (tts == null ? null : tts.getDefaultEngine()));
            if (!ready) return;
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String key) { }
                @Override public void onDone(String key) { activity.runOnUiThread(() -> synthesized(key, true)); }
                // 抽象方法，必须实现；新系统走下面带错误码的版本。
                @SuppressWarnings("deprecation") @Override public void onError(String key) { onError(key, -1); }
                @Override public void onError(String key, int code) {
                    Log.w(TAG, "synthesis error key=" + key + " code=" + code);
                    activity.runOnUiThread(() -> synthesized(key, false));
                }
            });
            JSONArray list = new JSONArray();
            // 把引擎报的所有声音都交出去：日语过滤在网页层做，这样"没有引擎"和
            // "引擎在、但没有日语语音包"能区分开，诊断面板才说得对。
            if (tts.getVoices() != null) for (Voice voice : tts.getVoices()) {
                try {
                    JSONObject item = new JSONObject();
                    item.put("voiceURI", voice.getName()); item.put("name", voice.getName());
                    item.put("lang", voice.getLocale().toLanguageTag());
                    item.put("localService", !voice.isNetworkConnectionRequired());
                    item.put("default", voice.equals(tts.getDefaultVoice()));
                    list.put(item);
                } catch (org.json.JSONException ignored) { }
            }
            voices = list.toString();
            Log.i(TAG, "voices=" + list.length());
            notifyVoices();
        }));
    }

    @JavascriptInterface public String getVoices() { return voices; }

    /**
     * 交给引擎合成一句。queued 为 false 时先停掉之前的一切重新开始；为 true 时排在后面，
     * 前一句还在播，这一句已经在合成。pauseMs 是这一句开口前、上一句播完后额外停多久。
     *
     * rate 不在合成时交给 tts：不少引擎在 synthesizeToFile 时忽略 setSpeechRate，网页
     * 改了倍速却听不出变化。改由 playNext 在 MediaPlayer 播放阶段变速，效果与引擎无关。
     */
    @JavascriptInterface public void speak(String id, String text, String voiceName, double rate, double pitch, boolean queued,
                                           double pauseMs) {
        activity.runOnUiThread(() -> {
            if (!queued) stopAll();
            if (!ready || text == null || text.length() > 5000) {
                Log.w(TAG, "speak rejected id=" + id + " ready=" + ready + " length=" + (text == null ? -1 : text.length()));
                enqueueFailed(id);
                return;
            }
            Voice selected = null;
            if (tts.getVoices() != null) for (Voice voice : tts.getVoices()) {
                if (voice.getName().equals(voiceName) && "ja".equals(voice.getLocale().getLanguage())) selected = voice;
            }
            if (selected != null) tts.setVoice(selected);
            else {
                int language = tts.setLanguage(Locale.JAPAN);
                if (language < 0) {
                    Log.w(TAG, "speak id=" + id + " voice '" + voiceName + "' not found, setLanguage(ja)=" + language);
                    enqueueFailed(id);
                    return;
                }
            }
            tts.setPitch((float) Math.max(0.1, Math.min(2, pitch)));
            if (!folder.isDirectory() && !folder.mkdirs()) Log.w(TAG, "cannot create " + folder);
            Line line = new Line(id, new File(folder, generation + "-" + id + ".wav"),
                Math.max(0, Math.min(5000, Math.round(pauseMs))),
                (float) Math.max(0.5, Math.min(1.5, rate)));
            lines.add(line);
            int result = tts.synthesizeToFile(text, new Bundle(), line.file, key(id));
            Log.i(TAG, "synthesize id=" + id + " length=" + text.length() + " voice=" + (selected == null ? "default" : selected.getName())
                + " queued=" + queued + " rate=" + line.rate + " result=" + result);
            if (result == TextToSpeech.ERROR) {
                line.failed = true;
                playNext();
            }
        });
    }

    @JavascriptInterface public void stop() { activity.runOnUiThread(this::stopAll); }

    /** 系统「文字转语音」设置：在这里装引擎、选默认、下日语语音包。 */
    @JavascriptInterface public void openTtsSettings() {
        activity.runOnUiThread(() -> {
            try {
                activity.startActivity(new Intent("com.android.settings.TTS_SETTINGS"));
            } catch (Exception missing) {
                try { activity.startActivity(new Intent(android.provider.Settings.ACTION_SETTINGS)); }
                catch (Exception ignored) { }
            }
        });
    }

    void shutdown() {
        ready = false;
        stopAll();
        tts.shutdown();
    }

    void notifyVoices() {
        activity.runOnUiThread(() -> web.evaluateJavascript("window.speechSynthesis?.dispatchEvent(new Event('voiceschanged'))", null));
    }

    /** 合成请求的 utteranceId：带上代数，停止之后回来的旧回调对不上号。 */
    private String key(String id) { return generation + ":" + id; }

    private void enqueueFailed(String id) {
        Line line = new Line(id, new File(folder, generation + "-" + id + ".wav"), 0, 1f);
        line.failed = true;
        lines.add(line);
        playNext();
    }

    private void synthesized(String key, boolean ok) {
        for (Line line : lines) {
            if (!key(line.id).equals(key)) continue;
            if (ok) line.synthesized = true; else line.failed = true;
            Log.i(TAG, "synthesized id=" + line.id + " ok=" + ok + " ms=" + (SystemClock.elapsedRealtime() - line.queuedAt));
            playNext();
            return;
        }
    }

    /** 队首合成好了、播放器空着，就播它；队首失败了就报错跳过。 */
    private void playNext() {
        if (player != null) return;
        Line line = lines.peek();
        if (line == null) return;
        if (line.failed) {
            finish(line, "error");
            return;
        }
        if (!line.synthesized) return;
        // 句间停顿：从上一句播完算起，没等够就约好时间再来。文件早就合成好了，等完立刻开口。
        if (line.pauseMs > 0 && lastEndedAt != 0) {
            long wait = lastEndedAt + line.pauseMs - SystemClock.elapsedRealtime();
            if (wait > 0) {
                if (waiting) return;
                waiting = true;
                int expected = generation;
                handler.postDelayed(() -> {
                    waiting = false;
                    if (expected == generation) playNext();
                }, wait);
                return;
            }
        }
        MediaPlayer next = new MediaPlayer();
        player = next;
        try {
            next.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
            next.setDataSource(line.file.getPath());
            next.setOnCompletionListener(done -> finish(line, "end"));
            next.setOnErrorListener((failed, what, extra) -> {
                Log.w(TAG, "playback error id=" + line.id + " what=" + what + " extra=" + extra);
                finish(line, "error");
                return true;
            });
            next.prepare();
            // 变速放在播放端：合成到文件时引擎可能忽略 setSpeechRate，MediaPlayer 的播放速率一定生效。
            // 只设速度、不设音高，避免声音变调；个别设备不支持时退回正常速度继续读。
            try {
                PlaybackParams params = new PlaybackParams()
                    .setSpeed(line.rate)
                    .setPitch(1f)
                    .setAudioFallbackMode(PlaybackParams.AUDIO_FALLBACK_MODE_DEFAULT);
                next.setPlaybackParams(params);
            } catch (IllegalStateException | IllegalArgumentException unsupported) {
                Log.w(TAG, "playback speed unsupported id=" + line.id + " rate=" + line.rate);
            }
            next.start();
            line.playedAt = SystemClock.elapsedRealtime();
            Log.i(TAG, "play id=" + line.id + (lastEndedAt == 0 ? " first" : " gap=" + (line.playedAt - lastEndedAt) + "ms"));
            event(line.id, "start");
        } catch (IOException | RuntimeException error) {
            Log.w(TAG, "playback failed id=" + line.id + " " + error);
            finish(line, "error");
        }
    }

    /** 队首这一句结束（读完或出错）：放掉播放器、删文件、告诉网页，再播下一句。 */
    private void finish(Line line, String type) {
        if (lines.peek() != line) return;
        lines.poll();
        releasePlayer();
        lastEndedAt = SystemClock.elapsedRealtime();
        Log.i(TAG, type + " id=" + line.id + (line.playedAt == 0 ? "" : " played=" + (lastEndedAt - line.playedAt) + "ms"));
        if (!line.file.delete() && line.file.exists()) Log.w(TAG, "cannot delete " + line.file);
        event(line.id, type);
        playNext();
    }

    private void stopAll() {
        generation++;
        lastEndedAt = 0;
        handler.removeCallbacksAndMessages(null);
        waiting = false;
        if (tts != null) tts.stop();
        releasePlayer();
        lines.clear();
        clearFolder();
    }

    private void releasePlayer() {
        if (player == null) return;
        MediaPlayer current = player;
        player = null;
        try { current.stop(); } catch (IllegalStateException ignored) { }
        current.release();
    }

    private void clearFolder() {
        File[] files = folder.listFiles();
        if (files != null) for (File file : files) if (!file.delete()) Log.w(TAG, "cannot delete " + file);
    }

    private void event(String id, String type) {
        activity.runOnUiThread(() -> web.evaluateJavascript("window.__androidSpeechEvent?.(" + JSONObject.quote(id)
            + "," + JSONObject.quote(type) + ")", null));
    }
}
