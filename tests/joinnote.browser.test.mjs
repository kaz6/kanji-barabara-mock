// くっつく相手の画面（KJ-083）：部品の札を選んだとき、手札・ストックに相手があれば台の行の1行目に出る・字の札では出ない・選びを外すと消える
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
  await page.evaluate(() => { __KJ.data.rules.join_note = "full"; __KJ.render(); }); // 作者が rules の join_note を変えても落ちないよう、形は full に決める
  return { ctx, page, errors };
}
const tap = (page, ch) => page.locator("#meHand .tile:not(.sel)", { hasText: ch }).first().click();
const rad = (page) => page.locator("#info .rad").allTextContents();
const jn = (page) => page.locator("#info .joinnote").allTextContents();
const SHOT = process.env.KJ_SHOT_DIR; // 画像を撮るときだけ（PR 用）

test("部品の札を選んだとき、くっつく相手を台の行に出す（KJ-083）", { skip }, async (t) => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); srv.close(); });

  await t.test("手札に相手があるときだけ出る。字の札・外したときは出ない。意味の行は今までどおり", async () => {
    const { ctx, page, errors } = await begin(browser, url, "禾火日山");
    assert.deepEqual(await jn(page), [], "何も選んでいないときは出ない");
    await tap(page, "日");
    assert.deepEqual(await jn(page), [], "字の札（日）では出ない");
    await page.locator("#meHand .tile.sel", { hasText: "日" }).first().click();
    await tap(page, "禾");
    assert.deepEqual(await jn(page), ["　くっつく：禾＋火→秋"]);
    assert.equal((await rad(page)).length, 1, "部品の意味の行は残る");
    assert.ok((await rad(page))[0].startsWith("禾"), "意味の行の中身は変わらない（くっつくは含まない）");
    assert.ok(!(await rad(page))[0].includes("くっつく"));
    const h = await page.evaluate(() => { const i = document.getElementById("info"); return { h: i.getBoundingClientRect().height, sh: i.scrollHeight }; });
    assert.ok(h.sh <= h.h + 1, `情報の欄は2行のまま（${h.sh} / ${h.h}）`);
    if (SHOT) await page.screenshot({ path: path.join(SHOT, "kj-083-with-375.png"), clip: { x: 0, y: 0, width: 375, height: 560 } });
    await tap(page, "日");
    assert.deepEqual(await jn(page), [], "最後に選んだ札が字の札なら出ない");
    await page.locator("#meHand .tile.sel", { hasText: "日" }).first().click();
    await page.locator("#meHand .tile.sel", { hasText: "禾" }).first().click();
    assert.deepEqual(await jn(page), [], "外すと消える");
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("手札にもストックにも相手が無ければ、意味だけ", async () => {
    const { ctx, page } = await begin(browser, url, "禾日山川");
    await tap(page, "禾");
    assert.deepEqual(await jn(page), []);
    assert.equal((await rad(page)).length, 1);
    if (SHOT) await page.screenshot({ path: path.join(SHOT, "kj-083-without-375.png"), clip: { x: 0, y: 0, width: 375, height: 560 } });
    await ctx.close();
  });

  await t.test("ストックにある相手も出る。3組まで・あとは ほか N組", async () => {
    const { ctx, page } = await begin(browser, url, "辶周首甬隹日山川");
    await page.evaluate(() => { const G = __KJ.game; G.me.cards.slice(-3).forEach((x) => { x.tray = true; }); __KJ.render(); });
    await tap(page, "辶");
    const t0 = (await jn(page))[0];
    assert.ok(t0.includes("辶＋周→週") && t0.includes("ほか1組"), t0);
    await ctx.close();
  });

  await t.test("rules の join_note で3つの形が切り替わる", async () => {
    const { ctx, page } = await begin(browser, url, "禾火日山");
    for (const [mode, want] of [["full", "くっつく：禾＋火→秋"], ["partner", "くっつく：禾＋火"], ["mask", "くっつく：禾＋？"]]) {
      await page.evaluate((m) => { __KJ.data.rules.join_note = m; __KJ.render(); }, mode);
      if (!(await page.locator("#meHand .tile.sel", { hasText: "禾" }).count())) await tap(page, "禾");
      assert.deepEqual((await jn(page)).map((x) => x.trim()), [want], mode);
    }
    await ctx.close();
  });

  for (const width of [375, 320]) {
    await t.test(`${width}px：くっつく相手が出ても1行目は1行のまま、言葉の行を押し出さない`, async () => {
      const { ctx, page } = await begin(browser, url, "禾火日水");
      await page.setViewportSize({ width, height: 900 });
      await tap(page, "禾");
      const r = await page.evaluate(() => { const i = document.getElementById("info"), l = i.querySelector(".l1"); return { h: i.getBoundingClientRect().height, sh: i.scrollHeight, l1: l ? l.getBoundingClientRect().height : 0, jn: !!i.querySelector(".joinnote") }; });
      assert.equal(r.jn, true, "くっつくの行が出ている");
      assert.ok(r.sh <= r.h + 1, `情報の欄からはみ出さない（${r.sh} / ${r.h}）`);
      assert.ok(r.l1 > 0 && r.l1 <= 24, `1行目は1行（${r.l1}）`);
      await ctx.close();
    });
  }
});
