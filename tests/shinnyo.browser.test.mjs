// KJ-116：辶 の札が kj-glyphs の字形（点1つ）で描かれる。大正風（Kaisei）・明朝（Shippori）の両方。Playwright の Chromium がないと skip になる
// 字形の見分け：辶 を大きく描いて、墨のつながり（連結成分）を数える。点1つ＝点＋しんにょうの2つ、点2つ＝3つ。
// KJ_SHOT_SHINNYO=<フォルダ> を付けると、375×667・deviceScaleFactor 2 の画像を書く
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
const SHOT = process.env.KJ_SHOT_SHINNYO;

// 字を fam の字体で描き、墨の連結成分の数（n）と墨の画素数（ink）を返す
const INK = `(async (fam) => {
  await document.fonts.load('200px "KJ Glyphs"', "\\u8fb6");
  await document.fonts.load('200px "KJ Shippori"', "\\u8fb6");
  await document.fonts.load('200px "KJ Kaisei"', "\\u8fb6");
  const W = 240, H = 240, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const x = cv.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, W, H); x.fillStyle = "#000";
  x.font = "200px " + fam; x.textBaseline = "alphabetic"; x.fillText("\\u8fb6", 20, 190);
  const d = x.getImageData(0, 0, W, H).data, on = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) on[i] = d[i * 4] < 128 ? 1 : 0;
  const seen = new Uint8Array(W * H); let n = 0, ink = 0;
  for (let s = 0; s < W * H; s++) {
    if (!on[s]) continue; ink++;
    if (seen[s]) continue; n++;
    const st = [s]; seen[s] = 1;
    while (st.length) { const p = st.pop(), px = p % W, py = (p / W) | 0;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = px + dx, ny = py + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const q = ny * W + nx; if (on[q] && !seen[q]) { seen[q] = 1; st.push(q); } } }
  }
  return { n, ink };
})`;

for (const [face, label] of [["taisho", "大正風（Kaisei）"], ["mincho", "明朝（Shippori）"]]) {
  test(`辶：札の字が ${label} でも kj-glyphs の字形（点1つ）で描かれる`, { skip }, async () => {
    const srv = await serve(); const browser = await chromium.launch();
    try {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
      await ctx.addInitScript(([f]) => { try { localStorage.setItem("kj-tutorial", "1"); if (f && f !== "taisho") localStorage.setItem("kj-face", f); } catch (e) { /* */ } }, [face]);
      const page = await ctx.newPage();
      const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
      await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`);
      await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
      assert.equal(await page.evaluate(() => document.documentElement.dataset.face), face);
      await page.check('#opp input[value="cpu"]');
      await page.check('#pow input[value="weak"]');
      await page.click("#start");
      await page.evaluate(() => {
        const G = __KJ.game; G.cpuTurn = () => null;
        G.me.cards = [..."辶週道進天十日下"].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
        __KJ.render();
      });
      // 札の字体の並び（--kanji）で描いた 辶 と、kj-glyphs だけで描いた 辶 が同じ形で、点1つ（墨のつながり2つ）
      const stack = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--kanji").trim());
      const viaStack = await page.evaluate(`${INK}(${JSON.stringify(stack)})`);
      const viaGlyphs = await page.evaluate(`${INK}('"KJ Glyphs", serif')`);
      assert.equal(viaStack.n, 2, `辶 の墨のつながりは 2（点1つ＋しんにょう）。実際 ${viaStack.n}`);
      assert.deepEqual(viaStack, viaGlyphs, "札の字体の並びで描いた 辶 が kj-glyphs の字形と同じ（Shippori の 辶 に先取りされない）");
      // 手札の 辶 の札の font-family に KJ Glyphs がある
      const used = await page.evaluate(() => {
        const cell = [...document.querySelectorAll(".tile")].find((e) => e.textContent.trim() === "辶");
        return cell ? getComputedStyle(cell).fontFamily : null;
      });
      assert.ok(used && used.includes("KJ Glyphs"), "辶 の札の font-family に KJ Glyphs がある");
      assert.deepEqual(errors, []);
      if (SHOT) {
        fs.mkdirSync(SHOT, { recursive: true });
        await page.screenshot({ path: path.join(SHOT, `shinnyo-${face}.png`) });
      }
      await ctx.close();
    } finally { await browser.close(); srv.close(); }
  });
}
