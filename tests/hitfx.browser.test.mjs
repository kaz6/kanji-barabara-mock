// KJ-081（D-099）：特別攻撃ワードを食らったときの演出。効かされた札に短い動き（0.4〜0.6秒）。人が食らったら手札のその札で、CPU が食らったら CPU の点の行のそばに小さく札
// 動きを減らす設定では動かさない・空振りでは出さない・震えるのは人が食らったときだけ（[30,40,30]）
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

const TYPES = { ".css": "text/css; charset=utf-8", ".otf": "font/otf", ".woff": "font/woff", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8" };
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

async function begin(browser, url, { reduce = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 }, reducedMotion: reduce ? "reduce" : "no-preference" });
  await ctx.addInitScript(() => {
    try { localStorage.setItem("kj-tutorial", "1"); } catch (e) { /* 読めない端末 */ }
    window.__buzz = []; // navigator.vibrate の差し替え：呼ばれた形を覚える
    navigator.vibrate = (p) => { window.__buzz.push(p); return true; };
  });
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
  await page.evaluate(() => {
    const G = __KJ.game; G.cpuTurn = () => null;
    G.me.cards = [..."年万魚肉一一一一"].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
    G.field = [..."山川玉"].map((c, i) => ({ id: 9500 + i, c, t: 0, fresh: false }));
    G.deck.splice(0, G.deck.length, ...Array(60).fill("一"));
    __KJ.render();
  });
  return { ctx, page, errors };
}
// 効いた事象を直接入れる：人の札（victim＝あなた）は手札を hit の結果の札に置き換えてから drain → render（ゲームの流れと同じ順）
async function hit(page, { op, victim, hits }) {
  await page.evaluate(([op, victim, hits]) => {
    const G = __KJ.game;
    let n = 9100; const ids = [];
    for (const h of hits) { ids.push(h.to.map(() => n++)); }
    if (victim === "あなた") {
      const keep = G.me.cards.filter((x) => x.id >= 9004);
      const add = hits.flatMap((h, i) => h.to.map((c, j) => ({ id: ids[i][j], c, t: 0, fresh: false })));
      G.me.cards = [...add, ...keep];
    }
    G.events.push({ type: "effect", who: victim === "あなた" ? "CPU" : "あなた", victim, text: "テスト", op, hit: hits.length > 0, hits, ids });
    __KJ.drain(); __KJ.render();
  }, [op, victim, hits]);
}
const fxCount = (page) => page.locator("#fxPts .hitfx").count();
const OPS = {
  split: { from: ["休"], to: ["人", "木"] },
  cycle: { from: ["六"], to: ["七"] },
  invert: { from: ["上"], to: ["下"] },
  join: { from: ["人", "木"], to: ["休"] },
  homophone: { from: ["一"], to: ["医"] },
};

