// KJ-079（D-098）：自刃 を放って場から取り終わると、画面に「自刃：休 が切れた」が出る。割れる札が無ければ「自刃：切れる札が無かった」
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

async function begin(browser, url, hand) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 }, reducedMotion: "reduce" });
  await ctx.addInitScript(() => { try { localStorage.setItem("kj-tutorial", "1"); } catch (e) { /* 読めない端末 */ } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
  await page.check('#lvl input[value="N4"]');
  await page.check('#opp input[value="cpu"]');
  await page.check('#pow input[value="weak"]');
  await page.click("#start");
  await page.evaluate((h) => {
    const G = __KJ.game; G.cpuTurn = () => null;
    G.me.cards = [...h].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
    G.field = [..."山川玉"].map((c, i) => ({ id: 9500 + i, c, t: 0, fresh: false }));
    G.deck.splice(0, G.deck.length, ...Array(60).fill("一"));
    __KJ.render();
  }, hand);
  return { ctx, page, errors };
}
const tap = (page, ch) => page.locator("#meHand .tile:not(.sel)", { hasText: ch }).first().click();
async function throwAndTake(page) {
  await tap(page, "自"); await tap(page, "刃");
  await page.click("#bRelease");
  await page.locator("#field .tile").nth(0).click();
  await page.locator("#field .tile").nth(0).click();
}

test("自刃の画面（KJ-079）", { skip }, async (t) => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); srv.close(); });

  await t.test("放って取り終わると「自刃：休 が切れた」。休 は 人 と 木 に", async () => {
    const { ctx, page, errors } = await begin(browser, url, "自刃休一一一");
    await throwAndTake(page);
    assert.equal(await page.evaluate(() => __KJ.game.me.takes), 0);
    assert.equal((await page.locator("#msg").innerText()).trim(), "自刃：休 が切れた");
    assert.equal(await page.evaluate(() => __KJ.game.me.cards.map((x) => x.c).includes("休")), false);
    assert.equal(await page.evaluate(() => __KJ.game.me.score), 3, "点はふつうの2字3点");
    await page.screenshot({ path: path.join(ROOT, "docs/img/kj-079-jijin-hit-375.png") });
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("割れる札が無いときは「自刃：切れる札が無かった」", async () => {
    const { ctx, page, errors } = await begin(browser, url, "自刃一一一一");
    await throwAndTake(page);
    assert.equal((await page.locator("#msg").innerText()).trim(), "自刃：切れる札が無かった");
    await page.screenshot({ path: path.join(ROOT, "docs/img/kj-079-jijin-none-375.png") });
    assert.deepEqual(errors, []);
    await ctx.close();
  });
});
