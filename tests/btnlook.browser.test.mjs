// 卓の操作5つ（Split・Join・Flip・Cycle・Same reading）の押せる／押せないの見え方（KJ-099・KJ-102）：見え方は下線だけ。
// 設定「ボタン」は無い・端末に kj-btn が残っていても（white・outline・line・読めない値）下線・押せる字は明暗差 4.5 以上・押せないは札の地に墨 .35 の字（KJ-145：卓の中。卓は無地の濃い地）・Play／Back／Redraw は変わらない・ヒントの光りと待ち時間が見える。
// Playwright の Chromium がないと skip になる。KJ_SHOT_BTN=<フォルダ> を付けると 375px の画像（押せる2つ・押せない3つ）を書く
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
async function open(browser, url, { init = {}, blockStorage = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 }, reducedMotion: "reduce" });
  await ctx.addInitScript(([st, block]) => {
    try {
      if (!sessionStorage.getItem("kjInit")) { sessionStorage.setItem("kjInit", "1"); localStorage.setItem("kj-tutorial", "1"); for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); }
    } catch (e) { /* 読めない端末 */ }
    if (block) { try { Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } }); } catch (e) { /* */ } }
  }, [init, blockStorage]);
  await ctx.addInitScript(() => { window.__shiftSec = 0; window.__shift = (G) => { window.__shiftSec += __KJ.data.rules.hint.timed_sec; G.tick(); }; const pn = performance.now.bind(performance); performance.now = () => pn() + window.__shiftSec * 1000; }); // 時限のヒントを待たずに出す（tests/browser.test.mjs と同じ）
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
  return { ctx, page, errors };
}
async function play(page) {
  await page.check('#opp input[value="cpu"]');
  await page.check('#pow input[value="weak"]');
  await page.click("#start");
  // 「上」を選ぶ：押せるのは Split・Flip・Same reading、押せないのは Join・Cycle（2つ以上ずつ見る）
  await page.evaluate(() => {
    const G = __KJ.game; G.cpuTurn = () => null;
    G.me.cards = [..."上天休口辶十日下"].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
    G.field = [..."山川玉"].map((c, i) => ({ id: 9500 + i, c, t: 0, fresh: false }));
    __KJ.render();
  });
}
const OPS = ["bSplit", "bJoin", "bInvert", "bCycle", "bHomo"];
const SNAP = (ids) => page => page.evaluate((ids) => {
  const rgb = (s) => s.match(/[\d.]+/g).map(Number);
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  return ids.map((id) => {
    const b = document.getElementById(id), cs = getComputedStyle(b);
    const fg = rgb(cs.color), bg = rgb(cs.backgroundColor), a = fg.length > 3 ? fg[3] : 1;
    const mix = [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)); // 薄い字は地と混ぜた色で見る
    const [p, q] = [lum(mix), lum(bg)].sort((m, n) => n - m);
    return { id, off: b.disabled || b.getAttribute("aria-disabled") === "true", color: cs.color, bg: cs.backgroundColor, weight: cs.fontWeight, shadow: cs.boxShadow, ratio: (p + 0.05) / (q + 0.05) };
  });
}, ids);
const snap = (page) => SNAP(OPS)(page);

test("ボタン：設定「ボタン」は無い。localStorage が使えない端末でも下線で動く（data-btn も kj-btn も使わない）", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const url = `http://127.0.0.1:${srv.address().port}/index.html`;
    const { ctx, page, errors } = await open(browser, url);
    assert.equal(await page.$("#btn"), null, "設定の「ボタン」の行は無い");
    assert.equal(await page.$("#btnLabel"), null);
    assert.equal(await page.$("#grpBtn"), null);
    assert.equal(await page.evaluate(() => document.documentElement.hasAttribute("data-btn")), false, "data-btn は付けない");
    assert.equal(await page.evaluate(() => localStorage.getItem("kj-btn")), null, "kj-btn は書かない");
    assert.deepEqual(errors, []);
    await ctx.close();
    const n = await open(browser, url, { blockStorage: true });
    assert.deepEqual(n.errors, []);
    assert.equal(await n.page.$("#btn"), null, "localStorage が使えなくても設定の行は無い");
    assert.equal(await n.page.evaluate(() => document.documentElement.hasAttribute("data-btn")), false);
    await n.ctx.close();
  } finally { await browser.close(); srv.close(); }
});