test("食らいの演出（KJ-081）", { skip }, async (t) => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); srv.close(); });

  for (const [op, h] of Object.entries(OPS)) {
    await t.test(`人が食らう（${op}）：手札の札のところに演出の札が出て、時間がきたら消える。手札の字は変わっている`, async () => {
      const { ctx, page, errors } = await begin(browser, url);
      await hit(page, { op, victim: "あなた", hits: [h] });
      assert.ok((await fxCount(page)) >= 1, "演出の札が出る");
      assert.equal(await page.locator("#fxPts .hitfx").first().getAttribute("data-op"), op);
      assert.ok((await page.locator("#fxPts .hitfx").first().innerText()).length >= 1);
      const now = await page.evaluate(() => __KJ.game.me.cards.map((x) => x.c).join(""));
      assert.ok(now.startsWith(h.to.join("")), "字はもう変わっている");
      if (process.env.KJ_SHOT) { // 途中の1枚：動きを半分のところで止めて撮る（画像は KJ_SHOT=1 のときだけ撮り直す）
        await page.evaluate(() => document.getAnimations().forEach((a) => { const tm = a.effect.getComputedTiming(); a.pause(); a.currentTime = tm.delay + tm.activeDuration * 0.5; }));
        await page.screenshot({ path: path.join(ROOT, `docs/img/kj-081-${op}-375.png`), clip: { x: 0, y: 0, width: 375, height: 640 } });
      }
      await page.waitForFunction(() => document.querySelectorAll("#fxPts .hitfx").length === 0, null, { timeout: 3000 });
      assert.deepEqual(errors, []);
      await ctx.close();
    });
  }

  await t.test("CPU が食らう：CPU の点の行のそばに小さく札が出て、消える。震えない", async () => {
    const { ctx, page, errors } = await begin(browser, url);
    await hit(page, { op: "split", victim: "CPU", hits: [OPS.split] });
    assert.ok((await fxCount(page)) >= 2, "食らう前の札（一閃）と食らったあとの札");
    const box = await page.locator("#cpuScore").boundingBox();
    const r = await page.locator("#fxPts .hitfx").first().boundingBox();
    assert.ok(Math.abs((r.y + r.height / 2) - (box.y + box.height / 2)) < 30, "点の行のそば");
    const cnt = await page.locator("#cpuCount").boundingBox();
    assert.ok(r.x >= box.x + box.width && r.x >= cnt.x + cnt.width - 1, "点と「手札 n / 8」の右（重ならない）");
    assert.deepEqual(await page.evaluate(() => window.__buzz), [], "CPU が食らっても人は震えない");
    await page.waitForFunction(() => document.querySelectorAll("#fxPts .hitfx").length === 0, null, { timeout: 3000 });
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("2組に効いたら（大集合など）、札が2つぶん出る", async () => {
    const { ctx, page } = await begin(browser, url);
    await hit(page, { op: "join", victim: "あなた", hits: [OPS.join, { from: ["日", "月"], to: ["明"] }] });
    assert.equal(await fxCount(page), 4, "寄る札が1組に2枚ずつ、2組で4枚");
    await ctx.close();
  });

  await t.test("動きを減らす設定：演出の札は出ない（字は変わる）。ただし震えは今までどおり", async () => {
    const { ctx, page } = await begin(browser, url, { reduce: true });
    await hit(page, { op: "cycle", victim: "あなた", hits: [OPS.cycle] });
    assert.equal(await fxCount(page), 0);
    assert.equal(await page.evaluate(() => __KJ.game.me.cards[0].c), "七");
    await hit(page, { op: "cycle", victim: "CPU", hits: [OPS.cycle] });
    assert.equal(await fxCount(page), 0);
    assert.deepEqual(await page.evaluate(() => window.__buzz), [[30, 40, 30]], "震えは動きを減らす設定と別（人が食らった1回だけ）");
    await ctx.close();
  });

  await t.test("空振り（hits が空）：演出も震えも出ない", async () => {
    const { ctx, page } = await begin(browser, url);
    await hit(page, { op: "split", victim: "あなた", hits: [] });
    assert.equal(await fxCount(page), 0);
    assert.deepEqual(await page.evaluate(() => window.__buzz), []);
    await ctx.close();
  });

  await t.test("振動：人が食らったときだけ短く2回［30,40,30］。切にしていたら震えない", async () => {
    const { ctx, page } = await begin(browser, url);
    await hit(page, { op: "split", victim: "あなた", hits: [OPS.split] });
    assert.deepEqual(await page.evaluate(() => window.__buzz), [[30, 40, 30]]);
    await page.evaluate(() => { vibeOn = false; window.__buzz.length = 0; }); // 振動「切」
    await hit(page, { op: "cycle", victim: "あなた", hits: [OPS.cycle] });
    assert.deepEqual(await page.evaluate(() => window.__buzz), []);
    await ctx.close();
  });

  await t.test("ゲームの流れで：CPU が 回転 を放つと人の札が回って、人が震える", async () => {
    const { ctx, page, errors } = await begin(browser, url);
    await page.evaluate(() => {
      const G = __KJ.game;
      G.me.cards = [..."六年万魚肉年万魚"].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
      G.cpu.cards = [..."回転年万魚肉年万"].map((c, i) => ({ id: 9800 + i, c, t: 0, fresh: false }));
      G.cpuHint = null;
      const ids = G.cpu.cards.slice(0, 2).map((x) => x.id);
      G.release(G.cpu, ids);
      __KJ.drain(); __KJ.render();
    });
    assert.equal(await page.evaluate(() => __KJ.game.me.cards.map((x) => x.c).includes("七")), true, "六 が 七 に ");
    assert.ok((await fxCount(page)) >= 1);
    assert.deepEqual(await page.evaluate(() => window.__buzz), [[30, 40, 30]]);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("ゲームの流れで：人が 切る を放つと CPU の 休 が割れて、CPU の点のそばに演出が出る（人は震えない）", async () => {
    const { ctx, page, errors } = await begin(browser, url);
    await page.evaluate(() => {
      const G = __KJ.game;
      G.me.cards = [..."切儿年万魚肉一一"].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
      G.cpu.cards = [..."休年年年年年年年"].map((c, i) => ({ id: 9800 + i, c, t: 0, fresh: false }));
      __KJ.render();
    });
    await page.locator("#meHand .tile:not(.sel)", { hasText: "切" }).first().click();
    await page.locator("#meHand .tile:not(.sel)", { hasText: "儿" }).first().click();
    await page.click("#bRelease");
    assert.equal(await page.evaluate(() => __KJ.game.cpu.cards.map((x) => x.c).join("").startsWith("休")), false, "休 が割れた");
    assert.ok((await fxCount(page)) >= 1, "演出が出る");
    assert.deepEqual(await page.evaluate(() => window.__buzz.filter((p) => Array.isArray(p) && p.join() === "30,40,30")), [], "食らわせたときは今の放つの振動のまま");
    assert.deepEqual(errors, []);
    await ctx.close();
  });
});
