// KJ-082（D-100）：終わりの画面に「見逃した言葉」を1行（ヒントで光ったのに放たれなかった言葉）。無いときは出さない
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


async function play({ hinted, shot }) {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 700 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => { try { localStorage.setItem("kj-tutorial", "1"); } catch (e) { /* */ } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
    await page.check('#lvl input[value="N5"]');
    await page.check('#opp input[value="cpu"]');
    await page.check('#pow input[value="weak"]');
    await page.click("#start");
    await page.evaluate((hinted) => {
      const G = __KJ.game; G.cpuTurn = () => null;
      G.me.cards = [..."休日山川"].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
      G.hinted.push(...hinted);
      G.me.score = 48;
      __KJ.render();
    }, hinted);
    await page.locator("#meHand .tile", { hasText: "休" }).click();
    await page.locator("#meHand .tile", { hasText: "日" }).click();
    await page.click("#bRelease");
    await page.waitForSelector("#endShow.on");
    const text = await page.textContent("#esMissed");
    if (shot) await page.screenshot({ path: shot });
    assert.deepEqual(errors, []);
    await ctx.close();
    return text;
  } finally { await browser.close(); srv.close(); }
}

test("KJ-082 画面：終わりに「見逃した言葉：字（読み） 意味」が出る。放った言葉は出ない", { skip }, async () => {
  const text = await play({ hinted: ["休日", "山川"], shot: process.env.KJ082_SHOT });
  assert.match(text, /^見逃した言葉：山川（.+）/);
  assert.ok(!text.includes("休日"));
});

test("KJ-082 画面：見逃した言葉が無ければ何も出さない", { skip }, async () => {
  assert.equal(await play({ hinted: ["休日"] }), "");
});
