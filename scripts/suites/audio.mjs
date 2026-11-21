import assert from "../assertions.mjs";
import {test} from "../harness.mjs";

/**
 * 同一时刻只有一条声音。
 *
 * 排斥全靠 `play` 事件驱动，所以这里搭一个最小假 DOM：只实现播放器的暂停和
 * `querySelectorAll`，够验证「谁最后起播谁独占」的顺序，以及朗读被叫停。
 */

class FakeMedia extends EventTarget {
    constructor(name, {playing = false, currentTime = 0} = {}) {
        super();
        this.name = name;
        this.paused = !playing;
        this.currentTime = currentTime;
        this.pauses = 0;
    }

    pause() {
        if (this.paused) return;
        this.paused = true;
        this.pauses += 1;
        this.dispatchEvent(new Event("pause"));
    }
}

/** 假 document：只认 `audio, video` 这一条选择器，`play` 事件按捕获阶段直接交给监听器。 */
function fakeDocument(players) {
    const listeners = new Map();
    return {
        querySelectorAll: selector => (selector === "audio, video" ? players : []),
        addEventListener: (type, listener) => listeners.set(type, listener),
        removeEventListener: (type, listener) => {
            if (listeners.get(type) === listener) {
                listeners.delete(type);
            }
        },
        /** 模拟起播：先改播放状态，再送一次 play 事件。 */
        start(player) {
            player.paused = false;
            listeners.get("play")?.({target: player});
        },
        watching: type => listeners.has(type),
    };
}

test("音轨互斥：新起播的播放器独占，旧音轨暂停并保留进度", [], context => {
    const {load} = context;
    const {watchSingleAudio} = load("src/presentation/single-audio.ts");
    const first = new FakeMedia("本文音轨 A", {playing: true, currentTime: 18});
    const second = new FakeMedia("本文音轨 B");
    const document = fakeDocument([first, second]);
    context.globals({document, HTMLMediaElement: FakeMedia});
    let stopped = 0;
    const unwatch = watchSingleAudio(() => {
        stopped += 1;
    });
    context.cleanup(unwatch);

    document.start(second);
    assert.equal(first.paused, true, "起播新音轨时旧音轨要停下来");
    assert.equal(first.currentTime, 18, "旧音轨停在原处，回到那一页还能接着听");
    assert.equal(second.paused, false, "正在起播的播放器不能把自己暂停");
    assert.equal(stopped, 1, "音轨一起播，朗读要让位");

    // StrictMode 会挂上又卸下：卸载后不该再插手。
    unwatch();
    assert.equal(document.watching("play"), false, "卸载后不再监听 play");
});

test("朗读起播前暂停所有在响的音轨，本来停着的不碰", [], context => {
    const {load} = context;
    const {pauseMediaOutput} = load("src/presentation/single-audio.ts");
    const track = new FakeMedia("真题听力", {playing: true, currentTime: 42});
    const idle = new FakeMedia("另一段音轨");
    context.globals({document: fakeDocument([track, idle]), HTMLMediaElement: FakeMedia});

    pauseMediaOutput();
    assert.equal(track.paused, true, "朗读开口前音轨就要停");
    assert.equal(track.currentTime, 42, "暂停不重置进度");
    assert.equal(idle.pauses, 0, "没在播的播放器不去碰");
});
