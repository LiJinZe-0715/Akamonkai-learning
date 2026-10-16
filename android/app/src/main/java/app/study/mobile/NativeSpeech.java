package app.study.mobile;

import android.app.Activity;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

public final class NativeSpeech {
    private final Activity activity;
    private final WebView web;
    private TextToSpeech tts;
    private volatile boolean ready;
    private volatile String voices = "[]";

    NativeSpeech(Activity activity, WebView web) {
        this.activity = activity;
        this.web = web;
        tts = new TextToSpeech(activity, status -> activity.runOnUiThread(() -> {
            ready = status == TextToSpeech.SUCCESS;
            if (!ready) return;
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) { event(id, "start"); }
                @Override public void onDone(String id) { event(id, "end"); }
                @Override public void onError(String id) { event(id, "error"); }
            });
            JSONArray list = new JSONArray();
            if (tts.getVoices() != null) for (Voice voice : tts.getVoices()) {
                if (!"ja".equals(voice.getLocale().getLanguage())) continue;
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
            notifyVoices();
        }));
    }

    @JavascriptInterface public String getVoices() { return voices; }
    @JavascriptInterface public void speak(String id, String text, String voiceName, double rate, double pitch) {
        activity.runOnUiThread(() -> {
            if (!ready || text == null || text.length() > 5000) { event(id, "error"); return; }
            Voice selected = null;
            if (tts.getVoices() != null) for (Voice voice : tts.getVoices()) {
                if (voice.getName().equals(voiceName) && "ja".equals(voice.getLocale().getLanguage())) selected = voice;
            }
            if (selected != null) tts.setVoice(selected);
            else if (tts.setLanguage(Locale.JAPAN) < 0) { event(id, "error"); return; }
            tts.setSpeechRate((float) Math.max(0.1, Math.min(3, rate)));
            tts.setPitch((float) Math.max(0.1, Math.min(2, pitch)));
            if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, id) == TextToSpeech.ERROR) event(id, "error");
        });
    }
    @JavascriptInterface public void stop() { activity.runOnUiThread(() -> { if (tts != null) tts.stop(); }); }
    void shutdown() { ready = false; tts.stop(); tts.shutdown(); }
    void notifyVoices() {
        activity.runOnUiThread(() -> web.evaluateJavascript("window.speechSynthesis?.dispatchEvent(new Event('voiceschanged'))", null));
    }
    private void event(String id, String type) {
        activity.runOnUiThread(() -> web.evaluateJavascript("window.__androidSpeechEvent?.(" + JSONObject.quote(id)
            + "," + JSONObject.quote(type) + ")", null));
    }
}
