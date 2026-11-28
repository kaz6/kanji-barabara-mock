// 虽＝厶＋虫（KJ-139）：N4 の画面で 強 を割って 弓・虽、虽 をさらに割って 厶・虫。厶＋虫 を Join すると 虽 に戻る。375×667 で収まる
// Playwright の Chromium がないと skip になる。KJ_SHOT_PARTS10=<フォルダ> を付けると 画像を書く
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
    G.me.cards = [..."強人木休辶口"].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
    G.cpu.cards = [..."人木山川"].map((c, i) => ({ id: 9700 + i, c, t: 0, fresh: false }));
    G.field = [..."山川玉"].map((c, i) => ({ id: 9500 + i, c, t: 0, fresh: false }));
    __KJ.render();
  });
  return { ctx, page, errors };
}

const SHOT = process.env.KJ_SHOT_PARTS10;
const hand = (page) => page.evaluate(() => __KJ.game.me.cards.map((x) => x.c).join(""));
const pick = async (page, ...cs) => { for (const c of cs) await page.locator("#meHand .tile", { hasText: c }).first().click(); };
const shot = async (page, name) => { if (SHOT) { fs.mkdirSync(SHOT, { recursive: true }); await page.screenshot({ path: path.join(SHOT, name) }); } };
const ready = (page) => page.evaluate(() => { __KJ.game.me.cd.split = 0; __KJ.render(); }); // KJ-138：割るの待ち時間は満ちたことにする

test("虽（KJ-139）：N4 で 強 を割って 弓・虽、虽 を割って 厶・虫、厶＋虫 を Join すると 虽 に戻る", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const { ctx, page, errors } = await open(browser, `http://127.0.0.1:${srv.address().port}/index.html`);
    await pick(page, "強");
    await page.click("#bSplit");
    const h1 = await hand(page);
    assert.ok(h1.includes("虽") && h1.includes("弓") && !h1.includes("強"), h1);
    await shot(page, "parts10-1-split-375x667.png");
    await ready(page);
    // 割ると 弓・虽 が選ばれたまま：弓 を外して 虽 だけにする
    await pick(page, "弓");
    await page.click("#bSplit");
    const h2 = await hand(page);
    assert.ok(h2.includes("厶") && h2.includes("虫") && !h2.includes("虽"), h2);
    await shot(page, "parts10-2-split2-375x667.png");
    // 割ると 厶・虫 が選ばれたまま：Join で 虽 に戻る
    assert.equal(await page.getAttribute("#bJoin", "aria-disabled"), "false");
    await page.click("#bJoin");
    const h3 = await hand(page);
    assert.ok(h3.includes("虽") && !h3.includes("厶") && !h3.includes("虫"), h3);
    await shot(page, "parts10-3-joined-375x667.png");
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});
