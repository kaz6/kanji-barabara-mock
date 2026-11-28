// Redraw の長押しの伝わりやすさ（KJ-143。作者 2026-11-28）：押している間の揺れ（だんだん大きく）・スマホの振動（だんだん間を詰める）・「長押し」の小さな文字。長押しの長さ（REDRAW_HOLD_MS 600ms）と引き直しの決まりは変えない
// Playwright の Chromium がないと skip になる。skip は「通った」ではない
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

const TYPES = { ".css": "text/css; charset=utf-8", ".otf": "font/otf", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8" };
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

// vibrate: true＝呼ばれた形を window.__vib に残す差し替え／false＝navigator.vibrate が無い端末（iOS など）。pref＝端末に覚えた入り切り
async function open(browser, url, { vibrate = true, pref = null, reduced = false, vp = { width: 375, height: 667 }, lang = null } = {}) {
  const ctx = await browser.newContext({ viewport: vp, reducedMotion: reduced ? "reduce" : "no-preference" });
  await ctx.addInitScript(([v, p]) => {
    try { localStorage.setItem("kj-tutorial", "1"); if (p !== null) localStorage.setItem("kj-vibe", p); if (window.__LANG) localStorage.setItem("kj-lang", window.__LANG); } catch (e) { /* 読めない端末 */ }
    window.__vib = [];
    if (v) Object.defineProperty(navigator, "vibrate", { configurable: true, value: (x) => { window.__vib.push(x); return true; } });
    else Object.defineProperty(navigator, "vibrate", { configurable: true, value: undefined });
  }, [vibrate, pref]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
  return { ctx, page, errors };
}
// 試合を始めて、手札と場を決める（CPU は止める）
async function begin(page, hand = "天上天下十口休日") {
  await page.check('#opp input[value="cpu"]');
  await page.check('#pow input[value="weak"]');
  await page.click("#start");
  await page.evaluate((h) => {
    const G = __KJ.game; G.cpuTurn = () => null;
    G.me.cards = [...h].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
    G.field = [..."山川玉"].map((c, i) => ({ id: 9500 + i, c, t: 0, fresh: false }));
  }, hand);
  await page.evaluate(() => __KJ.render());
}
const vib = (page) => page.evaluate(() => window.__vib);

const shot = async (page, name) => { if (process.env.KJ_SHOT_REDRAWHOLD) await page.screenshot({ path: path.join(process.env.KJ_SHOT_REDRAWHOLD, name) }); };
const handIds = (page) => page.evaluate(() => __KJ.game.me.cards.map((c) => c.id).join(","));
const box = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; }, sel);
async function down(page) { const b = await box(page, "#bRedraw"); await page.mouse.move(b.l + b.w / 2, b.t + b.h / 2); await page.mouse.down(); }
const shake = (page) => page.evaluate(() => { const b = document.getElementById("bRedraw"); return { amp: parseFloat(b.dataset.shake || "0"), tf: b.style.transform }; });
const maxAmp = async (page, ms) => { let m = 0; const t0 = Date.now(); while (Date.now() - t0 < ms) { m = Math.max(m, (await shake(page)).amp); await page.waitForTimeout(15); } return m; };

