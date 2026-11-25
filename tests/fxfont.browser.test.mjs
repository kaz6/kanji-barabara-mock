// 特別な語の演出の筆文字（KJ-063）：はじめる前の画面のうちに字体が読まれる・#fx .c だけが筆文字・読めなくても今の字で出る
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

async function open(browser, url, { block = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("kj-tutorial", "1"); } catch (e) { /* 読めない端末 */ } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  if (block) await page.route("**/fonts/kj-fx.woff", (r) => r.abort());
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
  return { ctx, page, errors };
}

test("筆文字：はじめる前の画面のうちに読まれ、#fx .c だけが筆文字（札・ボタンは今のまま）", { skip }, async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  try {
    const { ctx, page, errors } = await open(browser, `http://127.0.0.1:${srv.address().port}/`);
    await page.waitForFunction(() => document.fonts.check('100px "KJ Fx"', "天上下") && [...document.fonts].some((f) => f.family.includes("KJ Fx") && f.status === "loaded"));
    const fam = await page.evaluate(() => {
      const fx = document.getElementById("fxChars");
      const c = document.createElement("div"); c.className = "c"; c.textContent = "天"; fx.appendChild(c);
      const other = getComputedStyle(document.getElementById("start")).fontFamily;
      return { c: getComputedStyle(c).fontFamily, other, root: getComputedStyle(document.body).fontFamily };
    });
    assert.match(fam.c, /^"KJ Fx", "KJ Kaisei", "KJ Shippori", "KJ Glyphs"/, "筆文字のあとは今の札の字（KJ-093：Kaisei → Shippori → kj-glyphs）");
    assert.ok(!fam.other.includes("KJ Fx") && !fam.root.includes("KJ Fx"));
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});

test("筆文字：字体が読めなくても落ちず、今の字（--kanji）で出る", { skip }, async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  try {
    const { ctx, page, errors } = await open(browser, `http://127.0.0.1:${srv.address().port}/`, { block: true });
    const ok = await page.evaluate(() => { const c = document.createElement("div"); c.className = "c"; c.textContent = "天"; document.getElementById("fxChars").appendChild(c); return getComputedStyle(c).fontFamily.includes("KJ Glyphs"); });
    assert.ok(ok);
    assert.equal(await page.evaluate(() => document.fonts.check('100px "KJ Fx"', "天")), false, "読めていない");
    assert.deepEqual(errors.filter((e) => !/Failed to load resource|ERR_FAILED/.test(e)), []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});
