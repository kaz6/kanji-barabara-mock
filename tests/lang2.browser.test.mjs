// KJ-128：言語の切り替え（段2）の画面。English でチュートリアルを通す・部品の札を選ぶと台の行に英語の意味・くっつく相手の行・台の行の注・日本語に戻すと今のまま。
// Playwright の Chromium がないと skip になる。skip は「通った」ではない。KJ_SHOT_LANG2=<フォルダ> で 375×667 の画像（チュートリアルの1段目・部品の札の台の行）を書く
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readBox } from "./dragwait.mjs";

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
const KANA = /[぀-ヿ]/;
const SHOT = process.env.KJ_SHOT_LANG2;

async function open(browser, url, lang) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, locale: "ja-JP", deviceScaleFactor: 2 });
  await ctx.addInitScript((lang) => { try { localStorage.setItem("kj-lang", lang); localStorage.setItem("kj-tutorial", "1"); } catch (e) { /* */ } window.__KJ_LOG_FORCE = false; }, lang);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/rest/v1/play_logs", (r) => r.fulfill({ status: 201, body: "" }));
  await page.goto(url);
  await page.waitForFunction(() => /^(字 |\d+ kanji)/.test(document.getElementById("setupInfo").textContent));
  return { ctx, page, errors };
}
const tile = (page, ch) => page.locator(`#meHand .tile[title="${ch}"], #meTray .tile[title="${ch}"]`).first();
const stepText = (page) => page.textContent("#tutStep");
const lineText = (page) => page.textContent("#tutLine");
const autoTaken = (page) => page.waitForFunction(() => __KJ.game.me.takes === 0 && !document.querySelector('body > .tile[style*="position: fixed"]'), null, { timeout: 5000 });
async function dragTo(page, from, to, rx, ry) {
  const f = await readBox(tile(page, from)), tb = await readBox(tile(page, to));
  const x1 = f.x + f.width / 2, y1 = f.y + f.height / 2, x2 = tb.x + tb.width * rx, y2 = tb.y + tb.height * ry;
  await page.mouse.move(x1, y1); await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 });
  await page.mouse.move(x2, y2, { steps: 4 });
  await page.mouse.up();
}
// 9段（English は 取る のあとに 読み〔KJ-130〕が入る）を通す。seen に、各段で出た見出しと案内を集める
async function playThrough(page, seen) {
  const note = async () => seen.push([await stepText(page), await lineText(page)]);
  await note(); // 1 放つ
  await tile(page, "大").click(); await tile(page, "雨").click(); await page.click("#bRelease");
  await note(); // 2 取る
  for (let i = 0; i < 2; i++) await page.locator("#field .tile").first().click();
  await note(); // 3 読み（English だけ。押す手は「次へ」）
  await page.click("#tutNext");
  await note(); // 4 割る
  await tile(page, "好").click(); await page.click("#bSplit"); await note(); await page.click("#bRelease"); await autoTaken(page);
  await note(); // 5 くっつける
  await dragTo(page, "十", "口", 0.5, 0.12); await note();
  await tile(page, "古").click(); await tile(page, "本").click(); await page.click("#bRelease"); await autoTaken(page);
  await note(); // 6 反転
  await tile(page, "下").click(); await page.click("#bInvert"); await tile(page, "手").click(); await page.click("#bRelease"); await autoTaken(page);
  await note(); // 7 巡り
  await tile(page, "月").click(); await page.click("#bCycle"); await tile(page, "山").click(); await page.click("#bRelease"); await autoTaken(page);
  await note(); // 8 同音
  await tile(page, "木").click(); await page.click("#bHomo"); await page.locator(".choices button", { hasText: "気" }).click();
  await tile(page, "分").click(); await page.click("#bRelease"); await autoTaken(page);
  await page.waitForFunction(() => !document.getElementById("tutGo").hidden, null, { timeout: 5000 });
  await note(); // 9 おわり
}

