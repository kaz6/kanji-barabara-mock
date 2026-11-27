// スマホの振動の画面（KJ-074）：navigator.vibrate を差し替えて、手ごとに決めた形で呼ばれるか・切なら呼ばれないか・無い端末で落ちないか・相手の手では呼ばれないか
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
try { ({ chromium } = require("./pwja.cjs")); } catch { /* 入っていない */ }
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

// vibrate: true＝呼ばれた形を window.__vib に残す差し替え／false＝navigator.vibrate が無い端末（iOS など）。pref＝端末に覚えた入り切り
async function open(browser, url, { vibrate = true, pref = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 900 }, reducedMotion: "reduce" });
  await ctx.addInitScript(([v, p]) => {
    try { localStorage.setItem("kj-tutorial", "1"); if (p !== null) localStorage.setItem("kj-vibe", p); } catch (e) { /* 読めない端末 */ }
    window.__vib = [];
    if (v) Object.defineProperty(navigator, "vibrate", { configurable: true, value: (x) => { window.__vib.push(x); return true; } });
    else Object.defineProperty(navigator, "vibrate", { configurable: true, value: undefined });
  }, [vibrate, pref]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
  return { ctx, page, errors };
}
// 試合を始めて、手札と場を決める（CPU は止める）
async function begin(page, hand = "天上天下十口休日") {
  await page.check('#opp input[value="cpu"]');
  await page.check('#pow input[value="weak"]');
  await page.click("#start");
  await page.evaluate((h) => {
    const G = __KJ.game; G.cpuTurn = () => null;
    G.me.cards = [...h].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
    G.field = [..."山川玉"].map((c, i) => ({ id: 9500 + i, c, t: 0, fresh: false }));
  }, hand);
  await page.evaluate(() => __KJ.render());
}
const vib = (page) => page.evaluate(() => window.__vib);
const tap = (page, ch) => page.locator("#meHand .tile:not(.sel)", { hasText: ch }).first().click();

