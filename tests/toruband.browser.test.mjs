// 取る番の帯（KJ-146）：台の上に黒地に白抜きの帯「山札ヨリ 弐枚 取レ」。取るごとに数が減り、取りきると消える・
// 数は大字・押せない（山札は押せる）・動きを減らす設定では動かさない・English は「Take 2 from the deck」・
// 台の上に収まる（375／320px）・CPU 戦で出る。ひとり・チュートリアル・合言葉の部屋は同じ renderField を通るが、この試験では開いていない（PR に書いた）。3字は takes を直に書いて見る。
// Playwright の Chromium がないと skip になる。KJ_SHOT_TORUBAND=<フォルダ> で画像を書く
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
async function start(browser, url, reducedMotion, lang, vp) {
  const ctx = await browser.newContext({ viewport: vp || { width: 375, height: 667 }, reducedMotion, locale: lang || "ja-JP" });
  await ctx.addInitScript(() => { try { localStorage.setItem("kj-tutorial", "1"); } catch (e) { /* */ } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("setupInfo").textContent.trim().length > 3);
  await page.check('#opp input[value="cpu"]');
  await page.check('#pow input[value="weak"]');
  await page.click("#start");
  await page.evaluate(() => {
    const G = __KJ.game; G.cpuTurn = () => null;
    G.me.cards = [..."日本上下山川口木"].map((c, i) => ({ id: 9100 + i, c, t: 0, fresh: false }));
    __KJ.render();
  });
  return { ctx, page, errors };
}
const op = (page, sel) => page.evaluate((s) => +getComputedStyle(document.querySelector(s)).opacity, sel);
async function release(page) {
  await page.locator("#meHand .tile", { hasText: "日" }).first().click();
  await page.locator("#meHand .tile", { hasText: "本" }).first().click();
  await page.click("#bRelease");
  await page.waitForFunction(() => __KJ.game.me.takes > 0);
}

const band = (page) => page.evaluate(() => { const b = document.getElementById("takeBand"); const r = document.getElementById("row").getBoundingClientRect(); const q = b.getBoundingClientRect(); const cs = getComputedStyle(b); return { hidden: b.hidden, text: b.textContent, parts: [...b.children].map((x) => x.textContent), bg: cs.backgroundColor, fg: cs.color, pe: cs.pointerEvents, anim: cs.animationName, shown: b.dataset.shown || null, fits: q.left >= r.left - 1 && q.right <= r.right + 1 && q.top >= r.top - 1 && q.bottom <= r.bottom + 1, overflow: b.scrollWidth <= b.clientWidth + 1 && b.scrollHeight <= b.clientHeight + 1, lines: new Set([...b.children].map((x) => Math.round(x.getBoundingClientRect().top))).size, box: [q.width, q.height, r.width, r.height] }; });

for (const [name, rm] of [["動きあり", "no-preference"], ["動きを減らす", "reduce"]]) {
  test(`取る番の帯（${name}）：出る・大字・減る・取りきると消える・押せない`, { skip }, async () => {
    const srv = await serve(); const browser = await chromium.launch();
    try {
      const { ctx, page, errors } = await start(browser, `http://127.0.0.1:${srv.address().port}/index.html`, rm);
      assert.equal((await band(page)).hidden, true, "取る番の前は出ない");
      await release(page);
      await page.waitForTimeout(350);
      let b = await band(page);
      assert.equal(b.hidden, false);
      assert.deepEqual(b.parts, ["山札ヨリ", "弐枚", "取レ"], "2字なので 弐枚");
      assert.equal(b.bg, "rgb(42, 38, 34)", "地は墨");
      assert.equal(b.fg, "rgb(246, 238, 214)", "字は札の白");
      assert.equal(b.pe, "none", "押せない");
      assert.equal(b.fits, true, "台の上に収まる");
      assert.equal(b.overflow, true, "はみ出さない");
      if (rm === "reduce") { assert.equal(b.shown, null); assert.equal(b.anim, "none", "動かさない"); }
      else { assert.equal(b.shown, "1", "一度だけ出す"); await page.evaluate(() => __KJ.render()); assert.equal((await band(page)).shown, "1", "描き直しても出し直さない"); }
      if (process.env.KJ_SHOT_TORUBAND) { await page.waitForTimeout(350); await page.screenshot({ path: path.join(process.env.KJ_SHOT_TORUBAND, `kj-146-${rm}.png`) }); }
      // 山札は帯があっても押せる
      await page.locator("#field .tile").first().click();
      await page.waitForFunction(() => __KJ.game.me.takes === 1);
      b = await band(page);
      assert.deepEqual(b.parts, ["山札ヨリ", "壱枚", "取レ"], "取ると減る");
      if (rm !== "reduce") assert.equal(b.shown, "1", "減っても出し直さない");
      await page.locator("#field .tile").first().click();
      await page.waitForFunction(() => __KJ.game.me.takes === 0);
      assert.equal((await band(page)).hidden, true, "取りきると消える");
      assert.deepEqual(errors, []);
      await ctx.close();
    } finally { await browser.close(); srv.close(); }
  });
}

test("取る番の帯：3字は 参枚・English は Take 3 from the deck・320px で台の上に収まる", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const url = `http://127.0.0.1:${srv.address().port}/index.html`;
    for (const [w, h] of [[375, 667], [320, 640]]) {
      const { ctx, page, errors } = await start(browser, url, "no-preference", "ja-JP", { width: w, height: h });
      await page.evaluate(() => { __KJ.game.me.takes = 3; __KJ.render(); });
      let b = await band(page);
      assert.deepEqual(b.parts, ["山札ヨリ", "参枚", "取レ"], `${w}px 参枚`);
      assert.equal(b.fits && b.overflow, true, `${w}px：台の上に収まる`);
      assert.ok(b.lines <= 2, `${w}px：2行まで（${b.lines}）`);
      if (process.env.KJ_SHOT_TORUBAND) { await page.waitForTimeout(350); await page.screenshot({ path: path.join(process.env.KJ_SHOT_TORUBAND, `kj-146-${w}-ja.png`) }); }
      await ctx.close();
      const c2 = await start(browser, url, "no-preference", "en-US", { width: w, height: h });
      await c2.page.evaluate(() => { __KJ.game.me.takes = 2; __KJ.render(); });
      b = await band(c2.page);
      assert.deepEqual(b.parts, ["Take", "2", "from the deck"], `${w}px English`);
      assert.equal(b.fits && b.overflow, true, `${w}px English：台の上に収まる`);
      assert.ok(b.lines <= 2, `${w}px English：2行まで（${b.lines}）`);
      if (process.env.KJ_SHOT_TORUBAND) { await c2.page.waitForTimeout(350); await c2.page.screenshot({ path: path.join(process.env.KJ_SHOT_TORUBAND, `kj-146-${w}-en.png`) }); }
      assert.deepEqual([...errors, ...c2.errors], []);
      await c2.ctx.close();
    }
  } finally { await browser.close(); srv.close(); }
});