test("Redraw の長押し（KJ-143）", { skip }, async (t) => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); srv.close(); });

  await t.test("データ：揺れ幅と振動の形は rules の1か所／長押しの長さは 600ms のまま", () => {
    const R = JSON.parse(fs.readFileSync(path.join(ROOT, "data/rules.json"), "utf8"));
    assert.deepEqual(R.redraw_hold.shake_px, [0.5, 3]);
    assert.ok(R.redraw_hold.shake_ms > 0);
    const v = R.vibrate.redraw_hold;
    assert.ok(Array.isArray(v) && v.length >= 5 && v.length % 2 === 1, "震え・間のくり返し");
    const gaps = v.filter((_, i) => i % 2 === 1);
    for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] < gaps[i - 1], "間はだんだん詰まる");
    assert.ok(v.reduce((a, b) => a + b, 0) <= 600, "長押しの600ms のうちに収まる");
    assert.match(fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), /const REDRAW_HOLD_MS=600;/);
  });

  await t.test("押している間だけ揺れ、時間とともに大きくなる／離すと止まって元の位置へ／途中で離しても引き直さない", async () => {
    const { ctx, page, errors } = await open(browser, url);
    await begin(page);
    const h0 = await handIds(page);
    assert.equal((await shake(page)).tf, "", "押す前は揺れない");
    await down(page);
    await page.waitForTimeout(60);
    const early = (await shake(page)).amp;
    const late = await maxAmp(page, 380);
    assert.ok(early > 0 && early < 1.3, `押し始めは小さい（${early}）`);
    assert.ok(late > early + 0.8 && late <= 3.01, `埋まるにつれて大きくなる（${early} → ${late}）`);
    assert.match((await shake(page)).tf, /translateX/, "左右に動く");
    await shot(page, "kj-143-375-holding.png");
    await page.mouse.up();
    await page.waitForTimeout(80);
    assert.deepEqual(await shake(page), { amp: 0, tf: "" }, "離したら止まって元の位置");
    assert.equal(await handIds(page), h0, "途中で離したら引き直さない");
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("600ms 押しきると今までどおり引き直す・揺れは止まる", async () => {
    const { ctx, page, errors } = await open(browser, url);
    await begin(page);
    const h0 = await handIds(page);
    await down(page);
    await page.waitForTimeout(800);
    assert.notEqual(await handIds(page), h0, "引き直した");
    assert.deepEqual(await shake(page), { amp: 0, tf: "" }, "引き直したあとは揺れない");
    await page.mouse.up();
    assert.equal(await page.evaluate(() => __KJ.game.me.redraws), 1, "二重に引き直さない・回数は1");
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("スマホの振動：押すと rules の形で1回呼ぶ／離すと止める／引き直しきったあとは止めに行かない", async () => {
    const { ctx, page, errors } = await open(browser, url);
    await begin(page);
    const R = await page.evaluate(() => __KJ.D ? __KJ.D.rules.vibrate.redraw_hold : null);
    await page.evaluate(() => { window.__vib = []; });
    await down(page);
    await page.waitForTimeout(100);
    const v1 = await vib(page);
    assert.equal(v1.length, 1, "押した瞬間に1回");
    assert.ok(Array.isArray(v1[0]) && v1[0][0] > 0, "短い振動のくり返し");
    if (R) assert.deepEqual(v1[0], R);
    await page.mouse.up();
    assert.deepEqual((await vib(page)).at(-1), 0, "途中で離すと振動を止める");
    await ctx.close();
    assert.deepEqual(errors, []);
  });

  await t.test("kj-vibe が切のとき・navigator.vibrate が無い端末では震えない（落ちない）", async () => {
    for (const o of [{ pref: "0" }, { vibrate: false }]) {
      const { ctx, page, errors } = await open(browser, url, o);
      await begin(page);
      const h0 = await handIds(page);
      await down(page);
      await page.waitForTimeout(150);
      assert.deepEqual(await vib(page) || [], [], `振動は呼ばれない ${JSON.stringify(o)}`);
      assert.ok((await shake(page)).amp > 0, "揺れは出る");
      await page.waitForTimeout(600);
      assert.notEqual(await handIds(page), h0, "引き直しは今まで通り");
      await page.mouse.up();
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  });

  await t.test("reduced-motion では揺らさない（ゲージと振動は今のまま）", async () => {
    const { ctx, page, errors } = await open(browser, url, { reduced: true });
    await begin(page);
    await page.evaluate(() => { window.__vib = []; });
    await down(page);
    await page.waitForTimeout(250);
    assert.deepEqual(await shake(page), { amp: 0, tf: "" }, "揺れない");
    assert.equal(await page.evaluate(() => document.getElementById("bRedraw").classList.contains("holding")), true, "ゲージは動く");
    assert.equal((await vib(page)).length, 1, "振動は今のまま");
    await page.mouse.up();
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("「長押し」の小さな文字：Redraw のボタンの3行目・いつも出す・押せない見た目でも出す・English は Hold・375／320px で手札とぶつからない", async () => {
    for (const vp of [{ width: 375, height: 667 }, { width: 320, height: 568 }]) {
      const { ctx, page, errors } = await open(browser, url, { vp });
      await begin(page);
      const r = await page.evaluate(() => {
        const h = document.getElementById("rdHold"), b = document.getElementById("bRedraw"), hand = document.getElementById("meHand");
        const hr = h.getBoundingClientRect(), br = b.getBoundingClientRect(), tr = hand.getBoundingClientRect();
        return { text: h.textContent, inside: hr.top >= br.top - 0.5 && hr.bottom <= br.bottom + 0.5 && hr.left >= br.left - 0.5 && hr.right <= br.right + 0.5, size: parseFloat(getComputedStyle(h).fontSize), op: parseFloat(getComputedStyle(h).opacity), bBottom: br.bottom, handTop: tr.top, vis: hr.width > 0 && hr.height > 0 };
      });
      assert.equal(r.text, "長押し");
      assert.ok(r.vis && r.inside, "ボタンの中に収まる");
      assert.ok(r.size <= 10 && r.op < 1, "小さく・薄く");
      assert.ok(r.bBottom <= r.handTop + 0.5, `手札とぶつからない（${r.bBottom} ≤ ${r.handTop}）`);
      if (vp.width === 375) assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "横にはみ出さない"); // 320px は main の時点で 343 まで広がっている（この変更の前から。変わらない）
      await page.evaluate(() => { __KJ.game.me.redraws = 5; __KJ.render(); });
      assert.equal(await page.evaluate(() => document.getElementById("bRedraw").getAttribute("aria-disabled") === "true" || document.getElementById("bRedraw").disabled), true, "使いきると押せない見た目");
      assert.equal(await page.textContent("#rdHold"), "長押し", "押せない見た目でも出したまま");
      await shot(page, `kj-143-${vp.width}-hold-label.png`);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
    const { ctx, page } = await open(browser, url);
    await page.evaluate(() => { localStorage.setItem("kj-lang", "en"); });
    await page.reload();
    await page.waitForFunction(() => document.getElementById("setupInfo").textContent.length > 0);
    assert.equal(await page.textContent("#rdHold"), "Hold", "English では Hold");
    await ctx.close();
  });
});
