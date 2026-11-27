// KJ-108：戦果の共有（決め手は同点なら先に放った言葉＝十円。終わりの画面の「共有」。navigator.share に文と URL〔?room= なし〕・share が無いとクリップボード・チュートリアルでは出ない）。Playwright の Chromium がないと skip（skip は「通った」ではない）
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

// 終わりの画面を出す：「休日」を放って時間切れ手前で終わらせ、「山川」を見逃した言葉にする。放った言葉に en の無い語（十円）も1つ
async function openEnd(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
  await page.check('#opp input[value="cpu"]'); // ?room= で開くと「友達と対戦」＋［部屋に入る］が選ばれ、レベルは出ない（KJ-123）
  await page.check('#lvl input[value="N5"]');
  await page.check('#pow input[value="weak"]');
  await page.click("#start");
  await page.evaluate(() => {
    const G = __KJ.game; G.cpuTurn = () => null;
    G.me.cards = [..."休日山川"].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
    G.hinted.push("山川");
    G.log.push({ t: 1, who: G.me.name, op: "放つ", from: [..."十円"], to: [], pts: 3, note: "" });
    G.me.score = 48;
    __KJ.render();
  });
  await page.locator("#meHand .tile", { hasText: "休" }).click();
  await page.locator("#meHand .tile", { hasText: "日" }).click();
  await page.click("#bRelease");
  await page.waitForSelector("#endShow.on");
}


async function ctxFor(browser, share) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.addInitScript((s) => {
    try { localStorage.setItem("kj-tutorial", "1"); } catch (e) { /* */ }
    window.__shared = [];
    if (s === "none") Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    else Object.defineProperty(navigator, "share", { configurable: true, value: (d) => { window.__shared.push(d); return Promise.resolve(); } });
  }, share);
  return ctx;
}

test("KJ-108 画面：終わりに「共有」が出る・share に 文と URL（?room= なし）が渡る", { skip }, async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    const page = await (await ctxFor(browser, "ok")).newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await openEnd(page, base + "?room=1234&x=1#h");
    assert.equal(await page.locator("#bShareEnd").isVisible(), true, "終わりの画面のあいだも出ている");
    assert.equal((await page.locator("#bShareEnd").textContent()).trim(), "共有");
    if (process.env.KJ_SHOT_SHAREEND) await page.screenshot({ path: path.join(process.env.KJ_SHOT_SHAREEND, "end-share-375x667.png") });
    await page.click("#bShareEnd");
    await page.waitForFunction(() => window.__shared.length === 1);
    const s = await page.evaluate(() => window.__shared[0]);
    // KJ-126：リンクとタグは文の中（タグが URL の行の次）。share には url を別に渡さない（端末で二重に出ない）
    assert.equal(s.url, undefined);
    const site = base.replace(/index\.html.*$/, "index.html");
    assert.ok(!s.text.includes("room"), "?room= は付かない");
    assert.match(s.text, /^漢対普請瓦版 第.+號／.+／CPU（トテモヨワイ）ニ(勝ツ|敗ル|ト引キ分ケ)/);
    assert.match(s.text, /決メ手ハ『十円』.点／（N5）\n[^\n]+\n#漢対普請瓦版$/, s.text);
    assert.ok(s.text.endsWith("（N5）\n" + site + "\n#漢対普請瓦版"), s.text);
    assert.equal(s.title, "漢対普請瓦版");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); srv.close(); }
});

test("KJ-108 画面：share が無い端末はクリップボードに写して「コピーした」", { skip }, async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    const page = await (await ctxFor(browser, "none")).newPage();
    await openEnd(page, base);
    await page.click("#bShareEnd");
    await page.waitForFunction(() => document.getElementById("bShareEnd").textContent === "コピーした");
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(clip, /決メ手ハ『十円』.点／（N5）\n.*index\.html\n#漢対普請瓦版$/);
    assert.equal(clip.split("index.html").length, 2, "リンクは1回だけ");
    await page.waitForFunction(() => document.getElementById("bShareEnd").textContent === "共有");
  } finally { await browser.close(); srv.close(); }
});

test("KJ-108 画面：チュートリアルでは「共有」が出ない・はじめる前にも出ない", { skip }, async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
    await ctx.addInitScript(() => { try { localStorage.removeItem("kj-tutorial"); } catch (e) { /* */ } });
    const page = await ctx.newPage();
    await page.goto(base);
    await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
    assert.equal(await page.locator("#bShareEnd").isVisible(), false, "はじめる前");
    await page.click("#bTutorial");
    await page.waitForFunction(() => document.body.classList.contains("tutorial"));
    assert.equal(await page.locator("#bShareEnd").isVisible(), false, "チュートリアル中");
  } finally { await browser.close(); srv.close(); }
});
