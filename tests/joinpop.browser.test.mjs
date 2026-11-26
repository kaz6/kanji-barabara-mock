// くっつけた瞬間の Join の放射の弾み（KJ-105）：自分がくっつけに成功したとき（ボタン・面で・選びの一覧）、放射3本だけが一度弾む（根元を軸に 1→約1.6倍→1）。
// 失敗・相手（CPU）のくっつけでは弾まない・動きを減らす設定では弾まない・押せない見え方になっても弾みは見える・字とほかのボタンは動かさない。
// Playwright の Chromium がないと skip になる。KJ_SHOT_JOINPOP=<フォルダ> を付けると 弾みの途中（0.15秒）と終わりの画像を書く
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
    G.me.cards = [..."人木休口辶十日下"].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
    G.cpu.cards = [..."人木山川"].map((c, i) => ({ id: 9700 + i, c, t: 0, fresh: false }));
    G.field = [..."山川玉"].map((c, i) => ({ id: 9500 + i, c, t: 0, fresh: false }));
    __KJ.render();
  });
  return { ctx, page, errors };
}
const popped = (page) => page.evaluate(() => document.getElementById("bJoin").classList.contains("joinpop"));
const animName = (page) => page.evaluate(() => getComputedStyle(document.querySelector("#bJoin .jn-fx")).animationName);
const pick = async (page, ...cs) => { for (const c of cs) await page.locator("#meHand .tile", { hasText: c }).first().click(); };
// 弾みを止めて、指定の時間（ms）に合わせた放射の拡大率と、字・ほかのボタンの動き
const seek = (page, ms) => page.evaluate((t) => {
  const fx = document.querySelector("#bJoin .jn-fx");
  const an = document.getAnimations().filter((a) => a.animationName === "kjJnPop");
  an.forEach((a) => { a.pause(); a.currentTime = t; });
  const m = getComputedStyle(fx).transform; const v = m === "none" ? [1, 0] : m.match(/matrix\(([^)]+)\)/)[1].split(",").map(Number);
  const names = [...document.querySelectorAll("#bJoin .jn-a, #bJoin .jn-b, #bSplit, #bInvert, #bCycle, #bHomo, #meHand .tile")].map((e) => getComputedStyle(e).animationName);
  return { n: an.length, scale: Math.hypot(v[0], v[1]), origin: getComputedStyle(fx).transformOrigin, box: fx.getBoundingClientRect().toJSON(), others: names.filter((x) => x !== "none") };
}, ms);

