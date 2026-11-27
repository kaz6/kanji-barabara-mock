// Play のボタンの印（KJ-120。作者の決め：案C 放物線）：字の上に点線の弧と矢（SVG 54×16・弧 M2 14 Q26 -4 50 10・矢 M45 6 L51 10 L45 13・太さ 1.6・端は丸・点線 3 3・色は字と同じ）。
// 字に重ならない・押せないとき字と同じ薄さ・375／320px でボタンからはみ出さない・高さは印を付ける前と同じ（51.19px）・読み上げは Play・押せば今まで通り放てる。
// Playwright の Chromium がないと skip になる。KJ_SHOT_PLAY=<フォルダ> を付けると 375×667 と 320×568 の卓の画像（Play が押せるとき・押せないとき）を書く
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
const BASE_H = 51.1875; // 印を付ける前の Play の高さ（origin/main で測った値）
const MEASURE = (page) => page.evaluate(() => {
  const b = document.getElementById("bRelease"), t = b.querySelector(".pl-t"), svg = b.querySelector(".pl-arc");
  const br = b.getBoundingClientRect(), sr = svg.getBoundingClientRect(), tr = t.getBoundingClientRect();
  const cs = getComputedStyle(t), ctx = document.createElement("canvas").getContext("2d");
  ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const asc = ctx.measureText("P").actualBoundingBoxAscent; // 字の上端（P の高さ）
  const probe = document.createElement("span"); probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline"; t.appendChild(probe);
  const baseline = probe.getBoundingClientRect().bottom; probe.remove();
  const g = svg.querySelector("g"), paths = [...svg.querySelectorAll("path")];
  return {
    off: b.getAttribute("aria-disabled") === "true" || b.disabled, h: br.height, aria: b.getAttribute("aria-label"), text: b.querySelector(".lb").textContent,
    vb: svg.getAttribute("viewBox"), w: sr.width, hh: sr.height, d: paths.map((p) => p.getAttribute("d")), dash: paths.map((p) => p.getAttribute("stroke-dasharray")),
    stroke: g.getAttribute("stroke"), sw: g.getAttribute("stroke-width"), cap: g.getAttribute("stroke-linecap"), color: getComputedStyle(b).color, strokeColor: getComputedStyle(g).stroke,
    glyphTop: baseline - asc, arcBottom: sr.bottom, arcLeft: sr.left, arcRight: sr.right, arcTop: sr.top, textCenter: (tr.left + tr.right) / 2,
    inBtn: sr.left >= br.left && sr.right <= br.right && sr.top >= br.top && sr.bottom <= br.bottom, overflow: b.scrollWidth > b.clientWidth, arcInView: sr.left >= 0 && sr.right <= innerWidth,
    ariaHidden: svg.getAttribute("aria-hidden"),
  };
});

for (const vp of [{ vw: 375, vh: 667 }, { vw: 320, vh: 568 }]) {
  test(`Play の印（KJ-120。${vp.vw}px）：字の上に点線の弧と矢・字に重ならない・押せないとき字と同じ薄さ・はみ出さない・高さは今まで通り`, { skip }, async () => {
    const srv = await serve(); const browser = await chromium.launch();
    try {
      const url = `http://127.0.0.1:${srv.address().port}/index.html`;
      const { ctx, page, errors } = await open(browser, url, vp);
      await setup(page);
      const off = await MEASURE(page);
      assert.equal(off.off, true, "台が空だと Play は押せない");
      assert.equal(off.text, "Play", "字は Play のまま"); assert.equal(off.aria, "Play", "読み上げは Play");
      assert.equal(off.vb, "0 0 54 16"); assert.deepEqual(off.d, ["M2 14Q26 -4 50 10", "M45 6L51 10L45 13"], "弧と矢の形");
      assert.deepEqual(off.dash, ["3 3", null], "弧だけ点線 3 3"); assert.equal(off.sw, "1.6"); assert.equal(off.cap, "round"); assert.equal(off.stroke, "currentColor", "色は字と同じ");
      assert.equal(off.ariaHidden, "true", "読み上げに出さない");
      assert.equal(off.strokeColor, off.color, "押せないときも、弧と矢の色は字と同じ（字と同じ薄さ）");
      assert.match(off.color, /rgba\(42, 38, 34, 0\.35\)/, "押せない字は墨 0.35（KJ-117）");
      assert.equal(off.w, 54); assert.equal(off.hh, 16);
      assert.ok(off.arcLeft > off.textCenter, `弧は字の真ん中より右から始まる（弧の左 ${off.arcLeft.toFixed(1)}・字の中心 ${off.textCenter.toFixed(1)}）`);
      assert.ok(off.arcLeft - off.textCenter <= 8, "真ん中より「少し」右");
      assert.ok(off.arcBottom <= off.glyphTop + 1.5, `弧は字に重ならない（弧の下 ${off.arcBottom.toFixed(2)}・字の上 ${off.glyphTop.toFixed(2)}）`);
      assert.equal(off.inBtn, true, "弧はボタンの中"); assert.equal(off.overflow, false, "ボタンからはみ出さない"); assert.equal(off.arcInView, true, "弧は画面の中");
      assert.ok(Math.abs(off.h - BASE_H) < 0.5, `ボタンの高さは印を付ける前と同じ（${off.h} ≒ ${BASE_H}）`);
      if (process.env.KJ_SHOT_PLAY) await page.screenshot({ path: path.join(process.env.KJ_SHOT_PLAY, `kj-120-off-${vp.vw}x${vp.vh}.png`) });
      // 休・日 を台に置く：休日 になり Play が押せる
      await page.locator("#meHand .tile", { hasText: "休" }).first().click();
      await page.locator("#meHand .tile", { hasText: "日" }).first().click();
      const on = await MEASURE(page);
      assert.equal(on.off, false, "休日 を台に置くと Play が押せる");
      assert.equal(on.strokeColor, on.color, "押せるときも色は字と同じ"); assert.equal(on.color, "rgb(232, 219, 180)", "押せるときは字と同じ紙色（弁柄の地）");
      assert.ok(on.arcBottom <= on.glyphTop + 1.5 && on.inBtn && !on.overflow && on.arcInView, "押せるときも同じ置き場");
      assert.ok(Math.abs(on.h - BASE_H) < 0.5, `押せるときも高さは同じ（${on.h}）`);
      if (process.env.KJ_SHOT_PLAY) await page.screenshot({ path: path.join(process.env.KJ_SHOT_PLAY, `kj-120-on-${vp.vw}x${vp.vh}.png`) });
      // 押せば今まで通り放てる
      await page.click("#bRelease");
      assert.equal(await page.evaluate(() => __KJ.game.me.score > 0 || document.getElementById("log").textContent.includes("休日")), true, "休日 を放てる");
      assert.deepEqual(errors, []);
      await ctx.close();
    } finally { await browser.close(); srv.close(); }
  });
}
