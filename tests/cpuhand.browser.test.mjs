// CPU 対戦で相手の上の段を見せる（KJ-092。作者 2026-11-25「相手の手札見れるように」「21いいですね」）：
// CPU の行のすぐ下に上の段（8マス）を小さく・字だけ・見るだけ。ストックは見せない。動くとその場で変わる。
// 合言葉の部屋は tests/browser.test.mjs の部屋のテストで、ひとり・チュートリアルは下で見る。
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
try { ({ chromium } = require("playwright")); } catch { /* 入っていない */ }
const skip = chromium ? false : "Playwright が入っていない";

const TYPES = { ".css": "text/css; charset=utf-8", ".otf": "font/otf", ".woff": "font/woff", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8" };
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

async function open(browser, url, { vp = { width: 375, height: 667 }, tutorial = false } = {}) {
  const ctx = await browser.newContext({ viewport: vp, reducedMotion: "reduce" });
  if (!tutorial) await ctx.addInitScript(() => { try { localStorage.setItem("kj-tutorial", "1"); } catch (e) { /* 読めない端末 */ } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
  await page.check('#opp input[value="cpu"]');
  await page.check('#pow input[value="weak"]');
  await page.click("#start");
  return { ctx, page, errors };
}
const setUp = (page) => page.evaluate(() => {
  const G = __KJ.game; G.realCpuTurn = G.cpuTurn; G.cpuTurn = () => null; // CPU は勝手に動かさない（下で本物の手を呼ぶ）
  G.me.cards = [..."天上天下十口休日"].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
  G.cpu.cards = [..."山川玉木林休"].map((c, i) => ({ id: 9100 + i, c, t: 0, fresh: false })).concat([{ id: 9200, c: "月", t: 0, fresh: false, tray: true }]);
  G.field = [..."山川玉"].map((c, i) => ({ id: 9500 + i, c, t: 0, fresh: false }));
  __KJ.render();
});
const peekText = (page) => page.evaluate(() => [...document.querySelectorAll("#cpuHand > *")].map((e) => (e.classList.contains("slot") ? "_" : e.firstChild.textContent)).join(""));

test("CPU 対戦：CPU の行のすぐ下に上の段の8マス・字だけ・ストックは出さない", { skip }, async (t) => {
  const srv = await serve(); const url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); srv.close(); });
  const { ctx, page, errors } = await open(browser, url);
  await setUp(page);
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("cpuHand")).display), "grid", "見えている");
  assert.equal(await peekText(page), "山川玉木林休__", "上の段の字が並び、空きは空きのマス（ストックの 月 は出ない）");
  assert.equal(await page.evaluate(() => document.querySelectorAll("#cpuHand > *").length), 8, "8マス");
  const pos = await page.evaluate(() => { const h = document.getElementById("cpuHand").getBoundingClientRect(), s = document.querySelector("#cpuSide .side-head").getBoundingClientRect(), tb = document.querySelector(".table").getBoundingClientRect(); return { headB: s.bottom, handT: h.top, handB: h.bottom, tableT: tb.top }; });
  assert.ok(pos.handT >= pos.headB - 1 && pos.handT - pos.headB < 12, `「CPU ○点 手札」の行のすぐ下（${pos.headB}→${pos.handT}）`);
  assert.ok(pos.handB <= pos.tableT, "卓の上");
  const shown = await page.evaluate(() => [...document.querySelectorAll("#cpuHand .cut,#cpuHand .mk,#cpuHand .ord")].filter((e) => getComputedStyle(e).display !== "none").length);
  assert.equal(shown, 0, "割れ目の点線・角の印は出さない");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("CPU 対戦：見るだけ（タップ・引きずりで何も起きない）", { skip }, async (t) => {
  const srv = await serve(); const url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); srv.close(); });
  const { ctx, page, errors } = await open(browser, url);
  await setUp(page);
  const before = await page.evaluate(() => JSON.stringify({ c: __KJ.game.cpu.cards, m: __KJ.game.me.cards, f: __KJ.game.field, log: __KJ.game.log.length }));
  const b = await page.locator("#cpuHand .tile").first().boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.move(b.x + 5, b.y + 5); await page.mouse.down(); await page.mouse.move(b.x + 80, b.y + 200, { steps: 5 }); await page.mouse.up();
  assert.equal(await page.evaluate(() => document.getElementById("cpuHand").style.pointerEvents || getComputedStyle(document.getElementById("cpuHand")).pointerEvents), "none", "押せない（pointer-events）");
  assert.equal(await page.evaluate(() => document.querySelectorAll("#row .tile").length), 0, "台に札は並ばない");
  assert.equal(await page.evaluate(() => JSON.stringify({ c: __KJ.game.cpu.cards, m: __KJ.game.me.cards, f: __KJ.game.field, log: __KJ.game.log.length })), before, "手札・場・ログは変わらない");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("CPU 対戦：CPU が動くと、その場で上の段が変わる（中身は CPU の手札と同じ）", { skip }, async (t) => {
  const srv = await serve(); const url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); srv.close(); });
  const { ctx, page, errors } = await open(browser, url);
  await setUp(page);
  const model = () => page.evaluate(() => { const G = __KJ.game, cs = G.cpu.cards.filter((x) => !x.tray).map((x) => x.c).join(""); return cs + "_".repeat(8 - cs.length); });
  assert.equal(await peekText(page), await model());
  // 札が増える・減る・字が変わる（割る・取る・放つ・引き直し・特別攻撃ワードで札が変わる、どれも render で同じ道）
  await page.evaluate(() => { const G = __KJ.game; G.cpu.cards = G.cpu.cards.filter((x) => x.c !== "林"); G.cpu.cards.push({ id: 9300, c: "日", t: 0, fresh: true }, { id: 9301, c: "月", t: 0, fresh: false }); __KJ.render(); });
  assert.equal(await peekText(page), await model());
  assert.equal(await peekText(page), "山川玉木休日月_");
  // 本物の CPU の手（cpuTurn）を何回か動かし、そのたびに画面の上の段が CPU の手札と同じ
  await page.evaluate(() => { const G = __KJ.game; G.cpuTurn = G.realCpuTurn; });
  const seen = new Set();
  for (let i = 0; i < 25; i++) {
    await page.evaluate(() => { const G = __KJ.game; G.cpuTurn(); __KJ.render(); });
    const shown = await peekText(page); seen.add(shown);
    assert.equal(shown, await model(), `${i + 1}手目のあとも CPU の手札と同じ`);
  }
  assert.ok(seen.size >= 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("375×667：相手の上の段を見せても、自分の手札・ストックが画面に収まる", { skip }, async (t) => {
  const srv = await serve(); const url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); srv.close(); });
  const { ctx, page, errors } = await open(browser, url, { vp: { width: 375, height: 667 } });
  await setUp(page);
  const m = await page.evaluate(() => { const q = (s) => document.querySelector(s).getBoundingClientRect(); return { hand: q("#meHand").bottom, tray: q("#meTray").bottom, w: document.documentElement.scrollWidth, tile: q("#cpuHand .tile").width }; });
  assert.ok(m.hand <= 667 && m.tray <= 667, `手札・ストックの下端が 667 以内（手札 ${m.hand}・ストック ${m.tray}）`);
  assert.ok(m.w <= 375, "横スクロールがない");
  assert.ok(m.tile >= 30, `相手の札も字が読める大きさ（幅 ${m.tile}）`);
  if (process.env.KJ_SHOT_DIR) await page.screenshot({ path: path.join(process.env.KJ_SHOT_DIR, "kj-092-cpu-hand-375.png") });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("ひとり・チュートリアルでは相手の上の段を出さない", { skip }, async (t) => {
  const srv = await serve(); const url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); srv.close(); });
  const { ctx, page, errors } = await open(browser, url, { tutorial: true }); // 印の無い端末：はじめる→チュートリアル
  await page.waitForFunction(() => __KJ.game && __KJ.game.tutorial);
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("cpuHand")).display), "none", "チュートリアルでは出さない");
  // ひとり（CPU なし。テストが中で使う solo）
  await page.evaluate(() => { const G = __KJ.game; G.solo = true; G.tutorial = false; __KJ.render(); });
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("cpuHand")).display), "none", "ひとり（solo）では出さない");
  assert.deepEqual(errors, []);
  await ctx.close();
});
