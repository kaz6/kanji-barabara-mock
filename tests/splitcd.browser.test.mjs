// KJ-138：割る（Split）の待ち時間の画面（tests/splitcd.test.js が決まり）
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
let chromium = null;
try { ({ chromium } = require("./pwja.cjs")); } catch { /* 入っていない */ }
const skip = chromium ? false : "Playwright が入っていない";
const TYPES = { ".css": "text/css; charset=utf-8", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8" };
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
      const f = p.endsWith("/") ? path.join(p, "index.html") : p;
      if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}
async function open(browser, url, { init = {}, blockStorage = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 }, reducedMotion: "reduce" });
  await ctx.addInitScript(([st, block]) => {
    try {
      if (!sessionStorage.getItem("kjInit")) { sessionStorage.setItem("kjInit", "1"); localStorage.setItem("kj-tutorial", "1"); for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); }
    } catch (e) { /* 読めない端末 */ }
    if (block) { try { Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } }); } catch (e) { /* */ } }
  }, [init, blockStorage]);
  await ctx.addInitScript(() => { window.__shiftSec = 0; window.__shift = (G) => { window.__shiftSec += __KJ.data.rules.hint.timed_sec; G.tick(); }; const pn = performance.now.bind(performance); performance.now = () => pn() + window.__shiftSec * 1000; }); // 時限のヒントを待たずに出す（tests/browser.test.mjs と同じ）
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
  return { ctx, page, errors };
}

// KJ-138：割る（Split）の待ち時間。割ったあと rules.cooldown_sec.split 秒は押せない見え方・ゲージ（緑）が出る・満ちたらまた割れる。
// 押せない見え方でも押すと「待ち時間」の理由が出る（反転・巡り・同音と同じ）。Playwright の Chromium がないと skip になる
test("Split：割ったあとゲージが出て押せない・理由は 待ち時間・時間がたつとまた割れる", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const { ctx, page, errors } = await open(browser, `http://127.0.0.1:${srv.address().port}/index.html`);
    await page.check('#opp input[value="cpu"]');
    await page.check('#pow input[value="weak"]');
    await page.click("#start");
    await page.evaluate(() => {
      const G = __KJ.game; G.cpuTurn = () => null;
      G.me.cards = [..."休語天口辶十日下"].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
      G.field = [..."山川玉"].map((c, i) => ({ id: 9500 + i, c, t: 0, fresh: false }));
      __KJ.render();
    });
    const st = () => page.evaluate(() => { const b = document.getElementById("bSplit"); return { cd: b.classList.contains("cd"), off: b.disabled || b.getAttribute("aria-disabled") === "true", g: parseFloat(b.style.getPropertyValue("--g") || "NaN"), gauge: parseFloat(getComputedStyle(b, "::before").width) > 0 }; });
    const total = await page.evaluate(() => __KJ.data.rules.cooldown_sec.split);
    assert.equal(total, 5, "割るの待ち時間は rules.json の 5 秒");
    await page.locator("#meHand .tile", { hasText: "休" }).first().click();
    let s = await st();
    assert.equal(s.off, false, "割る前は押せる"); assert.equal(s.cd, false);
    await page.click("#bSplit");
    assert.equal(await page.evaluate(() => __KJ.game.me.cards.some((x) => x.c === "人")), true, "割れた");
    await page.evaluate((t) => { const G = __KJ.game; G.me.cd.split = G.now() + t - 0.5; __KJ.render(); }, total); // 割った直後の形に固定（画面が遅くても待ち中のまま）
    await page.waitForTimeout(350);
    s = await st();
    assert.equal(s.cd, true, "待ち中の印"); assert.equal(s.off, true, "待ち中は押せない見え方"); assert.equal(s.gauge, true, "ゲージが出ている");
    assert.ok(s.g >= 0 && s.g < 0.5, "使った直後は空に近い");
    // もう1枚割ろうとしても割れず、理由が残る
    await page.evaluate(() => { __KJ.game.me.cd.split = __KJ.game.now() + 1000; __KJ.render(); }); // 画面が遅くても待ち中のまま
    await page.locator("#meHand .tile", { hasText: "語" }).first().click();
    await page.click("#bSplit", { force: true }); // 押せない見え方（aria-disabled）。押すと何も起きず理由が残る
    assert.equal(await page.evaluate(() => __KJ.game.me.cards.some((x) => x.c === "吾")), false, "待ち中は割れない");
    const why = await page.evaluate(() => __KJ.game.log.filter((e) => e.op === "ためした").map((e) => e.note).pop());
    assert.match(why, /割る：待ち時間/);
    // 時間がたつとゲージが満ちて、また割れる
    await page.evaluate((t) => { const G = __KJ.game; G.me.cd.split = G.now() + t / 2; __KJ.render(); }, total);
    await page.waitForTimeout(350);
    s = await st();
    assert.ok(Math.abs(s.g - 0.5) < 0.1, "半分でおよそ半分");
    await page.evaluate(() => { const G = __KJ.game; G.me.cd.split = 0; __KJ.render(); });
    await page.waitForTimeout(100);
    s = await st();
    assert.equal(s.cd, false); assert.equal(s.off, false, "満ちたらまた押せる");
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});
