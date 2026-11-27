// 取る番を気づきやすくする（KJ-119）：取る番のあいだ、取れない所（台・操作・手札・ストック）を薄くする・取りきると戻る・
// 入った瞬間に山札の札が一度だけ弾む（印 data-pops）・動きを減らす設定では弾まない（薄くするのは残す）・見出しの横に「あと N 枚」。
// Playwright の Chromium がないと skip になる。KJ_SHOT_TORU=<フォルダ> で 375×667 の画像を書く
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
async function start(browser, url, reducedMotion) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, reducedMotion });
  await ctx.addInitScript(() => { try { localStorage.setItem("kj-tutorial", "1"); } catch (e) { /* */ } });
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

for (const [name, rm] of [["動きあり", "no-preference"], ["動きを減らす", "reduce"]]) {
  test(`取る番（${name}）：取れない所が薄くなり、取りきると戻る。見出しの横に あと N 枚`, { skip }, async () => {
    const srv = await serve(); const browser = await chromium.launch();
    try {
      const { ctx, page, errors } = await start(browser, `http://127.0.0.1:${srv.address().port}/index.html`, rm);
      for (const s of [".stage", "#meHand", "#meTray", ".bkrd"]) assert.equal(await op(page, s), 1, `${s}：取る番でないときは濃い`);
      assert.equal(await page.textContent("#takeShort"), "");
      assert.equal(await page.getAttribute("#field", "data-pops"), null, "まだ弾んでいない");
      await release(page);
      await page.waitForTimeout(400);
      for (const s of [".stage", "#meHand", "#meTray", ".bkrd"]) assert.ok(Math.abs(await op(page, s) - 0.45) < 0.02, `${s}：取る番は薄い（0.45）`);
      for (const s of ["#field", "#fieldSide", "#cpuSide"]) assert.equal(await op(page, s), 1, `${s}：山札と相手は濃いまま`);
      const n = await page.evaluate(() => __KJ.game.me.takes);
      assert.equal(await page.textContent("#takeShort"), `あと ${n} 枚`);
      assert.match(await page.textContent("#takes"), /山札から あと \d 枚 取る/, "卓の頭の文も今のまま");
      const pops = await page.getAttribute("#field", "data-pops");
      if (rm === "reduce") {
        assert.equal(pops, null, "動きを減らす設定では弾ませない");
        assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#field .tile")).animationName), "none");
      } else {
        assert.equal(pops, "1", "入った瞬間に一度だけ");
        await page.evaluate(() => __KJ.render()); await page.evaluate(() => __KJ.render());
        assert.equal(await page.getAttribute("#field", "data-pops"), "1", "描き直しても数えない（一度だけ）");
      }
      if (process.env.KJ_SHOT_TORU) await page.screenshot({ path: path.join(process.env.KJ_SHOT_TORU, `kj-119-${rm}.png`) });
      // 1枚目を取っても取る番は続く（薄いまま）、取りきると戻る
      await page.locator("#field .tile").first().click();
      await page.waitForFunction(() => __KJ.game.me.takes === 1);
      assert.ok(Math.abs(await op(page, ".stage") - 0.45) < 0.02, "あと1枚：まだ薄い");
      if (rm !== "reduce") assert.equal(await page.getAttribute("#field", "data-pops"), "1", "1枚取っても弾み直さない");
      await page.locator("#field .tile").first().click();
      await page.waitForFunction(() => __KJ.game.me.takes === 0);
      await page.waitForTimeout(400);
      for (const s of [".stage", "#meHand", "#meTray", ".bkrd"]) assert.equal(await op(page, s), 1, `${s}：取りきると戻る`);
      assert.equal(await page.textContent("#takeShort"), "");
      assert.deepEqual(errors, []);
      await ctx.close();
    } finally { await browser.close(); srv.close(); }
  });
}
