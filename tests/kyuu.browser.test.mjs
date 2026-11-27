// 旧＝｜＋日（KJ-113）：画面で 中 を割って ｜ を出し、日 と並べて Join すると 旧 になる。逆の並びでは はじかれる。割ると ｜日 に戻る。375×667 で収まる
// Playwright の Chromium がないと skip になる。KJ_SHOT_KYUU=<フォルダ> を付けると 画像を書く
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
    G.me.cards = [..."中日人木休辶"].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
    G.cpu.cards = [..."人木山川"].map((c, i) => ({ id: 9700 + i, c, t: 0, fresh: false }));
    G.field = [..."山川玉"].map((c, i) => ({ id: 9500 + i, c, t: 0, fresh: false }));
    __KJ.render();
  });
  return { ctx, page, errors };
}

const SHOT = process.env.KJ_SHOT_KYUU;
const hand = (page) => page.evaluate(() => __KJ.game.me.cards.map((x) => x.c).join(""));
const pick = async (page, ...cs) => { for (const c of cs) await page.locator("#meHand .tile", { hasText: c }).first().click(); };
const shot = async (page, name) => { if (SHOT) { fs.mkdirSync(SHOT, { recursive: true }); await page.screenshot({ path: path.join(SHOT, name) }); } };

test("旧（KJ-113）：中 を割って ｜ を出し、日 と並べて Join すると 旧。割ると ｜日 に戻る", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const { ctx, page, errors } = await open(browser, `http://127.0.0.1:${srv.address().port}/index.html`);
    // 中 を割る → 口 と ｜
    await pick(page, "中");
    await page.click("#bSplit");
    const h1 = await hand(page);
    assert.ok(h1.includes("｜") && h1.includes("口") && !h1.includes("中"), h1);
    await shot(page, "kyuu-1-bar-and-sun-375x667.png");
    // 割ると 口（1）・｜（2）が選ばれたまま：口 を外し、日 を選ぶ（｜ が先・日 が後）→ Join で 旧
    await pick(page, "口", "日");
    assert.equal(await page.getAttribute("#bJoin", "aria-disabled"), "false", "｜日 の順なら Join が押せる");
    await shot(page, "kyuu-2-selected-375x667.png");
    await page.click("#bJoin");
    const h2 = await hand(page);
    assert.ok(h2.includes("旧") && !h2.includes("｜"), h2);
    assert.equal([...h2].filter((c) => c === "日").length, 0, "日 は 旧 になった：" + h2);
    await shot(page, "kyuu-3-joined-375x667.png");
    // 割ると ｜ と 日 に戻る
    await page.evaluate(() => { __KJ.game.me.cd.split = 0; __KJ.render(); }); // KJ-138：割るの待ち時間は満ちたことにする（時間に頼らない）
    await page.click("#bSplit"); // くっつけた 旧 は選ばれたまま
    const h3 = await hand(page);
    assert.ok(h3.includes("｜") && h3.includes("日") && !h3.includes("旧"), h3);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});

test("旧（KJ-113）：日 と ｜ の並び（日が左）では Join が押せない。375×667 の手札が画面に収まる", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const { ctx, page, errors } = await open(browser, `http://127.0.0.1:${srv.address().port}/index.html`);
    await page.evaluate(() => {
      const G = __KJ.game; G.me.cards = [..."日｜人木休辶"].map((c, i) => ({ id: 9100 + i, c, t: 0, fresh: false }));
      __KJ.render();
    });
    await pick(page, "日", "｜");
    const r = await page.evaluate(() => ({ en: document.getElementById("bJoin").getAttribute("aria-disabled") !== "true", w: document.documentElement.scrollWidth, vw: innerWidth }));
    assert.equal(r.en, false, "日｜ の並びではくっつかない");
    assert.ok(r.w <= r.vw, `横にはみ出さない（${r.w} <= ${r.vw}）`);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});