test("振動", { skip }, async (t) => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); srv.close(); });

  await t.test("手ごとに決めた形で震える（はじかれた→放つ→取る→割る→くっつける）", async () => {
    const { ctx, page, errors } = await open(browser, url);
    assert.equal(await page.locator("#bGear").isVisible(), true, "navigator.vibrate がある端末には歯車が出る（KJ-123）");
    assert.equal(await page.locator("#grpVib").isVisible(), false, "設定の欄は歯車を押すまで閉じている");
    await page.click("#bGear");
    assert.equal(await page.locator("#grpVib").isVisible(), true, "歯車を押すと「振動」の入り切りが出る");
    assert.equal(await page.locator('#vib input[value="1"]').isChecked(), true, "初期は入");
    await begin(page, "一上一下休人木日"); // 一上一下＝四字熟語（特別な語ではない）
    await page.evaluate(() => { window.__vib.length = 0; });
    // 取れる枚数が無いうちに場を押す → はじかれた
    await page.locator("#field .tile").first().click();
    assert.deepEqual(await vib(page), [[15, 60, 15]], "はじかれた");
    // 放つ：一上一下（四字熟語）
    for (const ch of "一上一下") await tap(page, ch);
    await page.click("#bRelease");
    assert.deepEqual((await vib(page)).slice(1), [[60, 40, 60, 40, 120]], "四字熟語");
    // 4枚取る
    for (let i = 0; i < 4; i++) await page.locator("#field .tile").first().click();
    assert.deepEqual((await vib(page)).slice(2), [10, 10, 10, 10], "取る");
    // 割る：休 → 人＋木
    await page.evaluate(() => { window.__vib.length = 0; });
    await tap(page, "休");
    await page.click("#bSplit");
    assert.deepEqual(await vib(page), [20], "割る");
    // くっつける：割ったあと選びが残る人＋木 → 休
    await page.evaluate(() => { window.__vib.length = 0; });
    await page.click("#bJoin");
    assert.deepEqual(await vib(page), [20], "くっつける");
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("2字・3字・特別な語・金玉", async () => {
    const { ctx, page, errors } = await open(browser, url);
    await begin(page);
    const pick = async (text) => {
      await page.evaluate((s) => {
        const G = __KJ.game; G.me.cards = [...s].map((c, i) => ({ id: 9100 + i, c, t: 0, fresh: false })); G.used.delete(s); __KJ.render();
      }, text);
      for (const ch of text) await tap(page, ch);
      await page.evaluate(() => { window.__vib.length = 0; });
      await page.click("#bRelease");
      await page.evaluate(() => { const G = __KJ.game; G.me.score = 0; G.me.takes = 0; });
      return vib(page);
    };
    assert.deepEqual(await pick("一人"), [30], "2字");
    assert.deepEqual(await pick("一年生"), [[40, 40, 40]], "3字");
    assert.deepEqual(await pick("天上天下"), [[80, 50, 80, 50, 200]], "特別な語（4字だが特別の形）");
    assert.deepEqual(await pick("金玉"), [[80, 50, 80, 50, 200]], "金玉（点は3のまま）");
    assert.equal(await page.evaluate(() => __KJ.game.log.filter((e) => e.op === "放つ").pop().pts), 3);
    await ctx.close();
    assert.deepEqual(errors, []);
  });

  await t.test("勝つと勝ちの形・負けると負けの形", async () => {
    for (const who of ["me", "cpu"]) {
      const { ctx, page, errors } = await open(browser, url);
      await begin(page);
      await page.evaluate((w) => {
        window.__vib.length = 0;
        const G = __KJ.game;
        if (w === "me") { G.me.score = 49; G.me.cards = [..."天上天下"].map((c, i) => ({ id: 9100 + i, c, t: 0, fresh: false })); __KJ.render(); }
        else { G.cpu.score = 49; G.cpu.cards = [..."天上天下"].map((c, i) => ({ id: 9200 + i, c, t: 0, fresh: false })); }
      }, who);
      if (who === "me") { for (const ch of "天上天下") await tap(page, ch); await page.click("#bRelease"); }
      else await page.evaluate(() => { const G = __KJ.game; G.release(G.cpu, G.cpu.cards.map((x) => x.id)); __KJ.drain(); });
      const v = await vib(page);
      if (who === "me") assert.deepEqual(v, [[80, 50, 80, 50, 200], [100, 60, 100, 60, 300]], "放つ（天上天下は特別な語）→勝ち");
      else assert.deepEqual(v, [150], "相手が放つ手では震えず、負けで1回");
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  });

  await t.test("相手（CPU）の手では震えない", async () => {
    const { ctx, page, errors } = await open(browser, url);
    await begin(page);
    await page.evaluate(() => {
      window.__vib.length = 0;
      const G = __KJ.game;
      G.cpu.cards = [..."一人"].map((c, i) => ({ id: 9300 + i, c, t: 0, fresh: false }));
      G.release(G.cpu, G.cpu.cards.map((x) => x.id));
      __KJ.drain();
    });
    assert.deepEqual(await vib(page), []);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("切にすると震えない（端末に覚える）。入に戻すと1回だけ試しに震える", async () => {
    const { ctx, page, errors } = await open(browser, url);
    await page.click("#bGear");
    await page.check('#vib input[value="0"]');
    assert.equal(await page.evaluate(() => localStorage.getItem("kj-vibe")), "0");
    await begin(page);
    await page.evaluate(() => { window.__vib.length = 0; });
    await page.locator("#field .tile").first().click(); // はじかれる手
    for (const ch of "天上天下") await tap(page, ch);
    await page.click("#bRelease");
    assert.deepEqual(await vib(page), [], "切のあいだは呼ばれない");
    await page.click("#bSetup"); // 設定の欄は開いたまま
    await page.check('#vib input[value="1"]');
    assert.deepEqual(await vib(page), [10], "入にしたとき、取ると同じ短い振動を1回");
    await ctx.close();
    const again = await open(browser, url, { pref: "0" });
    await again.page.click("#bGear");
    assert.equal(await again.page.locator('#vib input[value="0"]').isChecked(), true, "覚えた切が次に開いたときも効く");
    await again.ctx.close();
    assert.deepEqual(errors, []);
  });

  await t.test("navigator.vibrate が無い端末（iOS など）：入り切りは出ず、遊んでも落ちない", async () => {
    const { ctx, page, errors } = await open(browser, url, { vibrate: false });
    assert.equal(await page.locator("#grpVib").isVisible(), false);
    assert.equal(await page.locator("#bGear").isVisible(), true, "歯車は出る（曲の入／切があるため。KJ-133）");
    await begin(page);
    await page.locator("#field .tile").first().click();
    for (const ch of "天上天下") await tap(page, ch);
    await page.click("#bRelease");
    assert.equal(await page.evaluate(() => __KJ.game.me.score), 48, "放てた（振動が無くても遊べる）");
    assert.deepEqual(errors, []);
    await ctx.close();
  });
});
