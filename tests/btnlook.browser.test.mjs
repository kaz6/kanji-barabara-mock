// 卓の操作5つ（Split・Join・Flip・Cycle・Same reading）の押せる／押せないの見え方（KJ-099・KJ-102）：見え方は下線だけ。
// 設定「ボタン」は無い・端末に kj-btn が残っていても（white・outline・line・読めない値）下線・押せる字は明暗差 4.5 以上・押せないは紙の地に墨 .35 の字・Play／Back／Redraw は変わらない・ヒントの光りと待ち時間が見える。
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
try { ({ chromium } = require("playwright")); } catch { /* 入っていない */ }
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
  test(`ボタンは下線（端末の kj-btn＝${look}）：押せる字は明暗差 4.5 以上・押せないは紙の地に墨 0.35 の字・押せる2つ／押せない3つが見分けられる`, { skip }, async () => {
    const srv = await serve(); const browser = await chromium.launch();
    try {
      const url = `http://127.0.0.1:${srv.address().port}/index.html`;
      const { ctx, page, errors } = await open(browser, url, { init: look === null ? {} : { "kj-btn": look } });
      await play(page);
      const PAPER = "rgb(232, 219, 180)", INK = "rgb(42, 38, 34)", TILE = "rgb(246, 238, 214)", ACCENT = "rgb(156, 59, 46)";
      // 何も選ばない：5つとも押せない
      let rows = await snap(page);
      for (const r of rows) {
        assert.equal(r.off, true, `${r.id} 押せない`);
        assert.equal(r.bg, PAPER, `${r.id} 押せない＝紙の地（地を濃くしない）`);
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
      for (const r of off) { assert.equal(r.bg, PAPER); assert.ok(r.ratio < 4.5, `${r.id} 押せない字は薄い（${r.ratio.toFixed(2)}）`); assert.ok(r.ratio < on[0].ratio / 2, "押せると押せないで濃さがはっきり違う"); }
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
      // Play・Back・Redraw は KJ-102 の前と同じ色（Play＝弁柄の地に紙色の字・Back と Redraw は地なし）
      assert.equal(a[0][1], "rgb(122, 58, 47)", "Play の地は KJ-102 の前のまま");
      assert.equal(a[0][0], "bRelease");
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
      await page.evaluate(() => document.getElementById("bCycle").classList.add("hint"));
      const sh = await page.evaluate(() => getComputedStyle(document.getElementById("bCycle")).boxShadow);
      assert.match(sh, /rgb\(217, 154, 0\)/, "ヒントの金の縁が残る（押せる・.lift なし）");
      assert.match(sh, /rgb\(156, 59, 46\) 0px -3px 0px 0px inset/, "下線の形は金の縁と下線が並ぶ");
      await page.evaluate(() => document.getElementById("bCycle").classList.remove("hint"));
      // 待ち時間のゲージ：使ったあと、字は墨でゲージの上で読める。ゲージ（::before）が出る
      await page.evaluate(() => { const G = __KJ.game; G.hint = null; G.me.cards = [..."上天休口辶十日下"].map((ch, i) => ({ id: 9100 + i, c: ch, t: 0, fresh: false })); window.__shift(G); __KJ.render(); });
      await page.locator("#meHand .tile", { hasText: "上" }).first().click();
      await page.click("#bInvert");
      await page.evaluate(() => { const G = __KJ.game; G.me.cd.invert = G.now() + __KJ.data.rules.cooldown_sec.invert / 2; __KJ.render(); });
      await page.waitForTimeout(350);
      const cd = await page.evaluate(() => { const bt = document.getElementById("bInvert"), cs = getComputedStyle(bt), bef = getComputedStyle(bt, "::before"); return { cd: bt.classList.contains("cd"), off: bt.disabled || bt.getAttribute("aria-disabled") === "true", color: cs.color, bg: cs.backgroundColor, gauge: parseFloat(bef.width) > 0, gaugeColor: bef.backgroundColor }; });
      assert.equal(cd.cd, true, "待ち中の印"); assert.equal(cd.off, true, "待ち中は押せない");
      assert.equal(cd.gauge, true, "ゲージが出ている"); assert.notEqual(cd.gaugeColor, "rgba(0, 0, 0, 0)");
      assert.equal(cd.color, "rgb(42, 38, 34)", "待ち中の字は墨（ゲージの上で読める）");
      assert.equal(cd.bg, "rgb(232, 219, 180)", "待ち中の地は紙");
      assert.deepEqual(errors, []);
      await ctx.close();
    } finally { await browser.close(); srv.close(); }
  });
}