test("KJ-128 English でチュートリアルを通す：9段（読みの段つき）の見出し・案内が English・日本語の文が残らない・本番へ", { skip }, async () => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    const { ctx, page, errors } = await open(browser, url, "en");
    assert.equal(await page.textContent("#bTutorial"), "Tutorial");
    await page.click("#bTutorial");
    assert.match(await stepText(page), /^1 \/ 9　Play$/);
    assert.equal(await page.textContent("#tutSkip"), "Skip");
    if (SHOT) { fs.mkdirSync(SHOT, { recursive: true }); await page.screenshot({ path: path.join(SHOT, "tutorial-en-1.png") }); }
    // 今の段でない手は、English の理由ではじく（否 の判子）
    await page.locator("#bSplit").click({ force: true });
    assert.match(await page.textContent("#nopeWhy"), /^Not now \(Tutorial 1: Play\)$/);
    const seen = [];
    await playThrough(page, seen);
    assert.deepEqual(seen.map((s) => s[0].replace(/^(\d) \/ 9　/, "$1 ")), ["1 Play", "2 Take", "3 Readings", "4 Split", "4 Split", "5 Join", "5 Join", "6 Flip", "7 Cycle", "8 Same reading", "9 Done"]);
    for (const [step, line] of seen) {
      assert.ok(!KANA.test(step), step);
      assert.ok(!KANA.test(line), `かなが残っている：${line}`); // 札の漢字（大雨 など）はそのまま。かなは English の文に混ざらない
      assert.match(line, /[A-Za-z]{3}/);
    }
    assert.match(seen[1][1], /^After you play, take as many cards/);
    assert.match(seen[2][1], /^Each character has readings\. 大 \(dai \/ oo\) \+ 雨 \(u \/ ame\) → 大雨 \(ooame\)$/); // 読みの段（KJ-130）
    assert.equal(await page.textContent("#tutGo"), "Start playing");
    assert.deepEqual(errors, []);
    await ctx.close();
    // 同じ画面を日本語で：今のまま
    const ja = await open(browser, url, "ja");
    assert.equal(await ja.page.textContent("#bTutorial"), "チュートリアル");
    await ja.page.click("#bTutorial");
    assert.match(await stepText(ja.page), /^1 \/ 8　放つ$/);
    assert.match(await lineText(ja.page), /^大 → 雨 の順にタップして、Play で放つ（大雨）$/);
    assert.equal(await ja.page.textContent("#tutSkip"), "とばす");
    await ja.page.locator("#bSplit").click({ force: true });
    assert.match(await ja.page.textContent("#nopeWhy"), /^いまは使わない（チュートリアル 1：放つ）$/);
    await ja.ctx.close();
  } finally { await browser.close(); srv.close(); }
});

test("KJ-128 English のチュートリアルではじかれた理由は English・ログに残る理由は日本語のまま", { skip }, async () => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    const { ctx, page } = await open(browser, url, "en");
    await page.click("#bTutorial");
    await tile(page, "大").click(); // 大 だけ選んで Play（大 → 雨 を使う）
    await page.locator("#bRelease").click({ force: true });
    assert.equal(await page.textContent("#nopeWhy"), "Tutorial: use 大 → 雨 now");
    const log = await page.evaluate(() => JSON.stringify(__KJ.game.log));
    assert.match(log, /チュートリアル：いまは 大 → 雨 を使う/, "ログに残る理由は日本語");
    assert.ok(!log.includes("Tutorial: use"), "ログに English は入らない");
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});

// 手札を決めて試合を始める（tests/radical.browser.test.mjs と同じやり方。CPU は動かさない）
async function begin(browser, url, lang, hand) {
  const { ctx, page, errors } = await open(browser, url, lang);
  await page.check('#opp input[value="cpu"]');
  await page.check('#pow input[value="weak"]');
  await page.click("#start");
  await page.evaluate((h) => { const G = __KJ.game; G.cpuTurn = () => null; G.me.cards = [...h].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false })); __KJ.render(); }, hand);
  return { ctx, page, errors };
}
const tap = (page, ch) => page.locator("#meHand .tile:not(.sel)", { hasText: ch }).first().click();
const rad = (page) => page.locator("#info .rad").allTextContents();
const info = (page) => page.evaluate(() => document.getElementById("info").textContent);

