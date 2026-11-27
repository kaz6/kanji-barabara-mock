// KJ-126 画面：終わりの画面の煽り文句（勝ち負けの見出しのすぐ下に1行・飾りなし・墨の色・375／320px で収まる）／チュートリアルでは出ない。
// Playwright の Chromium がないと skip（skip は「通った」ではない）。KJ_SHOT_AORI=<フォルダ> で画像を書く
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
const SHOT = process.env.KJ_SHOT_AORI;

// 結果ごとに終わらせる。me・cpu＝点、timeout＝時間切れで終える（そうでなければ 休日 を放って先に50点で終える）
async function finishAs(page, { me, cpu, timeout }) {
  await page.evaluate(({ me, cpu, timeout }) => {
    const G = __KJ.game; G.cpuTurn = () => null;
    G.me.cards = [..."休日山川"].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
    G.me.score = me; G.cpu.score = cpu;
    if (timeout) { G.log.push({ t: 1, who: G.me.name, op: "放つ", from: [..."休日"], to: [], pts: 3, note: "" }); G.endsAt = G.now() - 1; } // 時間切れで終えるときは、放った言葉を1つ記録しておく（無いと「沈黙の一戦」）
    __KJ.render();
  }, { me, cpu, timeout });
  if (!timeout) {
    await page.locator("#meHand .tile", { hasText: "休" }).click();
    await page.locator("#meHand .tile", { hasText: "日" }).click();
    await page.click("#bRelease");
  }
  await page.waitForSelector("#endShow.on", { timeout: 15000 });
}
async function boot(browser, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 667 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem("kj-tutorial", "1"); } catch (e) { /* */ } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return { page, errors };
}
async function start(page, base) {
  await page.goto(base);
  await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
  await page.check('#opp input[value="cpu"]');
  await page.check('#lvl input[value="N5"]');
  await page.check('#pow input[value="weak"]');
  await page.click("#start");
}


test("KJ-126 画面：勝ち・負け・引き分けで、見出しのすぐ下に1行。字は墨・太字・Zen・飾りなし・375／320px で収まる", { skip }, async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    for (const width of [375, 320]) {
      const cases = [
        { k: "win", args: { me: 48, cpu: 10 }, want: "電光石火の快勝！" },
        { k: "lose", args: { me: 20, cpu: 40, timeout: true }, want: "涙の敗走、されど再起を誓う" },
        { k: "draw", args: { me: 20, cpu: 20, timeout: true }, want: "互角の名勝負、決着は次号へ！" },
      ];
      for (const c of cases) {
        const { page, errors } = await boot(browser, width);
        await start(page, base);
        await finishAs(page, c.args);
        await page.waitForSelector("#esAori .seg");
        const r = await page.evaluate(() => {
          const a = document.getElementById("esAori"), l = document.getElementById("esLabel"), sc = document.getElementById("esScore");
          const ab = a.getBoundingClientRect(), lb = l.getBoundingClientRect(), sb = sc.getBoundingClientRect();
          const cs = getComputedStyle(a), ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
          const probe = document.createElement("i"); probe.style.color = ink; document.body.appendChild(probe);
          const inkRgb = getComputedStyle(probe).color; probe.remove();
          const lh = parseFloat(cs.lineHeight);
          return { text: a.textContent, lines: Math.round(ab.height / lh), labelBottom: lb.bottom, top: ab.top, bottom: ab.bottom, scoreTop: sb.top, color: cs.color, inkRgb, weight: cs.fontWeight, family: cs.fontFamily, size: parseFloat(cs.fontSize), labelSize: parseFloat(getComputedStyle(l).fontSize), shadow: cs.textShadow, border: cs.borderTopWidth, bg: cs.backgroundColor, left: ab.left, right: ab.right };
        });
        const tag = `${c.k}@${width}`;
        assert.equal(r.text, c.want, tag);
        assert.ok(r.top >= r.labelBottom - 1 && r.bottom <= r.scoreTop + 1, `${tag}：見出しと点のあいだ`);
        assert.equal(r.color, r.inkRgb, `${tag}：墨のまま`);
        assert.ok(Number(r.weight) >= 700, tag);
        assert.match(r.family, /KJ Zen|Zen/, tag);
        assert.ok(r.size > 13 && r.size < r.labelSize, `${tag}：ほかの文より大きく見出しより小さく`);
        assert.equal(r.shadow, "none", tag);
        assert.equal(r.border, "0px", tag);
        assert.equal(r.bg, "rgba(0, 0, 0, 0)", tag);
        assert.ok(r.left >= 0 && r.right <= width, `${tag}：はみ出さない（${r.left}〜${r.right}）`);
        assert.ok(r.lines <= 2, `${tag}：2行まで（${r.lines}）`);
        if (SHOT) await page.screenshot({ path: path.join(SHOT, `aori-${c.k}-${width}.png`) });
        assert.deepEqual(errors, []);
        await page.context().close();
      }
    }
  } finally { await browser.close(); srv.close(); }
});

test("KJ-126 画面：折るのは意味のまとまり（、と！のあと）だけ", { skip }, async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    const { page } = await boot(browser, 320);
    await start(page, base);
    await finishAs(page, { me: 20, cpu: 40, timeout: true });
    await page.waitForSelector("#esAori .seg");
    const segs = await page.$$eval("#esAori .seg", (a) => a.map((x) => x.textContent));
    assert.deepEqual(segs, ["涙の敗走、", "されど再起を誓う"]);
  } finally { await browser.close(); srv.close(); }
});

test("KJ-126 画面：言葉を1つも放っていないと「沈黙の一戦」（ひとりは画面から外れているので core の試験 tests/aori.test.js で見る）", { skip }, async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    const { page } = await boot(browser, 375);
    await start(page, base);
    await page.evaluate(() => { const G = __KJ.game; G.cpuTurn = () => null; G.me.score = 3; G.cpu.score = 9; G.endsAt = G.now() - 1; __KJ.render(); });
    await page.waitForSelector("#endShow.on", { timeout: 15000 });
    assert.equal(await page.locator("#esAori").textContent(), "沈黙の一戦、語らずして幕");
  } finally { await browser.close(); srv.close(); }
});

test("KJ-126 画面：チュートリアルでは終わりの画面を出しても煽りは空", { skip }, async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
    await ctx.addInitScript(() => { try { localStorage.removeItem("kj-tutorial"); } catch (e) { /* */ } });
    const page = await ctx.newPage();
    await page.goto(base);
    await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
    await page.click("#bTutorial");
    await page.waitForFunction(() => document.body.classList.contains("tutorial"));
    await page.evaluate(() => { document.getElementById("esAori").textContent = "x"; showEnd(null); });
    assert.equal(await page.locator("#esAori").textContent(), "");
  } finally { await browser.close(); srv.close(); }
});
