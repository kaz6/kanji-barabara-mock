// 台の子持ち罫（KJ-147）：台の枠＝内側に墨の細い線（1px）・外側に墨の太い線（4px）・間に 3px の隙間。色は墨だけ・角丸なし・影なし。
// 台の高さ・札の大きさは今のまま（広い画面＝76px・札64px、540px 以下＝58px・札46px）・はみ出さない・帯は罫の内側。
// 空・2枚並べた・取る番の3つで罫が切れない。Playwright の Chromium がないと skip になる。KJ_SHOT_KOWAKU=<フォルダ> で画像を書く
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
const SHOT = process.env.KJ_SHOT_KOWAKU || "";
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
async function start(browser, url, vp) {
  const ctx = await browser.newContext({ viewport: vp, locale: "ja-JP" });
  await ctx.addInitScript(() => { try { localStorage.setItem("kj-tutorial", "1"); } catch (e) { /* */ } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("setupInfo").textContent.trim().length > 3);
  await page.check('#opp input[value="cpu"]');
  await page.check('#pow input[value="weak"]');
  await page.click("#start");
  await page.evaluate(() => {
    const G = __KJ.game; G.cpuTurn = () => null;
    G.me.cards = [..."日本上下山川口木"].map((c, i) => ({ id: 9100 + i, c, t: 0, fresh: false }));
    __KJ.render();
  });
  return { ctx, page, errors };
}
const rule = (page) => page.evaluate(() => {
  const r = document.getElementById("row"); const cs = getComputedStyle(r); const b = r.getBoundingClientRect();
  const t = r.querySelector(".tile"); const tb = t ? t.getBoundingClientRect() : null;
  const band = document.getElementById("takeBand"); const q = band.getBoundingClientRect();
  const root = getComputedStyle(document.documentElement);
  const out = parseFloat(cs.outlineWidth) + parseFloat(cs.outlineOffset);
  return {
    bw: parseFloat(cs.borderTopWidth), bs: cs.borderTopStyle, bc: cs.borderTopColor,
    ow: parseFloat(cs.outlineWidth), os: cs.outlineStyle, oc: cs.outlineColor, gap: parseFloat(cs.outlineOffset),
    ink: root.getPropertyValue("--ink").trim(), vars: [root.getPropertyValue("--rule-thick").trim(), root.getPropertyValue("--rule-gap").trim(), root.getPropertyValue("--rule-thin").trim()],
    radius: cs.borderTopLeftRadius, shadow: cs.boxShadow,
    h: b.height, tile: tb ? [tb.width, tb.height] : null,
    outer: [b.left - out, b.top - out, b.right + out, b.bottom + out],
    vw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth,
    bandHidden: band.hidden, bandIn: !band.hidden && q.left >= b.left + 0.5 && q.right <= b.right - 0.5 && q.top >= b.top + 0.5 && q.bottom <= b.bottom - 0.5,
    ink2: getComputedStyle(document.body).getPropertyValue("--ink").trim(),
  };
});
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };

for (const [name, vp, h, tile] of [["800px（広い画面）", { width: 800, height: 800 }, 76, 64], ["375×667", { width: 375, height: 667 }, 58, 46], ["320px", { width: 320, height: 640 }, 58, 46]]) {
  test(`台の子持ち罫（${name}）：太い線と細い線・墨だけ・角丸なし・影なし・高さと札は今のまま`, { skip }, async () => {
    const srv = await serve(); const url = `http://127.0.0.1:${srv.address().port}/index.html`;
    const browser = await chromium.launch();
    try {
      const { ctx, page, errors } = await start(browser, url, vp);
      const shot = async (n) => { if (SHOT) { fs.mkdirSync(SHOT, { recursive: true }); const b = await page.locator(".stage").boundingBox(); await page.screenshot({ path: path.join(SHOT, `kowaku-${vp.width}-${n}.png`), clip: { x: 0, y: Math.max(0, b.y - 24), width: vp.width, height: Math.min(vp.height - Math.max(0, b.y - 24), 230) } }); } };
      // 空
      let r = await rule(page);
      assert.deepEqual(r.vars, ["4px", "3px", "1px"], "太さ・隙間は :root の変数");
      assert.equal(r.bw, 1); assert.equal(r.bs, "solid"); assert.equal(r.bc, rgb(r.ink), "細い線は墨");
      assert.equal(r.ow, 4); assert.equal(r.os, "solid"); assert.equal(r.oc, rgb(r.ink), "太い線は墨");
      assert.equal(r.gap, 3, "隙間 3px");
      assert.equal(r.radius, "0px"); assert.equal(r.shadow, "none", "影を付けない");
      assert.equal(r.h, h, "台の高さは今のまま");
      assert.ok(r.outer[0] >= 0 && r.outer[2] <= r.vw, `罫が画面の横に収まる ${r.outer} / ${r.vw}`);
      // 罫を外したときの横幅と同じ（罫のせいで横に広がらない。320px は罫と関係なく今も 343px まで広がる）
      const base = await page.evaluate(() => { const e = document.getElementById("row"); const o = e.style.outline; e.style.outline = "none"; const w = document.documentElement.scrollWidth; e.style.outline = o; return w; });
      assert.equal(r.sw, base, "罫で横幅が増えない");
      await shot("empty");
      // 2枚並べた
      await page.locator("#meHand .tile", { hasText: "日" }).first().click();
      await page.locator("#meHand .tile", { hasText: "本" }).first().click();
      r = await rule(page);
      assert.deepEqual(r.tile, [tile, tile], "札の大きさは今のまま");
      assert.equal(r.h, h); assert.equal(r.oc, rgb(r.ink));
      await shot("two");
      // 取る番（帯が出る）
      await page.click("#bRelease");
      await page.waitForFunction(() => __KJ.game.me.takes > 0);
      r = await rule(page);
      assert.equal(r.bandHidden, false, "帯が出ている");
      assert.ok(r.bandIn, "帯は罫の内側（細い線を隠さない）");
      assert.equal(r.h, h);
      await shot("take");
      assert.deepEqual(errors, []);
      await ctx.close();
    } finally { await browser.close(); srv.close(); }
  });
}
