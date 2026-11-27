// 耂（KJ-114）：画面で 教 を割って 孝、孝 を割って 耂、耂 を割って 土・ノ。土＋ノ を Join すると 耂 に戻る。375×667 で収まる
// Playwright の Chromium がないと skip になる。KJ_SHOT_OIGASHIRA=<フォルダ> を付けると 画像を書く
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
    G.me.cards = [..."教人木休辶川"].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
    G.cpu.cards = [..."人木山川"].map((c, i) => ({ id: 9700 + i, c, t: 0, fresh: false }));
    G.field = [..."山川玉"].map((c, i) => ({ id: 9500 + i, c, t: 0, fresh: false }));
    __KJ.render();
  });
  return { ctx, page, errors };
}

const SHOT = process.env.KJ_SHOT_OIGASHIRA;
const hand = (page) => page.evaluate(() => __KJ.game.me.cards.map((x) => x.c).join(""));
const pick = async (page, ...cs) => { for (const c of cs) await page.locator("#meHand .tile", { hasText: c }).first().click(); };
const shot = async (page, name) => { if (SHOT) { fs.mkdirSync(SHOT, { recursive: true }); await page.screenshot({ path: path.join(SHOT, name) }); } };

test("耂（KJ-114）：教 → 孝 → 耂 と割り、耂 を割ると 土・ノ。土 と ノ を Join すると 耂", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const { ctx, page, errors } = await open(browser, `http://127.0.0.1:${srv.address().port}/index.html`);
    assert.equal(await page.evaluate(() => __KJ.game.T.level), "N4");
    await pick(page, "教"); await page.click("#bSplit");
    assert.ok((await hand(page)).includes("孝"), await hand(page));
    await page.evaluate(() => { __KJ.game.me.cd.split = 0; __KJ.render(); }); // KJ-138：割るの待ち時間は満ちたことにする
    await pick(page, "攵"); await page.click("#bSplit"); // 割ったあとは 孝・攵 が選ばれたまま。攵 を外して 孝 だけ割る
    let h = await hand(page);
    assert.ok(h.includes("耂") && h.includes("子") && !h.includes("孝"), h);
    // 耂 だけを選んで割る（割ったあとは割れた2枚が選ばれたまま。選び直す）
    await page.evaluate(() => { __KJ.game.me.cards = [..."耂人木休辶川"].map((c, i) => ({ id: 9200 + i, c, t: 0, fresh: false })); __KJ.render(); });
    await pick(page, "耂");
    await shot(page, "oigashira-1-selected-375x667.png");
    await page.evaluate(() => { __KJ.game.me.cd.split = 0; __KJ.render(); }); // KJ-138：割るの待ち時間は満ちたことにする（時間に頼らない）
    assert.equal(await page.getAttribute("#bSplit", "aria-disabled"), "false", "耂 は割れる");
    await page.click("#bSplit");
    h = await hand(page);
    assert.ok(h.includes("土") && h.includes("ノ") && !h.includes("耂"), h);
    await shot(page, "oigashira-2-split-375x667.png");
    // 土 → ノ の順に選ぶと Join で 耂 に戻る（割った直後の選びを外してから選び直す）
    await page.evaluate(() => { __KJ.game.me.cards = [..."土ノ人木休辶"].map((c, i) => ({ id: 9300 + i, c, t: 0, fresh: false })); __KJ.render(); });
    await pick(page, "土", "ノ");
    assert.equal(await page.getAttribute("#bJoin", "aria-disabled"), "false", "土ノ の順なら Join が押せる");
    await page.click("#bJoin");
    h = await hand(page);
    assert.ok(h.includes("耂") && !h.includes("ノ"), h);
    await shot(page, "oigashira-3-joined-375x667.png");
    const r = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, vw: innerWidth }));
    assert.ok(r.w <= r.vw, "横にはみ出さない");
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});
