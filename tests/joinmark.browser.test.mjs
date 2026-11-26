// Join のボタンの印（KJ-103）：Jo｜in を上がくっつくハの字（Jo は +5 度・in は −5 度）に寄りかからせ（線は入れない）、継ぎ目の真上に墨の放射3本（SVG）。
// 放射の根元と字の上端の間は 0〜3px・字に重ならない・押せないとき薄い（0.35）・375／320px でボタンからはみ出さない・名前は Join のまま・押せば今まで通りくっつく。
// Playwright の Chromium がないと skip になる。KJ_SHOT_JOIN=<フォルダ> を付けると 375×667 と 320×568 の卓の画像（Join が押せるとき・押せないとき）を書く
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
async function open(browser, url, { init = {}, blockStorage = false, vw = 375, vh = 667 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, reducedMotion: "reduce" });
  await ctx.addInitScript(([st, block]) => {
    try {
      if (!sessionStorage.getItem("kjInit")) { sessionStorage.setItem("kjInit", "1"); localStorage.setItem("kj-tutorial", "1"); for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); }
    } catch (e) { /* 読めない端末 */ }
    if (block) { try { Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } }); } catch (e) { /* */ } }
  }, [init, blockStorage]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
  return { ctx, page, errors };
}

async function setup(page) {
  await page.check('#opp input[value="cpu"]');
  await page.check('#pow input[value="weak"]');
  await page.click("#start");
  await page.evaluate(() => {
    const G = __KJ.game; G.cpuTurn = () => null;
    G.me.cards = [..."人木休口辶十日下"].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
    G.field = [..."山川玉"].map((c, i) => ({ id: 9500 + i, c, t: 0, fresh: false }));
    __KJ.render();
  });
}
// 見た目の測り：放射の根元（線の下端）と、継ぎ目に隣り合う字（i）の上端の間・放射の横の中心と継ぎ目・ボタンからのはみ出し
const MEASURE = (page) => page.evaluate(() => {
  const b = document.getElementById("bJoin"), fx = b.querySelector(".jn-fx"), seam = b.querySelector(".jn-seam"), ja = b.querySelector(".jn-a"), jb = b.querySelector(".jn-b");
  const fr = fx.getBoundingClientRect(), sr = seam.getBoundingClientRect(), br = b.getBoundingClientRect();
  const cs = getComputedStyle(jb), ctx = document.createElement("canvas").getContext("2d");
  ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const asc = ctx.measureText("i").actualBoundingBoxAscent;
  const rootY = fr.top + (7.5 / 8) * fr.height; // 線の根元（SVG の y=7.5）
  const glyphTop = sr.bottom - asc; // 継ぎ目の字の上端（継ぎ目は幅も高さもゼロで、下端が字の基線）
  const ang = (m) => { const v = m.match(/matrix\(([^)]+)\)/)[1].split(",").map(Number); return Math.round(Math.atan2(v[1], v[0]) * 180 / Math.PI); };
  return {
    gapJoIn: jb.offsetLeft - (ja.offsetLeft + ja.offsetWidth), gap: glyphTop - rootY, fxBottom: fr.bottom, glyphTop, centerOff: (fr.left + fr.right) / 2 - sr.left,
    inBtn: fr.left >= br.left && fr.right <= br.right && fr.top >= br.top && fr.bottom <= br.bottom, overflow: b.scrollWidth > b.clientWidth,
    off: b.getAttribute("aria-disabled") === "true" || b.disabled, opacity: parseFloat(getComputedStyle(fx).opacity),
    a: ang(getComputedStyle(ja).transform), b: ang(cs.transform), aOrigin: getComputedStyle(ja).transformOrigin, bOrigin: cs.transformOrigin,
    text: b.textContent, aria: b.getAttribute("aria-label"), parts: [ja.textContent, jb.textContent], paths: fx.querySelectorAll("path").length,
    stroke: fx.querySelector("g").getAttribute("stroke"), sw: fx.querySelector("g").getAttribute("stroke-width"), cap: fx.querySelector("g").getAttribute("stroke-linecap"), vb: fx.getAttribute("viewBox"),
    hasCut: !!b.querySelector(".sp-cut"), borderL: getComputedStyle(ja).borderLeftWidth, borderR: getComputedStyle(jb).borderLeftWidth, btnH: br.height,
  };
});

