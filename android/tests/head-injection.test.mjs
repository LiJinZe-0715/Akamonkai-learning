import assert from "node:assert/strict";
import {test} from "node:test";
import {injectAndroidHead, injectedHead, injectedMarker} from "../../scripts/android-html.mjs";

test("注入一次就够，重复调用不会叠加", () => {
  const once = injectAndroidHead("<head><title>x</title></head>");
  const twice = injectAndroidHead(once);
  assert.equal(twice, once, "第二次调用必须原样返回");
  assert.equal((once.match(/Content-Security-Policy/g) ?? []).length, 1, "CSP 只能有一个");
  assert.equal((once.match(/native-bridge\.js/g) ?? []).length, 1, "bridge 只能注入一次");
  assert.match(once, /script-src 'self' 'unsafe-inline'/);
  assert.match(once, /connect-src 'self'/);
  assert.match(once, /media-src 'self' https:\/\/lijinze-0715\.github\.io/, "CSP 要放行 Pages 上的听力");
  assert.match(once, /<title>x<\/title>/, "原有 head 内容不能被吞掉");
});

test("没有 head 时抛错，而不是静默发布一个没有 CSP 的页面", () => {
  assert.throws(() => injectAndroidHead("<html><body></body></html>", "a.html"), /Missing head: a\.html/);
});

test("head 带属性时也注入在标签之后", () => {
  const out = injectAndroidHead('<head data-x="1"><script>inline()</script></head>');
  assert.ok(out.startsWith('<head data-x="1">' + injectedHead), "注入位置必须在 head 开标签之后");
  assert.ok(out.includes(injectedMarker));
});