// KJ-130：English のとき、読みをローマ字で出す（画面）。字の札を選ぶと台の行に「日 · nichi, jitsu / hi, bi · day, sun」・語を放ったあと台が空のあいだ「日本 · nihon · Japan」・
// 放つ前の台には読みを出さない・次に札を選ぶと消える・日本語では出ない・終わりの画面の語にもローマ字・English のチュートリアルの読みの段。
// Playwright の Chromium がないと skip になる。skip は「通った」ではない。KJ_SHOT_ROMAJI=<フォルダ> で 375×667 の画像（字の台の行・放ったあと）を書く
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
const SHOT = process.env.KJ_SHOT_ROMAJI;
const KANA = /[぀-ヿ]/;

async function setup(browser, url, lang) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, locale: "ja-JP", deviceScaleFactor: 2, reducedMotion: "reduce" });
  await ctx.addInitScript((lang) => { try { localStorage.setItem("kj-lang", lang); localStorage.setItem("kj-tutorial", "1"); } catch (e) { /* */ } window.__KJ_LOG_FORCE = false; }, lang);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/rest/v1/play_logs", (r) => r.fulfill({ status: 201, body: "" }));
  await page.goto(url);
  await page.waitForFunction(() => /^(字 |\d+ kanji)/.test(document.getElementById("setupInfo").textContent));
  return { ctx, page, errors };
}
async function begin(browser, url, lang, hand, width = 375) {
  const ctx = await browser.newContext({ viewport: { width, height: 667 }, locale: "ja-JP", deviceScaleFactor: 2, reducedMotion: "reduce" });
  await ctx.addInitScript((lang) => { try { localStorage.setItem("kj-lang", lang); localStorage.setItem("kj-tutorial", "1"); } catch (e) { /* */ } window.__KJ_LOG_FORCE = false; }, lang);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/rest/v1/play_logs", (r) => r.fulfill({ status: 201, body: "" }));
  await page.goto(url);
  await page.waitForFunction(() => /^(字 |\d+ kanji)/.test(document.getElementById("setupInfo").textContent));
  await page.check('#lvl input[value="N5"]');
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
const info = (page) => page.textContent("#info");
const norm = (s) => s.replace(/\s+/g, " ").trim();

test("KJ-130 画面", { skip }, async (t) => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); srv.close(); });

  await t.test("English：字の札を選ぶと台の行に「日 · nichi, jitsu / hi, bi · day, sun」。外す・部品の札では出ない", async () => {
    const { ctx, page, errors } = await begin(browser, url, "en", "日本休山艹");
    assert.equal(norm(await info(page)), "");
    await tap(page, "日");
    assert.match(norm(await info(page)), /^日 · nichi, jitsu \/ hi, bi · day, sun/);
    if (SHOT) { fs.mkdirSync(SHOT, { recursive: true }); await page.screenshot({ path: path.join(SHOT, "info-char-en.png") }); }
    await page.locator("#meHand .tile.sel", { hasText: "日" }).first().click();
    assert.equal(norm(await info(page)), "", "選びを外すと消える");
    await tap(page, "本");
    assert.match(norm(await info(page)), /^本 · hon \/ moto · book, present/);
    await tap(page, "山"); // 2枚（本山）になったら、字の読みの一行ではなくなる
    assert.ok(!norm(await info(page)).includes(" · hon / moto"), norm(await info(page)));
    await page.click("#bBack");
    await tap(page, "艹");
    assert.ok(!/ · /.test(await page.textContent("#info .l1, #info") || ""), "部品の札には読みを出さない");
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("日本語：字の札を選んでもローマ字は出ない（今のまま）", async () => {
    const { ctx, page } = await begin(browser, url, "ja", "日本休山");
    await tap(page, "日");
    const x = norm(await info(page));
    assert.ok(!/nichi|hi, bi/.test(x), x);
    await tap(page, "本");
    assert.ok(!/nihon/.test(norm(await info(page))));
    await page.click("#bRelease");
    assert.ok(!/nihon/.test(norm(await info(page))), "放ったあとも出ない");
    await ctx.close();
  });

  await t.test("English：放つ前の台（日本）には読みを出さない。放ったあと台が空のあいだ「日本 · nihon · Japan」・次に札を選ぶと消える", async () => {
    const { ctx, page, errors } = await begin(browser, url, "en", "日本休山");
    await tap(page, "日"); await tap(page, "本");
    const before = norm(await info(page));
    assert.ok(!/nihon/.test(before), "放つ前は読みを出さない：" + before);
    await page.click("#bRelease");
    assert.equal(await page.locator("#row .tile").count(), 0, "台は空");
    assert.match(norm(await info(page)), /^日本 · nihon · Japan/);
    if (SHOT) await page.screenshot({ path: path.join(SHOT, "info-word-en.png") });
    await page.waitForTimeout(600); // 画面の定期処理のあとも出たまま
    assert.match(norm(await info(page)), /^日本 · nihon · Japan/);
    for (let i = 0; i < 2; i++) await page.locator("#field .tile").first().click(); // 放ったあとは、場から取りきるまで札を選べない（KJ-039）
    await page.waitForFunction(() => __KJ.game.me.takes === 0);
    assert.match(norm(await info(page)), /^日本 · nihon/, "取っても、札を選ぶまでは出たまま");
    await tap(page, "休");
    assert.ok(!/nihon/.test(norm(await info(page))), "次に札を選ぶと消える");
    assert.match(norm(await info(page)), /^休 · /);
    await page.click("#bBack");
    assert.equal(norm(await info(page)), "", "選びを外しても戻らない");
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  for (const width of [375, 320]) {
    await t.test(`${width}px：全部の字の読みの一行（1字では放てない理由つき）が、情報の欄の2行に収まる`, async () => {
      const { ctx, page } = await begin(browser, url, "en", "日", width);
      const bad = await page.evaluate(() => {
        const D = __KJ.data, K = window.KJ, out = [];
        const box = document.getElementById("info"), cs = getComputedStyle(box);
        const probe = document.createElement("div");
        probe.style.cssText = `position:absolute;visibility:hidden;width:${box.clientWidth}px;font:${cs.font};line-height:${cs.lineHeight};letter-spacing:${cs.letterSpacing}`;
        document.body.appendChild(probe);
        const lh = parseFloat(cs.lineHeight);
        for (const r of [...D.kanji.kanji, ...D.kanji.outside]) {
          const line = K.charReadingLine(D, r.c);
          probe.innerHTML = `<span class="w">${r.c}</span>${line.slice(1)} <span class="no">(2+ characters!)</span>`; // 台が1枚のときは、1字では放てない理由が後ろに付く
          if (probe.getBoundingClientRect().height > lh * 2 + 1) out.push(line);
        }
        probe.remove();
        return out;
      });
      assert.deepEqual(bad, [], "2行に収まらない字");
      await ctx.close();
    });
  }

  await t.test("English：終わりの画面の語にローマ字。タップの欄の「Reading」にも。日本語では出ない", async () => {
    for (const lang of ["en", "ja"]) {
      const { ctx, page, errors } = await begin(browser, url, lang, "休日山川");
      await page.evaluate(() => { __KJ.game.me.score = 48; });
      await tap(page, "休"); await tap(page, "日");
      await page.click("#bRelease");
      await page.waitForSelector("#endShow.on", { timeout: 8000 });
      await page.waitForSelector("#endShow[data-done='1']", { timeout: 8000 });
      const k = norm(await page.locator("#esWords .esw .k").first().textContent());
      const kana = await page.evaluate(() => __KJ.tables.WORDS.get("休日").kana);
      const rom = await page.evaluate(() => KJ.romaji(__KJ.tables.WORDS.get("休日").kana));
      if (lang === "en") {
        assert.equal(k, `${kana} · ${rom}`);
        await page.locator("#esWords .esw").first().click();
        assert.ok((await page.locator("#esWords .esd").textContent()).includes(`Reading: ${kana} · ${rom}`));
      } else assert.equal(k, kana, "日本語は今のまま");
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  });

  await t.test("English のチュートリアル：取る のあとに「Readings」の段（3 / 9）。「Next」だけで進み、ほかの手ははじく。日本語は8段のまま", async () => {
    const { ctx, page, errors } = await setup(browser, url, "en");
    await page.click("#bTutorial");
    assert.match(await page.textContent("#tutStep"), /^1 \/ 9　Play$/);
    assert.equal(await page.locator("#tutNext").isHidden(), true);
    const tile = (ch) => page.locator(`#meHand .tile[title="${ch}"], #meTray .tile[title="${ch}"]`).first();
    await tile("大").click(); await tile("雨").click(); await page.click("#bRelease");
    for (let i = 0; i < 2; i++) await page.locator("#field .tile").first().click();
    await page.waitForFunction(() => __KJ.game.me.takes === 0);
    assert.match(await page.textContent("#tutStep"), /^3 \/ 9　Readings$/);
    assert.equal(await page.textContent("#tutLine"), "Each character has readings. 大 (dai / oo) + 雨 (u / ame) → 大雨 (ooame)");
    assert.equal(await page.locator("#tutNext").isVisible(), true);
    assert.equal(await page.textContent("#tutNext"), "Next");
    if (SHOT) await page.screenshot({ path: path.join(SHOT, "tutorial-reading-en.png") });
    // 札・操作ははじく（否 の判子）
    await page.locator("#bSplit").click({ force: true });
    assert.match(await page.textContent("#nopeWhy"), /^Not now \(Tutorial 3: Readings\)$/);
    assert.match(await page.textContent("#tutStep"), /^3 \/ 9/);
    await page.click("#tutNext");
    assert.match(await page.textContent("#tutStep"), /^4 \/ 9　Split$/);
    assert.equal(await page.locator("#tutNext").isHidden(), true);
    assert.deepEqual(errors, []);
    await ctx.close();
    // 日本語：8段のまま・「次へ」は出ない
    const ja = await setup(browser, url, "ja");
    await ja.page.click("#bTutorial");
    assert.match(await ja.page.textContent("#tutStep"), /^1 \/ 8　放つ$/);
    const tj = (ch) => ja.page.locator(`#meHand .tile[title="${ch}"], #meTray .tile[title="${ch}"]`).first();
    await tj("大").click(); await tj("雨").click(); await ja.page.click("#bRelease");
    for (let i = 0; i < 2; i++) await ja.page.locator("#field .tile").first().click();
    await ja.page.waitForFunction(() => __KJ.game.me.takes === 0);
    assert.match(await ja.page.textContent("#tutStep"), /^3 \/ 8　割る$/);
    assert.equal(await ja.page.locator("#tutNext").isHidden(), true);
    await ja.ctx.close();
  });
});