// 端末に残る kj-btn：なし／白抜きの名残（white・outline）／下線（line）／読めない値。どれでも下線
for (const look of [null, "white", "outline", "line", "zzz"]) {
  test(`ボタンは下線（端末の kj-btn＝${look}）：押せる字は明暗差 4.5 以上・押せないは札の地に墨 0.35 の字・押せる2つ／押せない3つが見分けられる`, { skip }, async () => {
    const srv = await serve(); const browser = await chromium.launch();
    try {
      const url = `http://127.0.0.1:${srv.address().port}/index.html`;
      const { ctx, page, errors } = await open(browser, url, { init: look === null ? {} : { "kj-btn": look } });
      await play(page);
      const INK = "rgb(42, 38, 34)", TILE = "rgb(246, 238, 214)", ACCENT = "rgb(156, 59, 46)";
      // 何も選ばない：5つとも押せない
      let rows = await snap(page);
      for (const r of rows) {
        assert.equal(r.off, true, `${r.id} 押せない`);
        assert.equal(r.bg, TILE, `${r.id} 押せない＝札の地（KJ-145：卓の中は札の地）`);
        assert.equal(r.color, "rgba(42, 38, 34, 0.35)", `${r.id} 押せない＝墨の不透明度 0.35 の字`);
        assert.ok(Number(r.weight) < 600, `${r.id} 押せない＝太字にしない`);
        assert.equal(r.shadow, "none", `${r.id} 押せない＝下線なし`);
      }
      // 上 を選ぶ：Flip・Cycle（と Same reading があれば）が押せる
      await page.locator("#meHand .tile", { hasText: "上" }).first().click();
      rows = await snap(page);
      const on = rows.filter((r) => !r.off), off = rows.filter((r) => r.off);
      assert.ok(on.length >= 2 && off.length >= 2, `押せる ${on.map((r) => r.id)}・押せない ${off.map((r) => r.id)}`);
      for (const r of on) {
        assert.ok(r.ratio >= 4.5, `${look} ${r.id} 押せる字と地の明暗差 4.5 以上（${r.ratio.toFixed(2)}）`);
        assert.ok(Number(r.weight) >= 700, `${r.id} 押せる＝太字`);
        { assert.equal(r.bg, TILE, `${r.id} 下線：札の色の地`); assert.equal(r.color, INK, `${r.id} 下線：墨の字`); assert.match(r.shadow, new RegExp(`${ACCENT.replace(/[()]/g, "\\$&")} 0px -3px 0px 0px inset`), `${r.id} 下線：弁柄の 3px の下線`); }
      }
      for (const r of off) { assert.equal(r.bg, TILE); assert.ok(r.ratio < 4.5, `${r.id} 押せない字は薄い（${r.ratio.toFixed(2)}）`); assert.ok(r.ratio < on[0].ratio / 2, "押せると押せないで濃さがはっきり違う"); }
      if (process.env.KJ_SHOT_BTN) await page.locator(".table .ops").first().screenshot({ path: path.join(process.env.KJ_SHOT_BTN, `kj-102-375.png`) });
      if (process.env.KJ_SHOT_BTN) await page.screenshot({ path: path.join(process.env.KJ_SHOT_BTN, `kj-102-375-full.png`) });
      assert.deepEqual(errors, []);
      await ctx.close();
    } finally { await browser.close(); srv.close(); }
  });

  test(`ボタンは下線（端末の kj-btn＝${look}）：Play・Back・Redraw は今のまま。ヒントの光りと待ち時間のゲージは見える`, { skip }, async () => {
    const srv = await serve(); const browser = await chromium.launch();
    try {
      const url = `http://127.0.0.1:${srv.address().port}/index.html`;
      const { ctx, page, errors } = await open(browser, url, { init: look === null ? {} : { "kj-btn": look } });
      await play(page);
      const others = () => page.evaluate(() => ["bRelease", "bBack", "bRedraw"].map((id) => { const c = getComputedStyle(document.getElementById(id)); return [id, c.backgroundColor, c.color, c.fontWeight]; }));
      const a = await others();
      // Play・Back・Redraw は KJ-102 の前と同じ（地・字の色・太さ。Play は押せない見え方のとき）
      assert.deepEqual(a, [["bRelease", "rgb(246, 238, 214)", "rgba(42, 38, 34, 0.35)", "400"], ["bBack", "rgba(0, 0, 0, 0)", "rgb(98, 90, 80)", "400"], ["bRedraw", "rgba(0, 0, 0, 0)", "rgb(42, 38, 34)", "400"]]); // KJ-117：Play の押せないは札の地・墨 0.35 の字（操作5つと同じ考え）
      // KJ-115：Back は押せないとき下線なし・押せるとき操作5つと同じ弁柄の下線（Redraw に下線は無い）
      const bs = () => page.evaluate(() => ["bBack", "bRedraw"].map((id) => getComputedStyle(document.getElementById(id)).boxShadow));
      assert.equal(await page.evaluate(() => document.getElementById("bBack").disabled), true);
      assert.deepEqual(await bs(), ["none", "none"], "Back が押せない：下線なし");
      await page.locator("#meHand .tile", { hasText: "上" }).first().click();
      assert.equal(await page.evaluate(() => document.getElementById("bBack").disabled), false);
      const on = await bs();
      assert.match(on[0], /rgb\(156, 59, 46\) 0px -3px 0px 0px inset/, "Back が押せる：弁柄の 3px の下線");
      assert.equal(on[1], "none", "Redraw に下線は足さない");
      if (process.env.KJ_SHOT_BTN) await page.screenshot({ path: path.join(process.env.KJ_SHOT_BTN, "kj-115-back-line.png") });
      await page.click("#bBack");
      assert.equal((await bs())[0], "none", "Back を押して台が空になる：下線が消える");
      // ヒントの光り：押せない Split も、押せる Flip も、薄い金の地・墨の字・縁の光り
      await page.evaluate(() => { const G = __KJ.game; G.hint = null; G.me.cards = [..."日分"].map((ch, i) => ({ id: 7200 + i, c: ch, t: 0, fresh: false })); window.__shift(G); __KJ.render(); });
      assert.equal(await page.evaluate(() => __KJ.game.hintActive().button), "bSplit");
      const hint = await page.evaluate(() => { const c = getComputedStyle(document.getElementById("bSplit")); return { bg: c.backgroundColor, color: c.color, shadow: c.boxShadow, cls: document.getElementById("bSplit").className }; });
      assert.equal(hint.bg, "rgb(255, 241, 196)", "ヒントの光りは薄い金の地");
      assert.equal(hint.color, "rgb(42, 38, 34)", "字は墨");
      assert.match(hint.cls, /hint/);
      // 金の縁：動きを減らす設定（この試験は reduce）では縁だけが光りになる。押せない Split にも、押せる Cycle（.lift なし＝チュートリアルの「ここを押す」）にも残る
      assert.match(hint.shadow, /rgb\(217, 154, 0\)/, "ヒントの金の縁が残る（押せない）");
      await page.locator("#meHand .tile", { hasText: "日" }).first().click();
      // 印を付けるのと読むのを同じ evaluate（同期）でやる：別々だと、間に画面の再描画〔renderOps が class を組み直す〕が入って hint が消え、金の縁が読めない揺れになる（KJ-121）
      const sh = await page.evaluate(() => { const b = document.getElementById("bCycle"); b.classList.add("hint"); const v = getComputedStyle(b).boxShadow; b.classList.remove("hint"); return v; });
      assert.match(sh, /rgb\(217, 154, 0\)/, "ヒントの金の縁が残る（押せる・.lift なし）");
      assert.match(sh, /rgb\(156, 59, 46\) 0px -3px 0px 0px inset/, "下線の形は金の縁と下線が並ぶ");
      // 待ち時間のゲージ：使ったあと、字は墨でゲージの上で読める。ゲージ（::before）が出る
      await page.evaluate(() => { const G = __KJ.game; G.hint = null; G.me.cards = [..."上天休口辶十日下"].map((ch, i) => ({ id: 9100 + i, c: ch, t: 0, fresh: false })); window.__shift(G); __KJ.render(); });
      await page.locator("#meHand .tile", { hasText: "上" }).first().click();
      await page.click("#bInvert");
      await page.evaluate(() => { const G = __KJ.game; G.me.cd.invert = G.now() + __KJ.data.rules.cooldown_sec.invert / 2; __KJ.render(); });
      await page.waitForTimeout(350);
      const cd = await page.evaluate(() => { const bt = document.getElementById("bInvert"), cs = getComputedStyle(bt), bef = getComputedStyle(bt, "::before"); return { cd: bt.classList.contains("cd"), off: bt.disabled || bt.getAttribute("aria-disabled") === "true", color: cs.color, bg: cs.backgroundColor, gauge: parseFloat(bef.width) > 0, gaugeColor: bef.backgroundColor }; });
      assert.equal(cd.cd, true, "待ち中の印"); assert.equal(cd.off, true, "待ち中は押せない");
      assert.equal(cd.gauge, true, "ゲージが出ている"); assert.notEqual(cd.gaugeColor, "rgba(0, 0, 0, 0)"); assert.equal(cd.gaugeColor, "rgb(68, 112, 90)", "待ち時間のゲージは緑のまま（KJ-115）");
      assert.equal(cd.color, "rgb(42, 38, 34)", "待ち中の字は墨（ゲージの上で読める）");
      assert.equal(cd.bg, "rgb(246, 238, 214)", "待ち中の地は札の色（KJ-145）");
      assert.deepEqual(errors, []);
      await ctx.close();
    } finally { await browser.close(); srv.close(); }
  });
}

