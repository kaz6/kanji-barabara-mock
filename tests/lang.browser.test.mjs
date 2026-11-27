// KJ-127：言語の切り替え（画面）。初めの言語・JP／EN のボタンと選び・端末に覚える・English で段1の範囲に日本語が残らない・終わりの画面・はじかれた理由・戦果の共有の文。
// Playwright の Chromium がないと skip になる。skip は「通った」ではない。KJ_SHOT_LANG=<フォルダ> で 375×667 の画像（ja・en のはじめる前と終わり）を書く
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


const KANA = /[\u3040-\u30ff]/;
const CJK = /[\u3400-\u9fff]/;

// locale＝端末の言語（既定 ja-JP）。lang＝端末に覚えた kj-lang（無ければ入れない）。share＝navigator.share を差し替えて window.__shared に残す
async function open(browser, url, { locale = "ja-JP", lang = null, vp = { width: 375, height: 667 }, share = false } = {}) {
  const ctx = await browser.newContext({ viewport: vp, locale, deviceScaleFactor: 2, permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.addInitScript(([lang, share]) => {
    try { localStorage.setItem("kj-tutorial", "1"); if (lang) localStorage.setItem("kj-lang", lang); } catch (e) { /* 読めない端末 */ }
    window.__shared = [];
    if (share) Object.defineProperty(navigator, "share", { configurable: true, value: (d) => { window.__shared.push(d); return Promise.resolve(); } });
    else Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
  }, [lang, share]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url);
  await page.waitForFunction(() => /^(字 |\d+ kanji)/.test(document.getElementById("setupInfo").textContent));
  return { ctx, page, errors };
}
const txt = (page, sel) => page.locator(sel).evaluate((el) => el.textContent.trim());
// はじめる前の画面の文（チュートリアルのボタンは段2・題字と説明の2行は日本語のまま〔段1の範囲外〕）
const setupText = (page) => page.evaluate(() => {
  const c = document.getElementById("setup").cloneNode(true);
  c.querySelector("#bTutorial").remove();
  c.querySelector("#langPanel").remove(); // 言語の名前（日本語・English）は、どちらの言語でもそのまま
  return [...c.querySelectorAll("*")].flatMap((e) => [e.getAttribute("aria-label"), e.getAttribute("placeholder"), e.getAttribute("title"), ...[...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent)]).filter(Boolean).join("\n");
});
const howtoText = (page) => page.locator("#howto").evaluate((el) => el.textContent);

test("KJ-127 初めの言語：端末の言語が ja なら日本語・ほかは English・覚えた言語が先", { skip }, async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    for (const [locale, lang, want, head] of [["ja-JP", null, "JP", "はじめる前に選ぶ"], ["en-US", null, "EN", "Choose before you start"], ["fr-FR", null, "EN", "Choose before you start"], ["ja-JP", "en", "EN", "Choose before you start"], ["en-US", "ja", "JP", "はじめる前に選ぶ"]]) {
      const { ctx, page, errors } = await open(browser, base, { locale, lang });
      assert.equal(await txt(page, "#bLang"), want, `${locale} ${lang}`);
      assert.equal(await txt(page, "#setup h2"), head);
      assert.equal(await page.evaluate(() => document.documentElement.lang), want === "JP" ? "ja" : "en");
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally { await browser.close(); srv.close(); }
});

test("KJ-127 切り替え：JP／EN を押すと［日本語］［English］が出る・選ぶと替わって閉じる・端末に覚える（kj-lang）", { skip }, async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    const { ctx, page, errors } = await open(browser, base);
    assert.equal(await page.locator("#langPanel").isHidden(), true, "初めは閉じている");
    assert.equal(await page.locator("#bGear").count(), 1);
    await page.click("#bLang");
    assert.equal(await page.locator("#langPanel").isVisible(), true);
    assert.deepEqual(await page.locator("#langPick label").allTextContents().then((a) => a.map((x) => x.trim())), ["日本語", "English"]);
    assert.equal(await page.locator('#langPick input[value="ja"]').isChecked(), true);
    if (process.env.KJ_SHOT_LANG) await page.screenshot({ path: path.join(process.env.KJ_SHOT_LANG, "setup-ja-open-375x667.png") });
    await page.check('#langPick input[value="en"]');
    assert.equal(await page.locator("#langPanel").isHidden(), true, "選ぶと閉じる");
    assert.equal(await txt(page, "#bLang"), "EN");
    assert.equal(await txt(page, "#setup h2"), "Choose before you start");
    assert.equal(await txt(page, "#start"), "Start");
    assert.equal(await page.evaluate(() => localStorage.getItem("kj-lang")), "en");
    assert.deepEqual(await page.locator("#opp label").allTextContents().then((a) => a.map((x) => x.trim())), ["vs CPU", "vs a friend"]);
    assert.deepEqual(await page.locator("#pow label").allTextContents().then((a) => a.map((x) => x.trim())), ["Very weak", "Normal", "Strong"]);
    assert.deepEqual(await page.locator("#tim label").allTextContents().then((a) => a.map((x) => x.trim())), ["5 min", "10 min"]);
    assert.deepEqual(await page.locator("#lvl label").allTextContents().then((a) => a.map((x) => x.trim())), ["Grade 1", "N5", "N4"]);
    assert.match(await txt(page, "#setupInfo"), /^\d+ kanji, \d+ words; level /);
    assert.equal(await page.locator('#langPick input[value="en"]').isChecked(), true, "再び開くと English が選ばれている");
    if (process.env.KJ_SHOT_LANG) await page.screenshot({ path: path.join(process.env.KJ_SHOT_LANG, "setup-en-375x667.png"), fullPage: true });
    // 選んだ設定（レベル・時間）は言語を替えても変わらない
    await page.check('#lvl input[value="N5"]');
    await page.click("#bLang");
    await page.check('#langPick input[value="ja"]');
    assert.equal(await page.locator('#lvl input[value="N5"]').isChecked(), true);
    assert.equal(await txt(page, "#setup h2"), "はじめる前に選ぶ");
    assert.equal(await page.evaluate(() => localStorage.getItem("kj-lang")), "ja");
    assert.deepEqual(await page.locator("#tim label").allTextContents().then((a) => a.map((x) => x.trim())), ["5分", "10分"]);
    // 覚えた言語で開き直す
    await page.click("#bLang"); await page.check('#langPick input[value="en"]');
    await page.reload();
    await page.waitForFunction(() => /^\d+ kanji/.test(document.getElementById("setupInfo").textContent));
    assert.equal(await txt(page, "#setup h2"), "Choose before you start");
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});

test("KJ-127 English：はじめる前の画面と遊び方の説明（しくみ）に日本語（かな・漢字）が残らない。英字は画面の字体（Zen）で出る", { skip }, async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    const { ctx, page, errors } = await open(browser, base, { locale: "en-US" });
    const vis = async (label) => {
      const t = await setupText(page);
      assert.ok(!KANA.test(t) && !CJK.test(t), `${label}：はじめる前に日本語が残っている：${(t.match(/[\u3040-\u30ff\u3400-\u9fff]+/g) || []).join(" ")}`);
    };
    await vis("CPU戦");
    // 友達と対戦：作る／入る・合言葉の入力
    await page.check('#opp input[value="room"]');
    assert.deepEqual(await page.locator("#act label").allTextContents().then((a) => a.map((x) => x.trim())), ["Create a room", "Join a room"]);
    await vis("友達と対戦");
    await page.check('#act input[value="enter"]');
    assert.equal(await page.locator("#roomCode").getAttribute("placeholder"), "4 digits");
    assert.equal(await txt(page, "#bEnter"), "Join with code");
    assert.equal(await txt(page, "#enterBox .gt"), "If you join, you play at the host's level and time");
    await vis("部屋に入る");
    // 歯車（振動が使えない端末では出ない）。開いた欄も
    await page.evaluate(() => { document.getElementById("bGear").hidden = false; });
    await page.click("#bGear");
    await vis("設定の欄");
    // しくみ
    await page.locator("details summary").first().click();
    const h = await howtoText(page);
    assert.ok(!KANA.test(h), "しくみにかなが残っている：" + (h.match(/[\u3040-\u30ff]+/g) || []).join(" "));
    assert.equal(await page.locator("#howto li").count(), 17);
    assert.equal(await txt(page, "details summary .sm"), "How it works");
    assert.equal(await txt(page, "#again"), "Play again");
    // 画面の字体（Zen）で出る：英字の見出し・説明の最初の字体が KJ Zen
    for (const sel of ["#setup h2", "#start", "#howto li"]) {
      const ff = await page.locator(sel).first().evaluate((e) => getComputedStyle(e).fontFamily);
      assert.match(ff, /^"?KJ Zen"?/, `${sel} の字体：${ff}`);
    }
    assert.equal(await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('400 16px "KJ Zen"', "Choose before you start"); }), true, "英字の字が Zen にある");
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});

