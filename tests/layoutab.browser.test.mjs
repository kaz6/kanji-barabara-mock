// 試合の画面の並び A／B（KJ-085。作者 2026-11-25「実機を案Bにできたりする…?」。試すための切り替え）
// A＝今のまま（P-078）／B＝Back・Play・操作5つを放った言葉の下の暗い段へ。端末に覚える。Playwright の Chromium がないと skip になる
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
async function open(browser, url, stored = null, vp = { width: 375, height: 800 }) {
  const ctx = await browser.newContext({ viewport: vp, reducedMotion: "reduce" });
  await ctx.addInitScript((st) => { try { localStorage.setItem("kj-tutorial", "1"); if (st) localStorage.setItem("kj-layout", st); } catch (e) { /* 読めない端末 */ } }, stored);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
  return { ctx, page, errors };
}
async function play(page) {
  await page.check('#opp input[value="cpu"]');
  await page.check('#pow input[value="weak"]');
  await page.click("#start");
  await page.evaluate(() => {
    const G = __KJ.game; G.cpuTurn = () => null;
    G.me.cards = [..."天上天下十口休日"].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
    G.field = [..."山川玉"].map((c, i) => ({ id: 9500 + i, c, t: 0, fresh: false }));
    __KJ.render();
  });
}
const box = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, sel);
const inTable = (page, sel) => page.evaluate((s) => !!document.querySelector(s).closest(".table:not(.dock)"), sel);

test("並び：初期は A（今のまま）。Back は台の右端・操作は卓の中・下の段は隠れている", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const { ctx, page, errors } = await open(browser, `http://127.0.0.1:${srv.address().port}/index.html`);
    assert.equal(await page.isChecked('#layoutPick input[value="A"]'), true);
    await play(page);
    assert.equal(await page.evaluate(() => document.getElementById("dock").hidden), true);
    for (const id of ["bBack", "bRelease", "bSplit", "bJoin", "bInvert", "bCycle", "bHomo"]) assert.equal(await inTable(page, "#" + id), true, id + " は卓の中");
    const back = await box(page, "#bBack"), row = await box(page, "#row");
    assert.ok(back.l >= row.r - 1, "Back は台の右");
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});

test("並び：B にすると 操作5つ・Back・Play が放った言葉の下の段にあって押せる／覚える", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const url = `http://127.0.0.1:${srv.address().port}/index.html`;
    const { ctx, page, errors } = await open(browser, url);
    await page.check('#layoutPick input[value="B"]');
    assert.equal(await page.evaluate(() => localStorage.getItem("kj-layout")), "B");
    await play(page);
    assert.equal(await page.evaluate(() => document.getElementById("dock").hidden), false);
    for (const id of ["bBack", "bRelease", "bSplit", "bJoin", "bInvert", "bCycle", "bHomo"]) {
      assert.equal(await page.evaluate((i) => !!document.getElementById(i).closest("#dock"), id), true, id + " は下の段");
    }
    const rel = await box(page, "#released"), dock = await box(page, "#dock");
    assert.ok(dock.t >= rel.b - 1, "下の段は放った言葉の下");
    const set = await box(page, "#bSplit"), back = await box(page, "#bBack"), playB = await box(page, "#bRelease");
    assert.ok(back.t > set.b - 1, "Back・Play は操作5つの下の行");
    assert.ok(back.h >= 56 && playB.h >= 56, `Back・Play は 56px 以上（${back.h}・${playB.h}）`);
    assert.ok(back.r <= playB.l + 1, "Back は左・Play は右");
    const w = back.w / (back.w + playB.w);
    assert.ok(w > 0.27 && w < 0.36, `Back は3割（${w.toFixed(2)}）`);
    const sc = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    assert.equal(sc, true, "横にはみ出さない");
    // 覚える：開き直すと B
    await ctx.close();
    const again = await open(browser, url, "B");
    assert.equal(await again.page.isChecked('#layoutPick input[value="B"]'), true);
    await again.ctx.close();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); srv.close(); }
});

test("並び：B から A に戻すと元の場所へ（Back は台の右端）／覚えた値が壊れていれば A", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const url = `http://127.0.0.1:${srv.address().port}/index.html`;
    const { ctx, page, errors } = await open(browser, url, "B");
    await page.check('#layoutPick input[value="A"]');
    await play(page);
    assert.equal(await page.evaluate(() => document.getElementById("dock").hidden), true);
    for (const id of ["bBack", "bRelease", "bSplit", "bHomo"]) assert.equal(await inTable(page, "#" + id), true, id);
    const back = await box(page, "#bBack"), row = await box(page, "#row");
    assert.ok(back.l >= row.r - 1);
    const play_ = await box(page, "#bRelease");
    assert.ok(play_.w > 300, "Play は幅いっぱい");
    await ctx.close();
    const bad = await open(browser, url, "zzz");
    assert.equal(await bad.page.isChecked('#layoutPick input[value="A"]'), true);
    await bad.ctx.close();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); srv.close(); }
});

test("並び B：札を2枚選ぶと Split が下の段から押せる／選んでも手札は動かない", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const { ctx, page, errors } = await open(browser, `http://127.0.0.1:${srv.address().port}/index.html`, "B");
    await play(page);
    const before = await page.evaluate(() => __KJ.game.me.cards.map((c) => c.id).join(","));
    const tiles = page.locator("#meHand .tile");
    await tiles.nth(0).click(); await tiles.nth(1).click();
    assert.equal(await page.evaluate(() => document.getElementById("bSplit").disabled), false, "2枚選ぶと下の段の Split が押せる");
    const j = await box(page, "#bJoin");
    assert.ok(j.w > 20 && j.h >= 40, "Join は押せる大きさ");
    assert.equal(await page.evaluate(() => __KJ.game.me.cards.map((c) => c.id).join(",")), before);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});

test("並び B：広い画面（800px・560px）でも Back は左3割・Play は右7割・56px 以上で横並び", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    for (const width of [560, 800]) {
      const { ctx, page, errors } = await open(browser, `http://127.0.0.1:${srv.address().port}/index.html`, "B", { width, height: 900 });
      await play(page);
      const set = await box(page, "#bSplit"), back = await box(page, "#bBack"), playB = await box(page, "#bRelease");
      assert.ok(back.h >= 56 && playB.h >= 56, `${width}px：56px 以上（${back.h}・${playB.h}）`);
      assert.ok(Math.abs(back.t - playB.t) < 2 && back.r <= playB.l + 1, `${width}px：Back は Play の左で同じ行`);
      const w = back.w / (back.w + playB.w);
      assert.ok(w > 0.27 && w < 0.36, `${width}px：Back は3割（${w.toFixed(2)}）`);
      assert.ok(back.t > set.b - 1, `${width}px：操作5つの下の行`);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally { await browser.close(); srv.close(); }
});
