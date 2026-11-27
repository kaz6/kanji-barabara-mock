// 試合の画面の並び（KJ-089。並び B と切り替えを消した。A だけ）。Playwright の Chromium がないと skip になる
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
async function open(browser, url, stored = null, vp = { width: 375, height: 800 }) {
  const ctx = await browser.newContext({ viewport: vp, reducedMotion: "reduce" });
  await ctx.addInitScript((st) => { try { localStorage.setItem("kj-tutorial", "1"); if (st) localStorage.setItem("kj-layout", st); } catch (e) { /* 読めない端末 */ } }, stored);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
  return { ctx, page, errors };
}
async function play(page) {
  await page.check('#opp input[value="cpu"]');
  await page.check('#pow input[value="weak"]');
  await page.click("#start");
  await page.evaluate(() => {
    const G = __KJ.game; G.cpuTurn = () => null;
    G.me.cards = [..."天上天下十口休日"].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
    G.field = [..."山川玉"].map((c, i) => ({ id: 9500 + i, c, t: 0, fresh: false }));
    __KJ.render();
  });
}
const box = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, sel);
const inTable = (page, sel) => page.evaluate((s) => !!document.querySelector(s).closest(".table:not(.dock)"), sel);

test("並び：切り替えも下の段もない／端末に kj-layout=B が残っていても A の置き場（Back は Redraw の左で卓の外・操作は卓の中。KJ-090）", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const url = `http://127.0.0.1:${srv.address().port}/index.html`;
    for (const stored of [null, "B", "zzz"]) {
      const { ctx, page, errors } = await open(browser, url, stored);
      assert.equal(await page.evaluate(() => !document.getElementById("layoutPick") && !document.getElementById("grpLay") && !document.getElementById("dock")), true, `${stored}：切り替えも下の段もない`);
      await play(page);
      for (const id of ["bRelease", "bSplit", "bJoin", "bInvert", "bCycle", "bHomo"]) assert.equal(await inTable(page, "#" + id), true, `${stored}：${id} は卓の中`);
      assert.equal(await inTable(page, "#bBack"), false, `${stored}：Back は卓の外（KJ-090）`);
      const back = await box(page, "#bBack"), rd = await box(page, "#bRedraw");
      assert.ok(back.r <= rd.l, `${stored}：Back は Redraw の左`);
      const play_ = await box(page, "#bRelease");
      assert.ok(play_.w > 300, `${stored}：Play は幅いっぱい`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "横にはみ出さない");
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally { await browser.close(); srv.close(); }
});