// 終わりの画面を出す（tests/shareend.browser.test.mjs と同じ。休日を放って終える）
async function playToEnd(page) {
  await page.check('#opp input[value="cpu"]');
  await page.check('#lvl input[value="N5"]');
  await page.check('#pow input[value="weak"]');
  await page.click("#start");
  await page.evaluate(() => {
    const G = __KJ.game; G.cpuTurn = () => null;
    G.me.cards = [..."休日山川"].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
    G.hinted.push("山川");
    G.log.push({ t: 1, who: G.me.name, op: "放つ", from: [..."十円"], to: [], pts: 3, note: "" });
    G.me.score = 48;
    __KJ.render();
  });
  await page.locator("#meHand .tile", { hasText: "休" }).click();
  await page.locator("#meHand .tile", { hasText: "日" }).click();
  await page.click("#bRelease");
  await page.waitForSelector("#endShow.on");
}

test("KJ-127 English：終わりの画面（見出し・点・+点・見逃した言葉・欄）・msg・戦果の共有の文が English。JP では今のまま", { skip }, async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    for (const lang of ["en", "ja"]) {
      const { ctx, page, errors } = await open(browser, base, { locale: "ja-JP", lang, share: true });
      await playToEnd(page);
      await page.waitForFunction(() => document.getElementById("endShow").dataset.done === "1" || document.querySelectorAll("#esWords .in").length >= 2);
      const lab = await txt(page, "#esLabel"), sc = await txt(page, "#esScore");
      const p = await page.locator("#esWords .p").allTextContents();
      const missed = await txt(page, "#esMissed");
      const msg = await txt(page, "#msg");
      if (lang === "en") {
        assert.ok(["You win!", "You lose...", "Draw"].includes(lab), lab);
        assert.match(sc.replace(/\s+/g, ""), /^\d+vs\d+$/, sc);
        assert.ok(p.length >= 2 && p.every((x) => /^\+\d+ pts$/.test(x)), p.join("|"));
        assert.match(missed, /^Missed word: 山川/);
        assert.ok(!KANA.test(msg) && /You win|You lose|Draw/.test(msg), msg);
        assert.equal(await txt(page, "#bShareEnd"), "Share");
        assert.equal(await txt(page, "#bCopyEnd"), "Copy log");
        // 言葉をタップ：欄（Reading / Meaning / Kotobank）
        await page.locator("#esWords .esw .w").first().click();
        const info = await txt(page, "#endShow .esd");
        assert.match(info, /Kotobank/);
        assert.ok(!KANA.test(info.replace(/Reading: [^\s]*/, "").replace(/Meaning:.*/, "")) || /Reading: /.test(info), info);
        if (process.env.KJ_SHOT_LANG) await page.screenshot({ path: path.join(process.env.KJ_SHOT_LANG, "end-en-375x667.png") });
        // 戦果の共有
        await page.click("#bShareEnd");
        await page.waitForFunction(() => window.__shared.length === 1);
        const s = await page.evaluate(() => window.__shared[0]);
        assert.match(s.text, /^漢対普請瓦版 第.+號 \/ /);
        assert.match(s.text, /(Beat|Lost to|Drew with) CPU \(very weak\) \d+-\d+/);
        assert.match(s.text, /Winning word: '十円' 3 pts \/ \(N5\)\n[^\n]+index\.html\n#漢対普請瓦版 #KanjiDuel$/, s.text);
      } else {
        assert.ok(["勝ち！", "負け…", "引き分け"].includes(lab), lab);
        assert.ok(p.every((x) => /^\+\d+点$/.test(x)), p.join("|"));
        assert.match(missed, /^見逃した言葉：山川/);
        assert.match(msg, /^(勝ち|負け|引き分け)（\d+ 対 \d+）$/);
        assert.equal(await txt(page, "#bShareEnd"), "共有");
        await page.click("#bShareEnd");
        await page.waitForFunction(() => window.__shared.length === 1);
        const s = await page.evaluate(() => window.__shared[0]);
        assert.match(s.text, /#漢対普請瓦版$/);
        assert.ok(!s.text.includes("#KanjiDuel"), "日本語のときはタグ1つ");
        if (process.env.KJ_SHOT_LANG) await page.screenshot({ path: path.join(process.env.KJ_SHOT_LANG, "end-ja-375x667.png") });
      }
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally { await browser.close(); srv.close(); }
});

test("KJ-127 English：はじかれた理由が English（1字は 2+ characters!）", { skip }, async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    const { ctx, page, errors } = await open(browser, base, { lang: "en" });
    await page.check('#opp input[value="cpu"]');
    await page.check('#lvl input[value="N5"]');
    await page.click("#start");
    await page.evaluate(() => { const G = __KJ.game; G.cpuTurn = () => null; G.me.cards = [..."休日山川"].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false })); __KJ.render(); });
    await page.locator("#meHand .tile", { hasText: "休" }).click();
    await page.click("#bRelease", { force: true }); // 1字のときは押せない見え方（aria-disabled）のまま押すと 否 と理由（KJ-117）
    await page.waitForSelector("#nope.on");
    assert.equal(await txt(page, "#nopeWhy"), "2+ characters!");
    await ctx.close();
    const j = await open(browser, base, { lang: "ja" });
    await j.page.check('#opp input[value="cpu"]');
    await j.page.check('#lvl input[value="N5"]');
    await j.page.click("#start");
    await j.page.evaluate(() => { const G = __KJ.game; G.cpuTurn = () => null; G.me.cards = [..."休日山川"].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false })); __KJ.render(); });
    await j.page.locator("#meHand .tile", { hasText: "休" }).click();
    await j.page.click("#bRelease", { force: true });
    await j.page.waitForSelector("#nope.on");
    assert.equal(await txt(j.page, "#nopeWhy"), "2字から！");
    assert.deepEqual(errors, []);
    await j.ctx.close();
  } finally { await browser.close(); srv.close(); }
});
