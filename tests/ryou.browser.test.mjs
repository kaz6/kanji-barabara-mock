// 良＝丶＋艮（KJ-137）：N4 の画面で 銀 を割って 艮 を出し、丶 と並べて Join すると 良 になる。艮丶 の並びは押せない。割ると 丶艮 に戻る。375×667 で収まる
// Playwright の Chromium がないと skip になる。KJ_SHOT_RYOU=<フォルダ> を付けると 画像を書く
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
async function open(browser, url, { reduce = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, reducedMotion: reduce ? "reduce" : "no-preference" });
  await ctx.addInitScript(() => {
    try { if (!sessionStorage.getItem("kjInit")) { sessionStorage.setItem("kjInit", "1"); localStorage.setItem("kj-tutorial", "1"); } } catch (e) { /* 読めない端末 */ }
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
  await page.check('#opp input[value="cpu"]');
  await page.check('#pow input[value="weak"]');
  await page.click("#start");
  await page.evaluate(() => {
    const G = __KJ.game; G.cpuTurn = () => null;
    G.me.cards = [..."銀丶人木休辶"].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
    G.cpu.cards = [..."人木山川"].map((c, i) => ({ id: 9700 + i, c, t: 0, fresh: false }));
    G.field = [..."山川玉"].map((c, i) => ({ id: 9500 + i, c, t: 0, fresh: false }));
    __KJ.render();
  });
  return { ctx, page, errors };
}

const SHOT = process.env.KJ_SHOT_RYOU;
const hand = (page) => page.evaluate(() => __KJ.game.me.cards.map((x) => x.c).join(""));
const pick = async (page, ...cs) => { for (const c of cs) await page.locator("#meHand .tile", { hasText: c }).first().click(); };
const shot = async (page, name) => { if (SHOT) { fs.mkdirSync(SHOT, { recursive: true }); await page.screenshot({ path: path.join(SHOT, name) }); } };

test("良（KJ-137）：N4 で 銀 を割って 艮 を出し、丶 と並べて Join すると 良。割ると 丶艮 に戻る", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const { ctx, page, errors } = await open(browser, `http://127.0.0.1:${srv.address().port}/index.html`);
    await pick(page, "銀");
    await page.click("#bSplit");
    const h1 = await hand(page);
    assert.ok(h1.includes("艮") && h1.includes("金") && !h1.includes("銀"), h1);
    await shot(page, "ryou-1-split-375x667.png");
    // 割ると 金（1）・艮（2）が選ばれたまま：金 を外し、丶 を選ぶ（丶 が先・艮 が後の順にそろえる）
    await pick(page, "金");
    await page.locator("#meHand .tile", { hasText: "艮" }).first().click(); // 艮 をいったん外す
    await pick(page, "丶", "艮");
    assert.equal(await page.getAttribute("#bJoin", "aria-disabled"), "false", "丶艮 の順なら Join が押せる");
    await shot(page, "ryou-2-selected-375x667.png");
    await page.click("#bJoin");
    const h2 = await hand(page);
    assert.ok(h2.includes("良") && !h2.includes("艮") && !h2.includes("丶"), h2);
    await shot(page, "ryou-3-joined-375x667.png");
    await page.click("#bSplit");
    const h3 = await hand(page);
    assert.ok(h3.includes("丶") && h3.includes("艮") && !h3.includes("良"), h3);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});

test("良（KJ-137）：艮 と 丶 の並び（艮が先）では Join が押せない。375×667 の手札が画面に収まる", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const { ctx, page, errors } = await open(browser, `http://127.0.0.1:${srv.address().port}/index.html`);
    await page.evaluate(() => {
      const G = __KJ.game; G.me.cards = [..."艮丶人木休辶"].map((c, i) => ({ id: 9100 + i, c, t: 0, fresh: false }));
      __KJ.render();
    });
    await pick(page, "艮", "丶");
    const r = await page.evaluate(() => ({ en: document.getElementById("bJoin").getAttribute("aria-disabled") !== "true", w: document.documentElement.scrollWidth, vw: innerWidth }));
    assert.equal(r.en, false, "艮丶 の並びではくっつかない");
    assert.ok(r.w <= r.vw, `横にはみ出さない（${r.w} <= ${r.vw}）`);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});
