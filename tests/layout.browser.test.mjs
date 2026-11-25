// 試合の画面の置き場（KJ-078。作者 2026-11-25「案A 台のそばに Back」。D-096）：Back は台の右端／Play は幅いっぱい／Redraw は卓の外の点の行の右端で、長押しで引き直す
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


async function open(browser, url, vp = { width: 375, height: 800 }) {
  const ctx = await browser.newContext({ viewport: vp, reducedMotion: "reduce" });
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
  await page.evaluate(() => {
    const G = __KJ.game; G.cpuTurn = () => null;
    G.me.cards = [..."天上天下十口休日"].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
    G.field = [..."山川玉"].map((c, i) => ({ id: 9500 + i, c, t: 0, fresh: false }));
    __KJ.render();
  });
  return { ctx, page, errors };
}
const box = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, sel);
const handIds = (page) => page.evaluate(() => __KJ.game.me.cards.map((c) => c.id).join(","));
async function press(page, ms) { // Redraw をマウスで押して ms だけ待ち、離す
  const b = await box(page, "#bRedraw");
  await page.mouse.move(b.l + b.w / 2, b.t + b.h / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}
const shot = async (page, name) => { if (process.env.KJ_SHOT_DIR) await page.screenshot({ path: path.join(process.env.KJ_SHOT_DIR, name) }); };

test("置き場（KJ-078）：Back は台の右端・64×48 以上・台の札を戻す／Play は卓の幅いっぱい／群は Play の下／Redraw は点の行の右端（卓の外）", { skip }, async (t) => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); srv.close(); });
  const { ctx, page, errors } = await open(browser, url);
  // 札が無いとき：Back は押せない見た目
  assert.equal(await page.evaluate(() => document.getElementById("bBack").disabled), true, "台が空なら Back は押せない");
  await page.locator("#meHand .tile", { hasText: "休" }).first().click();
  await page.locator("#meHand .tile", { hasText: "日" }).first().click();
  assert.equal(await page.locator("#row .tile").count(), 2);
  assert.equal(await page.evaluate(() => document.getElementById("bBack").disabled), false, "札を選ぶと Back が押せる");
  // Back：台の行の右端（札の行の右にあって、同じ高さの帯にいる）
  const row = await box(page, "#row"), bk = await box(page, "#bBack");
  assert.ok(bk.w >= 64 && bk.h >= 48, `Back は 64×48 以上（${bk.w}×${bk.h}）`);
  assert.ok(bk.l >= row.r - 1, "Back は台の札の行の右");
  assert.ok(bk.t < row.b && bk.b > row.t, "Back は台と同じ高さの帯");
  const tb = await box(page, ".table");
  assert.ok(tb.r - bk.r <= 14, `Back は卓の右端そば（右の余白 ${tb.r - bk.r}px）`);
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("bBack")).borderTopWidth), "1px", "枠線付き");
  assert.ok(await page.evaluate(() => !!document.querySelector("#bBack svg") && document.getElementById("bBack").textContent.trim() === "Back"), "左向きの矢印＋Back");
  // Play：卓の幅いっぱい（卓の内側の幅）
  const play = await box(page, "#bRelease"), ops = await box(page, ".ops");
  assert.ok(Math.abs(play.w - ops.w) <= 1, `Play は幅いっぱい（${play.w} / ${ops.w}）`);
  // 群：Play の下に5つが1段
  const set = await page.evaluate(() => ["bSplit", "bJoin", "bInvert", "bCycle", "bHomo"].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { t: Math.round(r.top), l: r.left, r: r.right }; }));
  assert.equal(new Set(set.map((s) => s.t)).size, 1, "群は1段");
  assert.ok(set[0].t >= play.b - 1, "群は Play の下");
  assert.ok(Math.abs(set[0].l - ops.l) <= 1 && Math.abs(set[4].r - ops.r) <= 1, "群は Play と同じ幅に並ぶ");
  assert.equal(await page.evaluate(() => document.querySelectorAll(".ops-main button").length), 1, "Play の段には Play だけ");
  // Redraw：卓の外・「あなた ○点 手札」の行の右端
  const rd = await box(page, "#bRedraw"), sc = await box(page, "#meScore"), me = await box(page, "#meSide");
  assert.ok(await page.evaluate(() => !document.querySelector(".table").contains(document.getElementById("bRedraw")) && document.querySelector("#meSide .side-head").contains(document.getElementById("bRedraw"))), "Redraw は卓の外で、あなたの点の行の中");
  assert.ok(rd.t < sc.b + 20 && rd.b > sc.t - 20 && rd.l > sc.r, "Redraw は点と同じ行の右");
  assert.ok(me.r - rd.r <= 2, `Redraw は行の右端（${me.r - rd.r}px）`);
  assert.match(await page.textContent("#cdRedraw"), /^0pt あと5回$/, "点と回数の表示は今のまま");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= 375), true, "横スクロールがない");
  await shot(page, "kj-078-375-selected.png");
  // Back は今までどおり台の札を全部戻す（1枚のときは最後の1枚を戻す）。カードの「最後の1枚を戻す」は1枚のときの形
  await page.click("#bBack");
  assert.equal(await page.locator("#row .tile").count(), 0, "Back で台が空になる（選んだ札はぜんぶ戻る）");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("Redraw（KJ-078）：1回タップでは引き直さず「長押しで引き直し」と小さく出る／長押しで引き直す／途中で離すと引き直さない／押している間は地が埋まる", { skip }, async (t) => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); srv.close(); });
  const { ctx, page, errors } = await open(browser, url);
  const h0 = await handIds(page);
  // 1回タップ
  await page.click("#bRedraw");
  await page.waitForTimeout(100);
  assert.equal(await handIds(page), h0, "1回タップでは引き直さない");
  assert.equal(await page.textContent("#rdNote"), "長押しで引き直し", "短く案内が出る");
  assert.equal(await page.evaluate(() => __KJ.game.me.redraws || 0), 0, "回数も減らない");
  assert.equal(await page.locator("#msg .why, #msg.rej").count(), 0, "🚫 ではない");
  assert.equal(await page.evaluate(() => document.getElementById("msg").textContent.includes("🚫")), false);
  // 途中で離す（0.3秒）
  await press(page, 300);
  await page.waitForTimeout(500);
  assert.equal(await handIds(page), h0, "途中で離したら引き直さない");
  assert.equal(await page.evaluate(() => document.getElementById("bRedraw").classList.contains("holding")), false, "離したら埋まりも戻る");
  // 押している間：地が左から埋まる（途中の画像）
  const b = await box(page, "#bRedraw");
  await page.mouse.move(b.l + b.w / 2, b.t + b.h / 2);
  await page.mouse.down();
  await page.waitForTimeout(300);
  const w = await page.evaluate(() => { const bt = document.getElementById("bRedraw"); return { cls: bt.classList.contains("holding"), fill: parseFloat(getComputedStyle(bt, "::before").width), full: bt.getBoundingClientRect().width }; });
  assert.equal(w.cls, true);
  assert.ok(w.fill > 4 && w.fill < w.full - 2, `押している間、地が途中まで埋まっている（${Math.round(w.fill)} / ${Math.round(w.full)}）`);
  assert.equal(await handIds(page), h0, "まだ引き直さない");
  await shot(page, "kj-078-375-redraw-holding.png");
  await page.waitForTimeout(500);
  assert.notEqual(await handIds(page), h0, "埋まりきったら引き直す");
  await page.mouse.up();
  assert.equal(await page.textContent("#cdRedraw"), "-5pt あと4回", "1回引き直した（次は -5pt あと4回）");
  assert.equal(await page.evaluate(() => __KJ.game.me.redraws), 1, "指を離しても二重に引き直さない");
  // 長押しの長さは1か所の定数
  assert.match(fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), /const REDRAW_HOLD_MS=600;/);
  assert.deepEqual(errors, []);
  await ctx.close();
});