// KJ-117：Play の押せる／押せない。押せない＝札の地・墨の枠・墨 0.35 の字。押せる＝弁柄の地。台が1枚のときは押せない見え方で、押すと 否 と「1字では放てない」
test("Play：0枚・1枚は押せない見え方（札の地・墨 0.35）、1枚で押すと 否 と理由が出る、2枚で放てる並びは弁柄の地", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const url = `http://127.0.0.1:${srv.address().port}/index.html`;
    const { ctx, page, errors } = await open(browser, url);
    await play(page);
    await page.evaluate(() => { const G = __KJ.game; G.me.cards = [..."日本上下山川口木"].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false })); __KJ.render(); });
    const look = () => page.evaluate(() => { const b = document.getElementById("bRelease"), c = getComputedStyle(b); return { bg: c.backgroundColor, color: c.color, weight: c.fontWeight, off: b.disabled || b.getAttribute("aria-disabled") === "true", aria: b.getAttribute("aria-disabled"), dis: b.disabled }; });
    const OFF = { bg: "rgb(246, 238, 214)", color: "rgba(42, 38, 34, 0.35)", weight: "400" };
    const shot = (n) => process.env.KJ_SHOT_BTN ? page.screenshot({ path: path.join(process.env.KJ_SHOT_BTN, `kj-117-${n}.png`) }) : null;
    let l = await look();
    assert.deepEqual({ bg: l.bg, color: l.color, weight: l.weight }, OFF, "台が0枚：押せない見え方"); assert.equal(l.off, true);
    await shot("0");
    await page.locator("#meHand .tile", { hasText: "日" }).first().click();
    l = await look();
    assert.deepEqual({ bg: l.bg, color: l.color, weight: l.weight }, OFF, "台が1枚：押せない見え方（弁柄の地にしない・光らない）");
    assert.equal(l.aria, "true"); assert.equal(l.dis, false, "押すと理由を出すので disabled にはしない");
    await shot("1");
    await page.click("#bRelease", { force: true }); // aria-disabled は Playwright が「押せない」とみなす
    await page.waitForSelector("#nope.on");
    assert.equal(await page.textContent("#nopeWhy"), "2字から！", "今までどおり：1字では放てない（rejectText の言い方）");
    await page.evaluate(() => { const G = __KJ.game; G.me.cards = [..."日本上下山川口木"].map((c, i) => ({ id: 9100 + i, c, t: 0, fresh: false })); __KJ.render(); });
    await page.evaluate(() => document.getElementById("bBack").click());
    await page.locator("#meHand .tile", { hasText: "日" }).first().click();
    await page.locator("#meHand .tile", { hasText: "本" }).first().click();
    l = await look();
    assert.equal(l.off, false, "日本：放てる並びは押せる");
    assert.equal(l.bg, "rgb(156, 59, 46)", "押せる＝弁柄の地"); assert.equal(l.weight, "700");
    await shot("2");
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});