test("Join の放射の弾み（KJ-105）：成功で一度だけ弾む（1→1.6→1・根元が軸）・字とほかは動かない・押せない見え方でも見える・失敗と CPU では弾まない", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const url = `http://127.0.0.1:${srv.address().port}/index.html`;
    const { ctx, page, errors } = await open(browser, url);
    const vars = await page.evaluate(() => ({ t: getComputedStyle(document.documentElement).getPropertyValue("--jn-pop-time").trim(), s: getComputedStyle(document.documentElement).getPropertyValue("--jn-pop-scale").trim() }));
    assert.deepEqual(vars, { t: ".3s", s: "1.6" }, "時間と倍率は CSS の変数1か所");
    assert.equal(await popped(page), false); assert.equal(await animName(page), "none", "ふだんは動かない");
    // 失敗：くっつかない組（日・下）を選び、無理に押してもはじかれて弾まない
    await pick(page, "日", "下");
    await page.evaluate(() => document.getElementById("bJoin").click());
    await page.waitForTimeout(80);
    assert.ok((await page.textContent("#nopeWhy")).length > 0, "はじかれた理由が出ている（＝くっつけは試された）");
    assert.equal(await popped(page), false, "くっつけに失敗したら弾まない");
    await page.evaluate(() => { __KJ.render(); });
    // CPU（相手）がくっつけても弾まない
    const cpuRes = await page.evaluate(() => { const G = __KJ.game; const r = G.join(G.cpu, [9700, 9701]); __KJ.render(); return r && r.ok; });
    assert.equal(cpuRes, true, "CPU 側で 人＋木 がくっつく");
    await page.waitForTimeout(80);
    assert.equal(await popped(page), false, "CPU や相手がくっつけても弾まない");
    // 成功：人・木 → 休（失敗で選んだ札を外してから選び直す）
    await page.evaluate(() => { __KJ.render(); });
    for (let i = await page.locator("#row .tile").count(); i > 0; i--) await page.locator("#row .tile").first().click();
    await pick(page, "人", "木");
    assert.equal(await page.evaluate(() => document.getElementById("bJoin").disabled || document.getElementById("bJoin").getAttribute("aria-disabled") === "true"), false, "人・木 で Join が押せる");
    await page.click("#bJoin");
    assert.equal(await page.locator("#row .tile", { hasText: "休" }).count(), 1, "人＋木 は 休 にくっつく");
    assert.equal(await popped(page), true, "くっつけたら弾みの印（joinpop）が付く");
    assert.equal(await animName(page), "kjJnPop");
    const off = await page.evaluate(() => { const b = document.getElementById("bJoin"); return { off: b.disabled || b.getAttribute("aria-disabled") === "true", op: getComputedStyle(b.querySelector(".jn-fx")).opacity }; });
    assert.equal(off.off, true, "くっつけたあと Join は押せない見え方"); assert.equal(off.op, "0.35", "押せない見え方でも放射は薄いだけで見える");
    const s0 = await seek(page, 0), sMid = await seek(page, 150), sEnd = await seek(page, 299);
    assert.equal(s0.n, 1, "弾みは1つだけ");
    assert.ok(Math.abs(s0.scale - 1) < 0.01, `はじめは等倍（${s0.scale}）`);
    assert.ok(Math.abs(sMid.scale - 1.6) < 0.05, `0.15秒で約1.6倍（${sMid.scale}）`);
    assert.ok(sEnd.scale < 1.05, `終わりは等倍へ戻る（${sEnd.scale}）`);
    assert.equal(sMid.origin.split(" ")[0] !== "0px", true); const o = sMid.origin.split(" ").map(parseFloat); assert.ok(Math.abs(o[1] - sMid.box.height / sMid.scale) < 1, `軸は下の端（根元）。${sMid.origin}`);
    assert.deepEqual(sMid.others, [], "弾むのは放射だけ。字・ほかのボタン・札は動かさない");
    if (process.env.KJ_SHOT_JOINPOP) { await seek(page, 150); await page.screenshot({ path: path.join(process.env.KJ_SHOT_JOINPOP, "kj-105-mid.png") }); }
    await page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
    await page.waitForTimeout(600);
    assert.equal(await popped(page), false, "一度で外れる"); assert.equal(await animName(page), "none");
    if (process.env.KJ_SHOT_JOINPOP) await page.screenshot({ path: path.join(process.env.KJ_SHOT_JOINPOP, "kj-105-end.png") });
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});

test("Join の放射の弾み（KJ-105）：面でくっつけても弾む／動きを減らす設定では弾まない", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const url = `http://127.0.0.1:${srv.address().port}/index.html`;
    // 動きを減らす設定：くっつくが弾まない
    const r = await open(browser, url, { reduce: true });
    await pick(r.page, "人", "木");
    await r.page.click("#bJoin");
    assert.equal(await r.page.locator("#row .tile", { hasText: "休" }).count(), 1, "reduce でもくっつく");
    assert.equal(await popped(r.page), false, "reduce では弾まない");
    assert.equal(await animName(r.page), "none");
    assert.deepEqual(r.errors, []); await r.ctx.close();
    // 面でくっつける：十 を 口 の上の面に落とすと 古。成功なので弾む
    const { ctx, page, errors } = await open(browser, url);
    await page.locator("#meHand").scrollIntoViewIfNeeded();
    const box = async (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    const f = await box(page.locator("#meHand .tile", { hasText: "十" }).first()), tb = await box(page.locator("#meHand .tile", { hasText: "口" }).first());
    const x1 = f.x + f.width / 2, y1 = f.y + f.height / 2, x2 = tb.x + tb.width * 0.5, y2 = tb.y + tb.height * 0.12;
    await page.mouse.move(x1, y1); await page.mouse.down();
    await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 }); await page.mouse.move(x2, y2, { steps: 4 });
    assert.equal(await popped(page), false, "引きずっている間は弾まない");
    await page.mouse.up();
    assert.equal(await page.locator("#meHand .tile", { hasText: "古" }).count(), 1, "十＋口 が 古 にくっつく");
    assert.equal(await popped(page), true, "面でくっつけても弾む");
    assert.deepEqual(errors, []); await ctx.close();
  } finally { await browser.close(); srv.close(); }
});