test("KJ-128 部品の札を選ぶと台の行に English の意味（字の札は出ない・外すと消える）。ja は今のまま", { skip }, async () => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    const en = await begin(browser, url, "en", "艹儿日花辶云口水");
    await tap(en.page, "日");
    assert.deepEqual(await rad(en.page), []);
    await tap(en.page, "艹");
    assert.deepEqual(await rad(en.page), ["艹 (grass): grass; plants"]);
    if (SHOT) { fs.mkdirSync(SHOT, { recursive: true }); await en.page.screenshot({ path: path.join(SHOT, "radical-en.png") }); }
    await en.page.locator("#meHand .tile.sel", { hasText: "艹" }).first().click();
    assert.deepEqual(await rad(en.page), []);
    await tap(en.page, "儿");
    assert.deepEqual(await rad(en.page), ["儿 (legs) = 人"]);
    await tap(en.page, "云");
    assert.deepEqual(await rad(en.page), ["云 = 言"]);
    assert.deepEqual(en.errors, []);
    await en.ctx.close();
    const ja = await begin(browser, url, "ja", "艹儿日花辶云口水");
    await tap(ja.page, "艹");
    assert.deepEqual(await rad(ja.page), ["艹（くさかんむり）草のこと"]);
    await ja.ctx.close();
  } finally { await browser.close(); srv.close(); }
});

test("KJ-128 くっつく相手の行：部品の札を選ぶと English で Joins: 禾+火→秋（ja は くっつく：禾＋火→秋）。亻（にんべん）の形の行も", { skip }, async () => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    const en = await begin(browser, url, "en", "禾火日水人木");
    await tap(en.page, "禾");
    const jn = await en.page.locator("#info .joinnote").textContent();
    assert.match(jn.trim(), /^Joins: 禾\+火→秋/);
    assert.ok(!/[぀-ヿ＋？]/.test(jn), jn);
    await en.page.locator("#meHand .tile.sel", { hasText: "禾" }).first().click();
    await tap(en.page, "人"); await tap(en.page, "木");
    assert.deepEqual(await rad(en.page), ["亻 (person radical) = 人"]);
    await en.ctx.close();
    const ja = await begin(browser, url, "ja", "禾火日水");
    await tap(ja.page, "禾");
    assert.match((await ja.page.locator("#info .joinnote").textContent()).trim(), /^くっつく：禾＋火→秋/);
    await ja.ctx.close();
  } finally { await browser.close(); srv.close(); }
});

test("KJ-128 台の行の注：点・辞書にない理由・くっつけると・四字熟語・地名が English。ja は今のまま", { skip }, async () => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    // 辞書の語：N4 の語の表から、四字熟語と地名（2字）の語を1つずつ探して、その字を手札にする
    const probe = await open(browser, url, "ja");
    const found = await probe.page.evaluate(() => {
      const T = window.KJ.makeTables(__KJ.data, "N4");
      let yoji = null, pn = null;
      for (const [k, w] of T.WORDS) { if (!yoji && w.yoji && [...k].length === 4) yoji = k; if (!pn && w.pn && w.pn.includes("地名") && !w.pn.includes("名字") && [...k].length === 2) pn = k; }
      return { yoji, pn };
    });
    await probe.ctx.close();
    assert.ok(found.pn, "N4 に地名の語がある");
    for (const lang of ["en", "ja"]) {
      const { ctx, page, errors } = await begin(browser, url, lang, "日本空大十口" + (found.pn || ""));
      await tap(page, "日"); await tap(page, "本");
      const t1 = await info(page);
      if (lang === "en") { assert.match(t1, /\d+ pts/); assert.match(t1, /Japan/); } else { assert.match(t1, /\d+点/); assert.match(t1, /Japan/); }
      await page.evaluate(() => { __KJ.row.length = 0; __KJ.render(); });
      await tap(page, "空"); await tap(page, "大");
      const t2 = await info(page);
      if (lang === "en") assert.ok(t2.includes("Not in the dictionary!"), t2); else assert.ok(t2.includes("辞書にない"), t2);
      await page.evaluate(() => { __KJ.row.length = 0; __KJ.render(); });
      await tap(page, "十"); await tap(page, "口");
      const t3 = await info(page);
      if (lang === "en") assert.match(t3, /Joins to make 古 or 田|Joins to make 田 or 古/); else assert.match(t3, /くっつけると (古 か 田|田 か 古)/);
      // 地名の語：〔地名〕／〔place〕
      await page.evaluate(() => { __KJ.row.length = 0; __KJ.render(); });
      for (const c of found.pn) await tap(page, c);
      const t4 = await info(page);
      if (lang === "en") assert.match(t4, /〔place\]|〔place〕/); else assert.match(t4, /〔地名〕/);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally { await browser.close(); srv.close(); }
});