// KJ-145：卓に無地の濃い地（--table-ground）を敷く。背景の記事が透けない・卓の字は地に対して 4.5 以上・押せないボタン（札の地）と卓の地が見分けられる
test("卓の地：不透明な --table-ground・紙より濃い・卓の中の字は読める・押せないボタンの札の地と見分けられる・ヒントとゲージが見える", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const url = `http://127.0.0.1:${srv.address().port}/index.html`;
    const { ctx, page, errors } = await open(browser, url);
    await play(page);
    const m = await page.evaluate(() => {
      const rgb = (s) => s.match(/[\d.]+/g).map(Number);
      const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
      const ratio = (a, b) => { const [p, q] = [lum(a), lum(b)].sort((x, y) => y - x); return (p + 0.05) / (q + 0.05); };
      const t = document.querySelector(".table"), ts = getComputedStyle(t);
      const ground = rgb(ts.backgroundColor), paper = rgb(getComputedStyle(document.body).backgroundColor), tile = rgb("rgb(246, 238, 214)");
      const decl = getComputedStyle(document.documentElement).getPropertyValue("--table-ground").trim();
      const text = (el) => { const c = rgb(getComputedStyle(el).color); const a = c.length > 3 ? c[3] : 1; return [0, 1, 2].map((i) => c[i] * a + ground[i] * (1 - a)); };
      document.querySelector(".info").innerHTML = '<span class="no">（1字では放てない）</span>';
      const heads = [...t.querySelectorAll(".side-head b, .side-head, .info .no")].filter((e) => e.textContent.trim()).map((e) => ({ t: e.textContent.trim().slice(0, 6), r: ratio(text(e), ground) }));
      return { bg: ts.backgroundColor, decl, groundTile: ratio(ground, tile), groundPaper: ratio(ground, paper), heads };
    });
    assert.equal(m.decl.toLowerCase(), "#d3c391", "色は --table-ground の1か所");
    assert.equal(m.bg, "rgb(211, 195, 145)", "卓の地は不透明（背景の記事が透けない）");
    assert.ok(m.heads.length > 0);
    for (const h of m.heads) assert.ok(h.r >= 4.5, `卓の中の字「${h.t}」は卓の地に対して 4.5 以上（${h.r.toFixed(2)}）`);
    assert.ok(m.groundTile > 1.2, `卓の地と札の地が見分けられる（${m.groundTile.toFixed(2)}）`);
    console.log(`# KJ-145 明暗差：卓の地/札の地 ${m.groundTile.toFixed(2)}・卓の地/紙 ${m.groundPaper.toFixed(2)}・字 ${m.heads.map((h) => h.r.toFixed(1)).join("/")}`);
    // 卓の中のボタンは押せる／押せない（台が空）どちらも札の地。Play は押せないとき札の地・押せるとき弁柄
    const bgs = await page.evaluate(() => ["bSplit", "bJoin", "bInvert", "bCycle", "bHomo", "bRelease"].map((id) => [id, getComputedStyle(document.getElementById(id)).backgroundColor]));
    for (const [id, bg] of bgs) assert.equal(bg, "rgb(246, 238, 214)", `${id} 押せない＝札の地`);
    // 卓の外（Back・Redraw・手札の行）は変えない
    const outside = await page.evaluate(() => ["bBack", "bRedraw"].map((id) => getComputedStyle(document.getElementById(id)).backgroundColor));
    assert.deepEqual(outside, ["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)"]);
    if (process.env.KJ_SHOT_BTN) await page.screenshot({ path: path.join(process.env.KJ_SHOT_BTN, "kj-145-empty-375.png") });
    await page.evaluate(() => { const G = __KJ.game; G.me.cards = [..."日本上下山川口木"].map((c, i) => ({ id: 9300 + i, c, t: 0, fresh: false })); __KJ.render(); });
    await page.locator("#meHand .tile", { hasText: "日" }).first().click();
    await page.locator("#meHand .tile", { hasText: "本" }).first().click();
    const on = await page.evaluate(() => { const b = document.getElementById("bRelease"); return { off: b.disabled || b.getAttribute("aria-disabled") === "true", bg: getComputedStyle(b).backgroundColor }; });
    assert.equal(on.off, false); assert.equal(on.bg, "rgb(156, 59, 46)", "押せる Play は弁柄の地のまま");
    if (process.env.KJ_SHOT_BTN) await page.screenshot({ path: path.join(process.env.KJ_SHOT_BTN, "kj-145-two-375.png") });
    // ヒントの光り：卓の濃い地の上でも金の縁と薄い金の地が出る
    await page.evaluate(() => { const G = __KJ.game; G.hint = null; G.me.cards = [..."日分"].map((ch, i) => ({ id: 7300 + i, c: ch, t: 0, fresh: false })); window.__shift(G); __KJ.render(); });
    const h = await page.evaluate(() => { const c = getComputedStyle(document.getElementById("bSplit")); return { bg: c.backgroundColor, shadow: c.boxShadow }; });
    assert.equal(h.bg, "rgb(255, 241, 196)"); assert.match(h.shadow, /rgb\(217, 154, 0\)/);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});
