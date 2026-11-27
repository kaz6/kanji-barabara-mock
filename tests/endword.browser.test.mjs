// KJ-087：終わりの画面の言葉をタップすると、すぐ下に欄が開く（読み・意味・コトバンクで引く）。Playwright の Chromium がないと skip（skip は「通った」ではない）
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
  await page.check('#lvl input[value="N5"]');
  await page.check('#opp input[value="cpu"]');
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

test("KJ-087 画面：語をタップすると下に欄（読み・意味・リンク）。もう一度で閉じる・開けるのは1つ・画面は閉じない", { skip }, async () => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 700 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => { try { localStorage.setItem("kj-tutorial", "1"); } catch (e) { /* */ } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await openEnd(page, url);
    const on = () => page.evaluate(() => document.getElementById("endShow").classList.contains("on"));
    await page.waitForSelector("#endShow[data-done='1']", { timeout: 5000 });
    // 休日
    await page.locator("#esWords .esw", { hasText: "休日" }).click();
    assert.equal(await on(), true, "語を押しても閉じない");
    const box = page.locator("#esWords .esd");
    assert.equal(await box.count(), 1);
    const txt = await box.textContent();
    const info = await page.evaluate(() => __KJ.tables.WORDS.get("休日"));
    assert.ok(txt.includes("読み：" + info.kana), txt);
    assert.ok(txt.includes("意味：" + info.en.slice(0, 2).join(" / ")), txt);
    const a = box.locator("a");
    assert.equal(await a.getAttribute("href"), "https://kotobank.jp/search?q=" + encodeURIComponent("休日"));
    assert.equal(await a.getAttribute("target"), "_blank");
    assert.match(await a.getAttribute("rel"), /noopener/);
    if (process.env.KJ087_SHOT) await page.screenshot({ path: process.env.KJ087_SHOT });
    // 語のすぐ下（語の下端より下、同じ語の次の要素）
    assert.equal(await page.evaluate(() => [...document.querySelectorAll("#esWords .esw")].find((x) => x.textContent.includes("休日")).nextElementSibling.classList.contains("esd")), true);
    // 閉じる時計が止まる（hold 4秒より長く待っても出たまま）
    await page.waitForTimeout(4600);
    assert.equal(await on(), true, "自動で閉じない");
    // 欄の中（文字）を押しても閉じない・開いたまま
    await box.locator("div").click();
    assert.equal(await box.count(), 1);
    assert.equal(await on(), true);
    // 別の語（十円。en が無い）：前の欄は閉じ、開けるのは1つ。読みとリンクだけ
    await page.locator("#esWords .esw", { hasText: "十円" }).click();
    assert.equal(await page.locator("#esWords .esd").count(), 1);
    const t2 = await page.locator("#esWords .esd").textContent();
    assert.ok(!t2.includes("意味："), t2);
    assert.ok(t2.includes("コトバンクで引く"));
    assert.equal(await page.locator("#esWords .esd a").getAttribute("href"), "https://kotobank.jp/search?q=" + encodeURIComponent("十円"));
    // もう一度同じ語で閉じる
    await page.locator("#esWords .esw", { hasText: "十円" }).click();
    assert.equal(await page.locator("#esWords .esd").count(), 0);
    assert.equal(await on(), true);
    // 外を押す：出ききっているので、今まで通り閉じる
    await page.click("#endShow", { position: { x: 20, y: 600 } });
    assert.equal(await on(), false);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});

test("KJ-087 画面：見逃した言葉をタップすると欄が開く。語を押したとき出ている途中の言葉は出しきる", { skip }, async () => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 700 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => { try { localStorage.setItem("kj-tutorial", "1"); } catch (e) { /* */ } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await openEnd(page, url);
    // 出ている途中に、最初の語を押す → 全部出る・閉じない・時計は止まる
    await page.waitForFunction(() => document.querySelectorAll("#esWords .esw.in").length >= 1);
    await page.locator("#esWords .esw.in").first().click();
    assert.equal(await page.locator("#esWords .esw.in").count(), await page.locator("#esWords .esw").count());
    await page.locator("#esWords .esd a").waitFor();
    await page.locator("#esWords .esw.in").first().click(); // 閉じる
    // 見逃した言葉
    await page.locator("#esMissed .w").click();
    const box = page.locator("#esMissed .esd");
    assert.equal(await box.count(), 1);
    const info = await page.evaluate(() => __KJ.tables.WORDS.get("山川"));
    assert.ok((await box.textContent()).includes("読み：" + info.kana));
    assert.equal(await box.locator("a").getAttribute("href"), "https://kotobank.jp/search?q=" + encodeURIComponent("山川"));
    assert.equal(await page.evaluate(() => document.getElementById("endShow").classList.contains("on")), true);
    await page.locator("#esMissed .w").click();
    assert.equal(await box.count(), 0);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});