for (const vp of [{ vw: 375, vh: 667 }, { vw: 320, vh: 568 }]) {
  test(`Join の印（KJ-103。${vp.vw}px）：Jo｜in が Split の逆に寄りかかる・放射3本が継ぎ目の真上・根元と字の上端の間 0〜3px・押せないとき薄い・はみ出さない`, { skip }, async () => {
    const srv = await serve(); const browser = await chromium.launch();
    try {
      const url = `http://127.0.0.1:${srv.address().port}/index.html`;
      const { ctx, page, errors } = await open(browser, url, vp);
      await setup(page);
      // 何も選ばない：Join は押せない
      const off = await MEASURE(page);
      assert.equal(off.off, true, "選ばないと Join は押せない");
      assert.equal(off.text, "Join"); assert.deepEqual(off.parts, ["Jo", "in"]); assert.equal(off.aria, "Join", "読み上げは Join のまま");
      assert.equal(off.a, 5, "Jo は右へ約5度（上が継ぎ目へ寄る）"); assert.equal(off.b, -5, "in は左へ約5度");
      assert.notEqual(off.aOrigin.split(" ")[0], "0px", "Jo は右下の角が軸"); assert.equal(off.bOrigin.split(" ")[0], "0px", "in は左下の角が軸");
      assert.equal(off.hasCut, false, "線（Split の割れ目）は入れない"); assert.equal(off.borderL, "0px"); assert.equal(off.borderR, "0px");
      assert.equal(off.paths, 3, "放射は線3本"); assert.equal(off.vb, "0 0 16 8"); assert.equal(off.stroke, "var(--ink)", "墨"); assert.equal(off.sw, "1.6"); assert.equal(off.cap, "round");
      assert.equal(off.opacity, 0.35, "押せないとき字と同じく薄い（不透明度 0.35）");
      assert.ok(off.gap >= 0 && off.gap <= 3, `根元と字の上端の間 0〜3px（${off.gap.toFixed(2)}）`);
      assert.ok(off.fxBottom <= off.glyphTop + 0.5, `放射は字に重ならない（放射の下 ${off.fxBottom.toFixed(2)}・字の上 ${off.glyphTop.toFixed(2)}）`);
      assert.ok(off.gapJoIn >= 1 && off.gapJoIn <= 4, `Jo と in の間のすき間は約 .12em（見本の 2px）。いま ${off.gapJoIn.toFixed(2)}px`);
      assert.ok(Math.abs(off.centerOff) <= 1, `放射の横の中心は継ぎ目（ずれ ${off.centerOff.toFixed(2)}px）`);
      assert.equal(off.inBtn, true, "放射はボタンの中"); assert.equal(off.overflow, false, "ボタンからはみ出さない");
      assert.ok(off.btnH >= 44, `ボタンの高さは今まで通り 44px 以上（${off.btnH}）`);
      if (process.env.KJ_SHOT_JOIN) await page.screenshot({ path: path.join(process.env.KJ_SHOT_JOIN, `kj-103-off-${vp.vw}x${vp.vh}.png`) });
      // 人・木 を選ぶ：Join が押せる。放射は濃い墨
      await page.locator("#meHand .tile", { hasText: "人" }).first().click();
      await page.locator("#meHand .tile", { hasText: "木" }).first().click();
      const on = await MEASURE(page);
      assert.equal(on.off, false, "人・木 で Join が押せる");
      assert.equal(on.opacity, 1, "押せるときは濃い墨");
      assert.ok(on.gap >= 0 && on.gap <= 3 && on.overflow === false && on.inBtn, `押せるときも同じ置き場（${on.gap.toFixed(2)}）`);
      if (process.env.KJ_SHOT_JOIN) await page.screenshot({ path: path.join(process.env.KJ_SHOT_JOIN, `kj-103-on-${vp.vw}x${vp.vh}.png`) });
      // 押せば今まで通りくっつく（休）
      await page.click("#bJoin");
      assert.equal(await page.locator("#row .tile", { hasText: "休" }).count(), 1, "人＋木 は 休 にくっつく");
      assert.deepEqual(errors, []);
      await ctx.close();
    } finally { await browser.close(); srv.close(); }
  });
}
