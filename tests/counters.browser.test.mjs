// 数＋助数詞と 否 の判子（KJ-022・KJ-104）の画面：使った助数詞の 数＋助数詞 を放つと、画面の真ん中に 否 の判子と「〇円は一度きり！」が出て、1.5秒で消える。辞書に無い 十円 は放てる
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

async function begin(browser, url, hand) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 900 }, reducedMotion: "reduce" });
  await ctx.addInitScript(() => { try { localStorage.setItem("kj-tutorial", "1"); } catch (e) { /* 読めない端末 */ } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
  await page.check('#opp input[value="cpu"]');
  await page.check('#pow input[value="weak"]');
  await page.click("#start");
  await page.evaluate((h) => {
    const G = __KJ.game; G.cpuTurn = () => null;
    G.me.cards = [...h].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
  }, hand);
  await page.evaluate(() => __KJ.render());
  return { ctx, page, errors };
}
const tap = (page, ch) => page.locator("#meHand .tile:not(.sel)", { hasText: ch }).first().click();
const nope = (page) => page.evaluate(() => { const e = document.getElementById("nope"), r = e.getBoundingClientRect(); return { on: e.classList.contains("on"), shown: getComputedStyle(e).display !== "none", text: e.textContent.replace(/\s+/g, ""), w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2, vw: innerWidth, vh: innerHeight }; });

test("数＋助数詞と 否 の判子", { skip }, async (t) => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); srv.close(); });

  await t.test("辞書に無い 十円 を放てる。台の行に読みが出る", async () => {
    const { ctx, page, errors } = await begin(browser, url, "十円日水");
    await tap(page, "十"); await tap(page, "円");
    const info = await page.locator("#info").innerText();
    assert.match(info, /十円/); assert.match(info, /3点/); assert.match(info, /じゅうえん/);
    assert.equal(await page.locator("#bRelease").isDisabled(), false, "Play が押せる");
    await page.click("#bRelease");
    assert.equal(await page.evaluate(() => __KJ.game.me.score), 3);
    assert.equal((await nope(page)).on, false, "通ったときは判子を出さない");
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("使った助数詞の 数＋助数詞：押せて、はじかれて、画面の真ん中に 否 の判子と理由が出る。点も札も変わらない。1.5秒で消える", async () => {
    const { ctx, page, errors } = await begin(browser, url, "五円日水");
    await page.evaluate(() => { __KJ.game.used.add("十円"); __KJ.render(); });
    await tap(page, "五"); await tap(page, "円");
    assert.equal(await page.locator("#bRelease").isDisabled(), false, "はじかれると分かっても押せる（1字を押せるのと同じ）");
    assert.match(await page.locator("#info .no").innerText(), /〇円は一度きり/, "台の行にも理由");
    await page.click("#bRelease");
    const n = await nope(page);
    assert.equal(n.on, true); assert.equal(n.shown, true);
    assert.ok(n.text.includes("否") && n.text.includes("〇円は一度きり！") && !n.text.includes("🚫"), n.text);
    assert.ok(Math.abs(n.cx - n.vw / 2) < 2, `横の真ん中（${n.cx} / ${n.vw}）`);
    const st0 = await page.evaluate(() => { // 判子（KJ-104）：朱・大正風・傾き・理由は判子の下
      const ic = document.querySelector("#nope .no-ic"), why = document.getElementById("nopeWhy"), cs = getComputedStyle(ic), a = ic.getBoundingClientRect(), w = why.getBoundingClientRect();
      return { ch: ic.textContent, ff: cs.fontFamily, color: cs.color, accent: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(), bw: cs.borderTopWidth, bs: cs.borderTopStyle, op: cs.opacity, tf: cs.transform, size: [a.width, a.height], below: w.top >= a.bottom - 1, nopeBorder: getComputedStyle(document.getElementById("nope")).borderTopWidth, whyBorder: getComputedStyle(why).borderTopWidth };
    });
    assert.equal(st0.ch, "否"); assert.match(st0.ff, /KJ Kaisei/); assert.equal(st0.color, "rgb(156, 59, 46)", "弁柄（--accent）");
    assert.equal(st0.bs, "double"); assert.equal(st0.bw, "4px"); assert.ok(Math.abs(st0.op - 0.92) < 0.02);
    assert.ok(st0.size[0] >= 60 && st0.size[0] <= 90 && Math.abs(st0.size[0] - st0.size[1]) < 1, `四角（${st0.size}）`);
    assert.notEqual(st0.tf, "none", "傾いている"); assert.ok(st0.below, "理由は判子の下");
    assert.equal(st0.nopeBorder, "0px", "大きな囲みの箱は無い"); assert.equal(st0.whyBorder, "1px", "理由の小札だけ枠");
    assert.ok(n.cy > n.vh * 0.25 && n.cy < n.vh * 0.6, "縦も画面の真ん中あたり");
    assert.ok(n.w <= n.vw - 24, "375px からはみ出さない");
    if (process.env.KJ_SHOT) await page.screenshot({ path: path.join(ROOT, "docs", "shots", "kj-022-nope-375.png") }); // 画像を撮り直すときだけ（KJ_SHOT=1）
    const st = await page.evaluate(() => ({ score: __KJ.game.me.score, cards: __KJ.game.me.cards.length, log: __KJ.game.log.filter((e) => e.op === "ためした").map((e) => e.note) }));
    assert.equal(st.score, 0); assert.equal(st.cards, 4);
    assert.deepEqual(st.log, ["〇円は一度きり"], "ログに「ためした」で理由つき");
    await page.click("#bBack");
    assert.equal(await page.evaluate(() => __KJ.game.log.filter((e) => e.op === "ためした").length), 1, "Back で戻っても「ためした」は1行のまま");
    await page.waitForFunction(() => !document.getElementById("nope").classList.contains("on"), null, { timeout: 4000 });
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("ほかのはじかれ方（くっつかない・割れない）でも 否 の判子と理由。次のはじかれで出し直す", async () => {
    const { ctx, page, errors } = await begin(browser, url, "日水天口");
    await tap(page, "日"); await tap(page, "水");
    await page.click("#bJoin", { force: true }); // 押せない見た目（aria-disabled）でも押せて、理由が出る
    let n = await nope(page);
    assert.equal(n.on, true);
    assert.ok(n.text.includes("否") && n.text.includes("くっつかない！"), n.text);
    await page.click("#bBack");
    await tap(page, "口"); // 割れない字
    await page.click("#bSplit", { force: true });
    n = await nope(page);
    assert.ok(n.on && n.text.includes("割れない！"), n.text);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
  await t.test("判子は押した感じで出る（0.12秒。出し直すたびに押し直す）。reduced-motion では動かさない（KJ-104）", async () => {
    const { ctx, page, errors } = await begin(browser, url, "日水天口");
    await page.emulateMedia({ reducedMotion: "no-preference" }); // begin は reduce で始める
    await tap(page, "日"); await tap(page, "水");
    await page.click("#bJoin", { force: true });
    const an = () => page.evaluate(() => { const cs = getComputedStyle(document.querySelector("#nope .no-ic")); return { name: cs.animationName, dur: cs.animationDuration }; });
    let a = await an();
    assert.equal(a.name, "stampIn"); assert.equal(a.dur, "0.12s");
    await page.emulateMedia({ reducedMotion: "reduce" });
    a = await an();
    assert.equal(a.name, "none", "reduced-motion では動かさない");
    assert.deepEqual(errors, []);
    await ctx.close();
  });
  await t.test("理由の小札は画面の右半分で折れない：320px で短い理由が1行・長い理由も 90vw に収まる（KJ-104）", async () => {
    for (const w of [320, 375]) {
      const { ctx, page, errors } = await begin(browser, url, "日水天口");
      await page.setViewportSize({ width: w, height: 900 });
      for (const why of ["くっつかない！", "手札もストックもいっぱい！"]) {
        const r = await page.evaluate((x) => { showWhy(x); const e = document.getElementById("nopeWhy"), b = e.getBoundingClientRect(), lh = parseFloat(getComputedStyle(e).lineHeight); return { w: b.width, h: b.height, lh, vw: innerWidth, text: e.textContent }; }, why);
        assert.ok(r.w <= r.vw * 0.9 + 1, `${w}px「${r.text}」が 90vw に収まる（${r.w}）`);
        if (why === "くっつかない！") assert.ok(r.h < r.lh * 1.6 + 8, `${w}px で短い理由は1行（高さ ${r.h}）`);
      }
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  });
});
