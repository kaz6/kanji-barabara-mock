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

async function begin(browser, url, hand, cpuHand) {
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
  await page.evaluate(([h, cpu]) => {
    const G = __KJ.game; G.cpuTurn = () => null;
    G.me.cards = [...h].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
    G.field = [..."山川玉"].map((c, i) => ({ id: 9500 + i, c, t: 0, fresh: false }));
    G.deck.splice(0, G.deck.length, ...Array(60).fill("一"));
    if (cpu) G.cpu.cards = [...cpu].map((c, i) => ({ id: 9800 + i, c, t: 0, fresh: false }));
    __KJ.render();
  }, [hand, cpuHand]);
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
    if (process.env.KJ_SHOT) await page.screenshot({ path: path.join(ROOT, "docs/img/kj-079-jijin-hit-375.png") }); // 画像は KJ_SHOT=1 のときだけ撮り直す
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("割れる札が無いときは「自刃：切れる札が無かった」", async () => {
    const { ctx, page, errors } = await begin(browser, url, "自刃一一一一");
    await throwAndTake(page);
    assert.equal((await page.locator("#msg").innerText()).trim(), "自刃：切れる札が無かった");
    if (process.env.KJ_SHOT) await page.screenshot({ path: path.join(ROOT, "docs/img/kj-079-jijin-none-375.png") }); // 画像は KJ_SHOT=1 のときだけ撮り直す
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  // KJ-080（D-099）：相手の札に効く語。放った瞬間（場から取る前）に画面の文が出る
  const throwWord = async (page, w) => { for (const ch of w) await tap(page, ch); await page.click("#bRelease"); };

  await t.test("切る を放つと、放った瞬間に「あなたの 切る：CPU の 休 が割れた」。CPU の 休 は 人 と 木 に（点は2字3点）", async () => {
    const { ctx, page, errors } = await begin(browser, url, "切儿一一一", "休一一一一一一一");
    await throwWord(page, "切儿");
    assert.ok(await page.evaluate(() => __KJ.game.me.takes) > 0, "まだ場から取っていない");
    assert.equal((await page.locator("#msg").innerText()).trim(), "あなたの 切る：CPU の 休 が割れた");
    assert.equal(await page.evaluate(() => __KJ.game.cpu.cards.map((x) => x.c).join("")), "人木一一一一一一一");
    assert.equal(await page.evaluate(() => __KJ.game.me.score), 3);
    if (process.env.KJ_SHOT) await page.screenshot({ path: path.join(ROOT, "docs/img/kj-080-kiru-375.png") }); // 画像は KJ_SHOT=1 のときだけ撮り直す
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("回転 は「あなたの 回転：CPU の 六 が 七 に」・効く札が無ければ「あなたの 回転：空振り」", async () => {
    let r = await begin(browser, url, "回転一一一", "六年年年年年年年");
    await throwWord(r.page, "回転");
    assert.equal((await r.page.locator("#msg").innerText()).trim(), "あなたの 回転：CPU の 六 が 七 に");
    if (process.env.KJ_SHOT) await r.page.screenshot({ path: path.join(ROOT, "docs/img/kj-080-kaiten-375.png") });
    assert.deepEqual(r.errors, []);
    await r.ctx.close();
    r = await begin(browser, url, "回転一一一", "年年年年年年年年");
    await throwWord(r.page, "回転");
    assert.equal((await r.page.locator("#msg").innerText()).trim(), "あなたの 回転：空振り");
    if (process.env.KJ_SHOT) await r.page.screenshot({ path: path.join(ROOT, "docs/img/kj-080-karaburi-375.png") });
    await r.ctx.close();
  });

  await t.test("CPU が放った 切る が人の 休 に効くと「CPU の 切る：あなたの 休 が割れた」。画面の手札が替わる", async () => {
    const { ctx, page, errors } = await begin(browser, url, "休一一一一一一一", "切儿一一一");
    await page.evaluate(() => {
      const G = __KJ.game;
      G.release(G.cpu, G.cpu.cards.filter((x) => x.c === "切" || x.c === "儿").map((x) => x.id));
      __KJ.drain(); __KJ.render();
    });
    assert.equal((await page.locator("#msg").innerText()).trim(), "CPU の 切る：あなたの 休 が割れた");
    assert.equal(await page.evaluate(() => __KJ.game.me.cards.map((x) => x.c).join("")), "人木一一一一一一一");
    assert.equal(await page.locator("#meHand .tile", { hasText: "休" }).count(), 0, "画面の 休 が消えた");
    if (process.env.KJ_SHOT) await page.screenshot({ path: path.join(ROOT, "docs/img/kj-080-cpu-kiru-375.png") });
    assert.deepEqual(errors, []);
    await ctx.close();
  });
});

