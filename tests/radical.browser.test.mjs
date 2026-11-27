// 部品の札の意味の画面（KJ-021）：部品の札を選ぶと台の行の1行目に意味が出る・字の札では出ない・選びを外すと消える
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

const TYPES = { ".css": "text/css; charset=utf-8", ".otf": "font/otf", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8" };
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

async function begin(browser, url, hand) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 900 }, reducedMotion: "reduce" });
  await ctx.addInitScript(() => { try { localStorage.setItem("kj-tutorial", "1"); } catch (e) { /* 読めない端末 */ } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
  await page.check('#opp input[value="cpu"]');
  await page.check('#pow input[value="weak"]');
  await page.click("#start");
  await page.evaluate((h) => {
    const G = __KJ.game; G.cpuTurn = () => null;
    G.me.cards = [...h].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
  }, hand);
  await page.evaluate(() => __KJ.render());
  return { ctx, page, errors };
}
const tap = (page, ch) => page.locator("#meHand .tile:not(.sel)", { hasText: ch }).first().click();
const rad = (page) => page.locator("#info .rad").allTextContents();

test("部品の札の意味", { skip }, async (t) => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); srv.close(); });

  await t.test("部品の札を選ぶと台の行に意味が出る。字の札だけなら出ない。選びを外すと消える", async () => {
    const { ctx, page, errors } = await begin(browser, url, "艹儿日花辶云口水");
    assert.deepEqual(await rad(page), [], "何も選んでいないときは出ない");
    await tap(page, "日");
    assert.deepEqual(await rad(page), [], "字の札（日）では出ない");
    await tap(page, "艹");
    assert.deepEqual(await rad(page), ["艹（くさかんむり）草のこと"], "呼び名と意味");
    // 選んだ札をもう一度タップすると選びが外れて消える
    await page.locator("#meHand .tile.sel", { hasText: "艹" }).first().click();
    assert.deepEqual(await rad(page), [], "艹を外すと消える");
    await tap(page, "儿");
    assert.deepEqual(await rad(page), ["儿（ひとあし）＝人"], "同じ意味の字があるとき");
    await tap(page, "云");
    assert.deepEqual(await rad(page), ["云＝言"], "最後に選んだ部品の札（呼び名の無い部品は括弧を省く）");
    await tap(page, "口");
    assert.deepEqual(await rad(page), ["云＝言"], "あとに字の札を選んでも、台に残る部品の札の意味は出る");
    // 手札・台の札の見た目と並びは変えない
    assert.equal(await page.locator("#row .tile").count(), 4, "台の写しは4枚");
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("375px で、1行目の意味と2行目の言葉が見える（情報の欄は2行のまま）", async () => {
    const { ctx, page } = await begin(browser, url, "艹花日水");
    await tap(page, "艹"); await tap(page, "花");
    const r = await page.evaluate(() => { const i = document.getElementById("info"); return { h: i.getBoundingClientRect().height, sh: i.scrollHeight, rad: !!i.querySelector(".rad") }; });
    assert.equal(r.rad, true);
    assert.ok(r.sh <= r.h + 1, `情報の欄からはみ出さない（${r.sh} / ${r.h}）`);
    await ctx.close();
  });

  await t.test("人＋木 を台に置くと、1枚目が 亻 の形のあいだ、亻（にんべん）＝人 が出る", async () => {
    const { ctx, page, errors } = await begin(browser, url, "人木日水");
    await tap(page, "人");
    assert.deepEqual(await rad(page), [], "1枚だけのときは左の形にならない");
    await tap(page, "木");
    assert.deepEqual(await rad(page), ["亻（にんべん）＝人"]);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  for (const width of [375, 320]) {
    await t.test(`${width}px：全部品の意味の一行が1行に収まる（言葉の行を押し出さない）`, async () => {
      const { ctx, page } = await begin(browser, url, "日");
      await page.setViewportSize({ width, height: 900 });
      const bad = await page.evaluate(() => {
        const D = __KJ.data, T = __KJ.tables, K = window.KJ, out = [];
        const info = document.getElementById("info");
        for (const c of Object.keys(D.radical_meanings.parts)) {
          info.innerHTML = `<span class="rad">${K.radicalNote(D, T, c)}</span>`;
          const r = info.querySelector(".rad");
          if (r.scrollWidth > r.clientWidth + 1) out.push(c);
        }
        return out;
      });
      assert.deepEqual(bad, [], "1行に収まらない部品");
      await ctx.close();
    });
  }
});
