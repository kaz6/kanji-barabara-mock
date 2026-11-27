// 題字の裏の筋を時計回りに回す（KJ-125）：筋（.mast-rays）だけに回る animation が付く。半円・題字の箱・枠・SVG には付かない。動きを減らす設定では回さない。
// 回しても枠の中に筋の無い所が出ない（筋は反対側にも足してある）。Playwright の Chromium がないと skip になる。KJ_SHOT_MAST=<フォルダ> で 0 秒と 30 秒後の画像を書く
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
  const ctx = await browser.newContext({ viewport: { width: 375, height: 700 }, reducedMotion: reduce ? "reduce" : "no-preference" });
  await ctx.addInitScript(() => { try { localStorage.setItem("kj-tutorial", "1"); } catch (e) { /* 読めない端末 */ } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
  return { ctx, page, errors };
}
const info = (page) => page.evaluate(() => {
  const css = (e) => getComputedStyle(e);
  const sun = document.querySelector("svg.mast-sun"), rays = sun.querySelector(".mast-rays");
  const an = (e) => css(e).animationName;
  return {
    rays: an(rays), dur: css(rays).animationDuration, iter: css(rays).animationIterationCount, timing: css(rays).animationTimingFunction,
    circle: an(sun.querySelector("circle")), svg: an(sun), box: an(document.getElementById("mastTitle")), name: an(document.querySelector(".mast-name")),
    anims: document.getAnimations().map((a) => a.effect.target.getAttribute("class") || a.effect.target.id || a.effect.target.tagName).filter((x) => /mast/.test(x)),
  };
});
// 枠の四隅と上の真ん中の近くの小さな窓に、筋が少しでも写っていること（隅に筋が無い所があると窓に筋が無い）
const WINDOWS = (page) => page.evaluate(() => {
  const sun = document.querySelector("svg.mast-sun"), b = document.getElementById("mastTitle").getBoundingClientRect();
  sun.style.pointerEvents = "auto"; // 当たり判定で筋のある所を見る（見た目は変わらない）
  const pts = [[8, 8], [b.width - 8, 8], [8, b.height - 20], [b.width - 8, b.height - 20], [b.width / 2, 8]];
  const r = pts.map(([x, y]) => {
    let hit = 0, miss = 0;
    for (let dy = -24; dy <= 24; dy += 4) for (let dx = -24; dx <= 24; dx += 4) {
      const e = document.elementsFromPoint(b.left + x + dx, b.top + y + dy);
      if (e.some((n) => n.closest && n.closest(".mast-rays"))) hit++; else miss++;
    }
    return { hit, miss };
  });
  sun.style.pointerEvents = "";
  return r;
});

test("題字の裏の筋（KJ-125）：筋だけに時計回り・120秒で1周・等速・ずっと の animation が付く。半円・SVG・題字の箱・題字には付かない。1か所の数値で変えられる", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const { ctx, page, errors } = await open(browser, `http://127.0.0.1:${srv.address().port}/index.html`);
    assert.deepEqual(await info(page), { rays: "mastspin", dur: "120s", iter: "infinite", timing: "linear", circle: "none", svg: "none", box: "none", name: "none", anims: ["mast-rays"] });
    const keyEnd = await page.evaluate(() => { for (const s of document.styleSheets) for (const r of s.cssRules) if (r.name === "mastspin") return r.cssRules[0].style.transform; });
    assert.equal(keyEnd, "rotate(360deg)", "正の角度＝時計回り");
    // 軸は半円の中心（181,210）
    assert.equal(await page.evaluate(() => { const g = document.querySelector(".mast-rays"), c = document.querySelector("svg.mast-sun circle"); return getComputedStyle(g).transformOrigin + "|" + c.getAttribute("cx") + "," + c.getAttribute("cy"); }), "181px 210px|181,210");
    // 速さは .mast の --mast-spin だけ
    await page.evaluate(() => document.getElementById("mast").style.setProperty("--mast-spin", "60s"));
    assert.equal((await info(page)).dur, "60s");
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});

test("題字の裏の筋（KJ-125）：時間が進むと筋だけが時計回りに回り、半円・題字の箱・枠は動かない。回しても枠の外にはみ出さず、枠の隅にも筋がある", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const { ctx, page, errors } = await open(browser, `http://127.0.0.1:${srv.address().port}/index.html`);
    const snap = () => page.evaluate(() => {
      const r = (e) => { const x = e.getBoundingClientRect(); return [x.left, x.top, x.width, x.height].map((v) => Math.round(v * 10) / 10); };
      const m = new DOMMatrix(getComputedStyle(document.querySelector(".mast-rays")).transform);
      return { deg: Math.atan2(m.b, m.a) * 180 / Math.PI, circle: r(document.querySelector("svg.mast-sun circle")), box: r(document.getElementById("mastTitle")), name: r(document.querySelector(".mast-name span")), svg: r(document.querySelector("svg.mast-sun")), sw: document.documentElement.scrollWidth };
    });
    const set = (ms) => page.evaluate((t) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = t; }), ms);
    await set(0); const a = await snap();
    await set(30000); const b = await snap();
    assert.ok(Math.abs(a.deg) < 0.01, "0秒は回っていない");
    assert.ok(Math.abs(b.deg - 90) < 0.5, `30秒で 90度（時計回り）：${b.deg}`);
    assert.deepEqual({ ...b, deg: 0 }, { ...a, deg: 0 }, "半円・題字の箱・題字・SVG の枠は動かない");
    assert.ok(a.sw <= 375 && b.sw <= 375, "横にはみ出さない");
    for (const t of [0, 7000, 30000, 61000, 95000]) {
      await set(t);
      for (const [i, w] of (await WINDOWS(page)).entries()) assert.ok(w.hit > 0, `${t}ms・点${i}：筋のある所がある`);
    }
    assert.deepEqual(errors, []);
    if (process.env.KJ_SHOT_MAST) {
      fs.mkdirSync(process.env.KJ_SHOT_MAST, { recursive: true });
      for (const [n, t] of [["mast-0s", 0], ["mast-30s", 30000]]) { await set(t); await page.screenshot({ path: path.join(process.env.KJ_SHOT_MAST, n + ".png"), clip: { x: 0, y: 0, width: 375, height: 260 } }); }
    }
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});

test("題字の裏の筋（KJ-125）：動きを減らす設定では回さない（animation なし・動くものが無い・形は同じ）", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const { ctx, page, errors } = await open(browser, `http://127.0.0.1:${srv.address().port}/index.html`, { reduce: true });
    const i = await info(page);
    assert.equal(i.rays, "none"); assert.deepEqual(i.anims, []);
    assert.equal(await page.evaluate(() => document.querySelectorAll("svg.mast-sun path").length), 36);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});
