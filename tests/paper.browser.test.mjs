// 新聞紙風の見た目（KJ-093）：色・字体・罫線・表紙（題字・号数・日付）・札の字の切り替え。Playwright の Chromium がないと skip になる
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
// seen＝チュートリアルを見た印（kj-tutorial）を付けるか。init＝ほかの localStorage（最初の1回だけ）
async function open(browser, url, { vp = { width: 375, height: 800 }, seen = true, init = {} } = {}) {
  const ctx = await browser.newContext({ viewport: vp, reducedMotion: "reduce" });
  await ctx.addInitScript(([s, st]) => {
    try {
      if (!sessionStorage.getItem("kjInit")) { sessionStorage.setItem("kjInit", "1"); if (s) localStorage.setItem("kj-tutorial", "1"); for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); }
    } catch (e) { /* 読めない端末 */ }
  }, [seen, init]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
  return { ctx, page, errors };
}
async function play(page, chars = "天上休口辶十日下") {
  await page.check('#opp input[value="cpu"]');
  await page.check('#pow input[value="weak"]');
  await page.click("#start");
  await page.evaluate((cs) => {
    const G = __KJ.game; G.cpuTurn = () => null;
    G.me.cards = [...cs].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
    G.field = [..."山川玉"].map((c, i) => ({ id: 9500 + i, c, t: 0, fresh: false }));
    __KJ.render();
  }, chars);
}
// 文字色と、地の色（上へたどって透明でない最初の背景）の明暗差
const CONTRAST = `(function(){
  const rgb=s=>{const m=/rgba?\\(([^)]+)\\)/.exec(s);const p=m[1].split(",").map(Number);return{r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}};
  const lin=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};
  const lum=c=>.2126*lin(c.r)+.7152*lin(c.g)+.0722*lin(c.b);
  const bgOf=e=>{for(let x=e;x;x=x.parentElement){const c=rgb(getComputedStyle(x).backgroundColor);if(c.a>0.5)return c}return rgb(getComputedStyle(document.body).backgroundColor)};
  window.__ratio=e=>{const f=rgb(getComputedStyle(e).color),b=bgOf(e);const a=lum(f),c=lum(b);return (Math.max(a,c)+.05)/(Math.min(a,c)+.05)};
})()`;
const ratio = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; return window.__ratio(e); }, sel);

test("表紙：題字「漢対普請瓦版」（ルビ・英字の副題つき。KJ-109）を二重罫線で挟み、すぐ下の行に 第○號（左）・今日の日付（中）。見出し #title は無い。試合の画面には出ない", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const url = `http://127.0.0.1:${srv.address().port}/index.html`;
    const { ctx, page, errors } = await open(browser, url);
    // KJ-109：題字・ルビ・英字の副題は同じ枠（#mastName）の中の3行。文は js/strings.js の TEXT 1か所
    assert.equal((await page.textContent("#mastMain")).trim(), "漢対普請瓦版");
    assert.equal((await page.textContent("#mastRuby")).trim(), "かんたいふしんかわらばん");
    assert.equal((await page.textContent("#mastSub")).trim(), "Split & Join — a Kanji Duel");
    assert.equal(await page.evaluate(() => window.KJ_STR.TEXT.masthead), "漢対普請瓦版", "題は TEXT.masthead の1か所");
    assert.equal(await page.evaluate(() => [window.KJ_STR.TEXT.mastheadRuby, window.KJ_STR.TEXT.mastheadSub].join("|")), "かんたいふしんかわらばん|Split & Join — a Kanji Duel");
    assert.equal((await page.textContent("#mastTitle")).replace(/\s+/g, ""), "かんたいふしんかわらばん漢対普請瓦版Split&Join—aKanjiDuel", "枠の中の字は題字・ルビ・副題だけ");
    assert.equal(await page.locator("#title").count(), 0, "見出し「漢字版（仮）」（#title）は消した");
    assert.ok((await page.textContent("#lead")).trim().length > 0, "説明文（#lead）は残す");
    assert.equal(await page.title(), "漢対普請瓦版 — Split & Join");
    const rows = await page.evaluate(() => { const r = (id) => document.getElementById(id).getBoundingClientRect(); const f = (id) => parseFloat(getComputedStyle(document.getElementById(id)).fontSize); return { ruby: r("mastRuby"), main: r("mastMain"), sub: r("mastSub"), name: r("mastName"), fr: f("mastRuby"), fm: f("mastMain"), fs: f("mastSub") }; });
    assert.ok(rows.ruby.bottom <= rows.main.top + 1 && rows.main.bottom <= rows.sub.top + 1, "上からルビ・題字・副題の順（重ならない）");
    assert.ok(rows.ruby.top >= rows.name.top && rows.sub.bottom <= rows.name.bottom, "3行とも同じ枠の中");
    assert.equal(rows.fr, 9, "ルビは9px");
    assert.equal(rows.fs, 11, "副題は11px");
    assert.ok(rows.fm >= 24, "題字は大きいまま");
    assert.equal(await page.textContent("#mastNo"), "第壱號");
    // KJ-124：號数の太さ・字体は説明の1行目（#lead）と同じ。大きさ（13px）は変えない
    const wt = await page.evaluate(() => { const g = (id) => getComputedStyle(document.getElementById(id)); return { no: g("mastNo").fontWeight, lead: g("lead").fontWeight, noFam: g("mastNo").fontFamily, leadFam: g("lead").fontFamily, size: g("mastNo").fontSize }; });
    assert.equal(wt.no, wt.lead, "號数の font-weight は説明の1行目と同じ");
    assert.ok(wt.noFam.startsWith('"KJ Kaisei"') && wt.leadFam.startsWith('"KJ Kaisei"'), "字体も同じ（大正風）");
    assert.equal(wt.size, "13px", "大きさは変えない");
    const date = await page.textContent("#mastDate");
    assert.match(date, /^[〇一二三四五六七八九]{4}年[一二三四五六七八九十]+月[一二三四五六七八九十]+日$/);
    const today = await page.evaluate(() => KJ.kansujiDate(new Date()));
    assert.equal(date, today, "今日の日付");
    const st = await page.evaluate(() => {
      const t = getComputedStyle(document.getElementById("mastTitle")), l = getComputedStyle(document.querySelector(".mast-line"));
      const r = (id) => document.getElementById(id).getBoundingClientRect();
      const title = r("mastTitle"), no = r("mastNo"), dt = r("mastDate");
      return { tt: t.borderTopStyle, tb: t.borderBottomStyle, tl: t.borderLeftStyle, tr: t.borderRightStyle, lb: l.borderBottomStyle, below: no.top >= title.bottom - 1, noLeft: no.left < innerWidth / 3, dtMid: Math.abs((dt.left + dt.right) / 2 - innerWidth / 2) < 6, vis: document.getElementById("mast").offsetParent !== null };
    });
    assert.deepEqual(st, { tt: "double", tb: "double", tl: "double", tr: "double", lb: "double", below: true, noLeft: true, dtMid: true, vis: true }, "題字の枠（四方）・号数の行の下が二重罫線／号数は左・日付は中／題字の下の行");
    await play(page);
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("mast")).display), "none", "試合の画面には題字を出さない");
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});

test("表紙の絵柄（KJ-095）：題字の枠の後ろに昇る弁柄の日と放射18本。題字は札の色の地・墨の枠で放射の上。表紙だけ。375／320px で収まる", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const url = `http://127.0.0.1:${srv.address().port}/index.html`;
    for (const w of [375, 320]) {
      const { ctx, page, errors } = await open(browser, url, { vp: { width: w, height: 700 } });
      const st = await page.evaluate(() => {
        const box = document.getElementById("mastTitle"), svg = box.querySelector("svg.mast-sun"), name = document.querySelector(".mast-name span");
        const bs = getComputedStyle(box), ns = getComputedStyle(name), b = box.getBoundingClientRect(), n = name.getBoundingClientRect();
        const rays = [...svg.querySelectorAll("g path")], sun = svg.querySelector("circle");
        const sr = svg.getBoundingClientRect();
        return {
          rays: rays.length, rayFill: svg.querySelector("g").getAttribute("fill"), rayOp: svg.querySelector("g").getAttribute("fill-opacity"),
          sunFill: sun.getAttribute("fill"), sunCx: sun.getAttribute("cx"), svgInBox: sr.left >= b.left - 1 && sr.right <= b.right + 1 && sr.top >= b.top - 1 && sr.bottom <= b.bottom + 1,
          boxBg: bs.backgroundColor, nameBg: ns.backgroundColor, nameBorder: ns.borderTopStyle + " " + ns.borderTopWidth + " " + ns.borderTopColor,
          nameInside: n.left >= b.left && n.right <= b.right,
          noHScroll: document.documentElement.scrollWidth <= innerWidth, overflow: bs.overflow,
          aria: svg.getAttribute("aria-hidden"),
        };
      });
      assert.deepEqual(st, { rays: 18, rayFill: "#9c3b2e", rayOp: ".85", sunFill: "#9c3b2e", sunCx: "181", svgInBox: true, boxBg: "rgb(246, 238, 214)", nameBg: "rgb(246, 238, 214)", nameBorder: "solid 2px rgb(42, 38, 34)", nameInside: true, noHScroll: true, overflow: "hidden", aria: "true" }, `${w}px：日と放射と題字の枠`);
      // 題字が放射の上に重なっている（題字の中心の点で最前面が題字）
      const top = await page.evaluate(() => { const nm = document.querySelector(".mast-name"), sv = document.querySelector(".mast-sun"); return { z: getComputedStyle(nm).zIndex, pos: getComputedStyle(nm).position, after: !!(sv.compareDocumentPosition(nm) & Node.DOCUMENT_POSITION_FOLLOWING), svgPe: getComputedStyle(sv).pointerEvents }; });
      assert.deepEqual(top, { z: "1", pos: "absolute", after: true, svgPe: "none" }, `${w}px：題字は放射の上（z-index・DOM の順）`);
      await play(page);
      assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("mast")).display), "none", "試合の画面には絵柄を出さない");
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally { await browser.close(); srv.close(); }
});

test("表紙の題字（KJ-109）：412／375／320px で、題字・ルビ・副題が枠の中に収まり、枠は絵柄の箱からはみ出さない", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const url = `http://127.0.0.1:${srv.address().port}/index.html`;
    for (const w of [412, 375, 320]) {
      const { ctx, page, errors } = await open(browser, url, { vp: { width: w, height: 780 } });
      const st = await page.evaluate(() => {
        const r = (e) => e.getBoundingClientRect(), g = (id) => document.getElementById(id);
        const box = r(g("mastTitle")), name = r(g("mastName"));
        const inName = ["mastRuby", "mastMain", "mastSub"].every((id) => { const x = r(g(id)); return x.left >= name.left && x.right <= name.right && x.top >= name.top && x.bottom <= name.bottom; });
        return { nameInBox: name.left >= box.left && name.right <= box.right && name.top >= box.top && name.bottom <= box.bottom, inName, noHScroll: document.documentElement.scrollWidth <= innerWidth, nameW: Math.round(name.width), boxW: Math.round(box.width) };
      });
      assert.equal(st.nameInBox, true, `${w}px：題字の枠が箱の中 ${JSON.stringify(st)}`);
      assert.equal(st.inName, true, `${w}px：3行とも枠の中`);
      assert.equal(st.noHScroll, true, `${w}px：横にはみ出さない`);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally { await browser.close(); srv.close(); }
});

test("号数：試合を始めるたびに増え、端末に覚える。読めなければ 第壱號。チュートリアルは数えない", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const url = `http://127.0.0.1:${srv.address().port}/index.html`;
    const { ctx, page, errors } = await open(browser, url);
    assert.equal(await page.textContent("#mastNo"), "第壱號");
    await play(page);
    assert.equal(await page.evaluate(() => localStorage.getItem("kj-issue")), "1", "始めたら 1 試合");
    await page.click("#bSetup");
    assert.equal(await page.textContent("#mastNo"), "第弐號");
    await page.click("#start");
    await page.click("#bSetup");
    assert.equal(await page.textContent("#mastNo"), "第参號");
    assert.equal(await page.evaluate(() => localStorage.getItem("kj-issue")), "2");
    await page.click("#start");
    await page.click("#again"); // もう一度も 1 試合
    assert.equal(await page.evaluate(() => localStorage.getItem("kj-issue")), "4");
    await page.reload();
    await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
    assert.equal(await page.textContent("#mastNo"), "第伍號", "ページを開き直しても覚えている");
    await ctx.close();
    // 読めない値・負の値
    for (const bad of ["abc", "-4", ""]) {
      const o = await open(browser, url, { init: { "kj-issue": bad } });
      assert.equal(await o.page.textContent("#mastNo"), "第壱號", `kj-issue=${JSON.stringify(bad)}`);
      assert.deepEqual(o.errors, []);
      await o.ctx.close();
    }
    // チュートリアル（はじめて「はじめる」を押した人）は数えない
    const t = await open(browser, url, { seen: false });
    await t.page.click("#start");
    await t.page.waitForSelector("#tut:not([hidden])");
    assert.equal(await t.page.evaluate(() => localStorage.getItem("kj-issue")), null, "チュートリアルでは数えない");
    await t.ctx.close();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); srv.close(); }
});

test("札の字：初期は大正風（Kaisei Tokumin）。「明朝」にすると Shippori Mincho になり、端末に覚える。画面の字と特別な語の演出は変わらない", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const url = `http://127.0.0.1:${srv.address().port}/index.html`;
    const { ctx, page, errors } = await open(browser, url);
    const face = () => page.evaluate(() => ({ attr: document.documentElement.getAttribute("data-face"), kanji: getComputedStyle(document.documentElement).getPropertyValue("--kanji").trim().split(",")[0], checked: document.querySelector('#face input:checked').value, label: document.getElementById("faceLabel").textContent }));
    assert.deepEqual(await face(), { attr: "taisho", kanji: '"KJ Kaisei"', checked: "taisho", label: "札の字" });
    assert.deepEqual(await page.$$eval("#face label", (a) => a.map((x) => x.textContent.trim())), ["大正風", "明朝"]);
    await play(page);
    const fam = () => page.evaluate(() => ({ tile: getComputedStyle(document.querySelector("#meHand .tile")).fontFamily.split(",")[0], field: getComputedStyle(document.querySelector("#field .tile")).fontFamily.split(",")[0], body: getComputedStyle(document.body).fontFamily.split(",")[0], btn: getComputedStyle(document.getElementById("bSplit")).fontFamily.split(",")[0] }));
    let f = await fam();
    assert.equal(f.tile, '"KJ Kaisei"'); assert.equal(f.field, '"KJ Kaisei"'); assert.equal(f.body, '"KJ Zen"'); assert.equal(f.btn, '"KJ Zen"');
    // 字体が実際に読み込まれる
    const loaded = await page.evaluate(async () => { await document.fonts.load('16px "KJ Kaisei"', "天上"); await document.fonts.load('16px "KJ Zen"', "Play"); return { kai: document.fonts.check('16px "KJ Kaisei"', "天上"), zen: document.fonts.check('16px "KJ Zen"', "Play") }; });
    assert.deepEqual(loaded, { kai: true, zen: true });
    await page.click("#bSetup");
    await page.check('#face input[value="mincho"]');
    assert.deepEqual(await face(), { attr: "mincho", kanji: '"KJ Shippori"', checked: "mincho", label: "札の字" });
    assert.equal(await page.evaluate(() => localStorage.getItem("kj-face")), "mincho");
    await page.click("#start");
    await page.evaluate(() => { const G = __KJ.game; G.cpuTurn = () => null; __KJ.render(); });
    f = await fam();
    assert.equal(f.tile, '"KJ Shippori"', "明朝：札の字が替わる"); assert.equal(f.field, '"KJ Shippori"'); assert.equal(f.body, '"KJ Zen"', "画面の字は変わらない"); assert.equal(f.btn, '"KJ Zen"');
    assert.equal(await page.evaluate(async () => { await document.fonts.load('16px "KJ Shippori"', "天上"); return document.fonts.check('16px "KJ Shippori"', "天上"); }), true);
    // 特別な語の演出（kj-fx）は今のまま
    assert.match(await page.evaluate(() => { const c = document.createElement("div"); c.id = "fx"; const d = document.createElement("div"); d.className = "c"; c.appendChild(d); document.body.appendChild(c); const ff = getComputedStyle(d).fontFamily; c.remove(); return ff; }), /^"KJ Fx"/);
    await page.reload();
    await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
    assert.deepEqual(await face(), { attr: "mincho", kanji: '"KJ Shippori"', checked: "mincho", label: "札の字" }, "開き直しても明朝");
    await page.check('#face input[value="taisho"]');
    assert.equal(await page.evaluate(() => localStorage.getItem("kj-face")), "taisho");
    assert.deepEqual(errors, []);
    await ctx.close();
    // 読めない値は大正風
    const o = await open(browser, url, { init: { "kj-face": "zzz" } });
    assert.equal(await o.page.evaluate(() => document.documentElement.getAttribute("data-face")), "taisho");
    await o.ctx.close();
  } finally { await browser.close(); srv.close(); }
});

test("色：紙・札・墨・弁柄。字と地の明暗差は 4.5 以上（表紙・設定・試合・選んだ札・部品の札・操作・Play）", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const url = `http://127.0.0.1:${srv.address().port}/index.html`;
    const { ctx, page, errors } = await open(browser, url);
    await page.evaluate(CONTRAST);
    const root = await page.evaluate(() => { const c = getComputedStyle(document.documentElement); return Object.fromEntries(["--bg", "--tile", "--ink", "--accent", "--sub", "--line"].map((k) => [k, c.getPropertyValue(k).trim()])); });
    assert.deepEqual(root, { "--bg": "#e8dbb4", "--tile": "#f6eed6", "--ink": "#2a2622", "--accent": "#9c3b2e", "--sub": "#625a50", "--line": "#a0957b" });
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(232, 219, 180)");
    // 表紙
    for (const sel of ["#mastTitle", "#mastName", "#mastRuby", "#mastMain", "#mastSub", "#mastNo", "#mastDate", "#lead", ".setup .gt", "#setupInfo", '#opp label:not(:has(input:checked))', "#opp label:has(input:checked)", "#start", "#bTutorial", "#face label:not(:has(input:checked))", "#face label:has(input:checked)"]) {
      const r = await ratio(page, sel);
      assert.ok(r >= 4.5, `表紙 ${sel} の明暗差 ${r}`);
    }
    assert.equal(await page.evaluate(() => { const s = getComputedStyle(document.getElementById("start")); return [s.backgroundColor, s.color].join("|"); }), "rgb(156, 59, 46)|rgb(232, 219, 180)", "はじめる＝弁柄の地に紙色の字");
    // 試合
    await play(page);
    await page.locator("#meHand .tile").nth(0).click();   // 天（選ぶ）
    await page.locator("#meHand .tile").nth(4).click();   // 辶（部品の札。選ぶ）
    const sels = ["#cpuName", "#cpuScore", "#cpuCount", "#clock", "#meScore", "#meCount", "#trayHead", "#takes", "#info", "#bBack", "#bRedraw", "#bRelease", "#msg", "#again", "#bSetup", "#bLog", "#meHand .tile:not(.sel):not(.part)", "#meHand .tile.sel", "#meHand .tile.part", "#field .tile", "#cpuHand .tile", "#row .tile", ".log li", ".credit", "details summary"];
    for (const sel of sels) {
      const r = await ratio(page, sel);
      if (r === null) continue;
      assert.ok(r >= 4.5, `試合 ${sel} の明暗差 ${r}`);
    }
    await page.locator("#meHand .tile").nth(4).click(); // 辶 を外す。天 だけ選ぶと Flip などが押せる
    // 押せる操作（Split・Join・Flip・Cycle・Same reading。押せないものは除く）
    const ops = await page.evaluate(() => [...document.querySelectorAll(".ops-set button")].filter((b) => !b.disabled && b.getAttribute("aria-disabled") !== "true").map((b) => ({ id: b.id, r: window.__ratio(b) })));
    assert.ok(ops.length >= 2, "押せる操作がある");
    for (const o of ops) assert.ok(o.r >= 4.5, `${o.id} の明暗差 ${o.r}`);
    // Play（弁柄の地に紙色の字）は押せるときも押せないときも読める
    for (const dis of [true, false]) {
      const r = await page.evaluate((d) => { const b = document.getElementById("bRelease"); b.disabled = d; b.setAttribute("aria-disabled", String(d)); return window.__ratio(b); }, dis);
      assert.ok(r >= 4.5, `Play（${dis ? "押せない" : "押せる"}）の明暗差 ${r}`);
    }
    // 押せるときの Play は弁柄の地に紙色の字
    assert.equal(await page.evaluate(() => { const b = document.getElementById("bRelease"); b.disabled = false; b.removeAttribute("aria-disabled"); const s = getComputedStyle(b); return [s.backgroundColor, s.color].join("|"); }), "rgb(156, 59, 46)|rgb(232, 219, 180)");
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});

test("罫線と形：卓の上下は太い罫線・左に縦書きの見出し「卓に並ぶ」・操作5つは罫線で仕切った一続きの段・選んだ札は弁柄の縁・角丸はやめた", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const url = `http://127.0.0.1:${srv.address().port}/index.html`;
    const { ctx, page, errors } = await open(browser, url);
    await play(page);
    await page.locator("#meHand .tile").nth(0).click();
    const st = await page.evaluate(() => {
      const tb = document.querySelector(".table"), cs = getComputedStyle(tb), bf = getComputedStyle(tb, "::before");
      const set = document.querySelector(".ops-set"), ss = getComputedStyle(set);
      const btns = [...set.querySelectorAll("button")].map((b) => { const s = getComputedStyle(b); return { id: b.id, r: s.borderRightWidth, rs: s.borderRightStyle }; });
      const sel = document.querySelector("#meHand .tile.sel"), sc = getComputedStyle(sel), plain = getComputedStyle(document.querySelector("#meHand .tile:not(.sel)"));
      const radii = {}; for (const [k, q] of Object.entries({ tile: "#meHand .tile", slot: "#meTray .slot", row: "#row", table: ".table", play: "#bRelease", split: "#bSplit", back: "#bBack", redraw: "#bRedraw", setup: "#setup" })) { const e = document.querySelector(q); if (e) radii[k] = getComputedStyle(e).borderTopLeftRadius; }
      return { top: [cs.borderTopWidth, cs.borderTopStyle, cs.borderTopColor], bottom: [cs.borderBottomWidth, cs.borderBottomStyle], content: bf.content, mode: bf.writingMode, setBorder: [ss.borderTopWidth, ss.borderTopStyle], btns, sel: [sc.borderTopColor, sc.borderTopWidth, sc.backgroundColor, sc.color], plain: [plain.borderTopColor, plain.borderTopWidth, plain.backgroundColor], radii, leftPad: parseFloat(cs.paddingLeft), headW: parseFloat(bf.width) };
    });
    assert.deepEqual(st.top, ["3px", "solid", "rgb(42, 38, 34)"]);
    assert.deepEqual(st.bottom, ["3px", "solid"]);
    assert.equal(st.content, '"卓に並ぶ"');
    assert.equal(st.mode, "vertical-rl");
    assert.ok(st.leftPad > st.headW, "見出しが札や台に重ならない");
    assert.deepEqual(st.setBorder, ["1px", "solid"], "操作5つの外側の罫線");
    assert.equal(st.btns.length, 5);
    st.btns.forEach((b, i) => assert.deepEqual([b.r, b.rs], i < 4 ? ["1px", "solid"] : ["0px", "none"], `${b.id}：仕切りの罫線`));
    assert.deepEqual(st.sel, ["rgb(156, 59, 46)", "2px", "rgb(246, 238, 214)", "rgb(42, 38, 34)"], "選んだ札＝弁柄の縁・札の色の地・墨の字");
    assert.deepEqual(st.plain, ["rgb(125, 115, 102)", "1px", "rgb(246, 238, 214)"], "ふつうの札＝補助色の細い縁");
    for (const [k, v] of Object.entries(st.radii)) assert.equal(v, "0px", `${k} の角丸はやめた`);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});

test("375／320px：卓・操作・Play・Back・Redraw が画面の中にあり、押せる（置き場は変えない）", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const url = `http://127.0.0.1:${srv.address().port}/index.html`;
    for (const w of [375, 320]) {
      const { ctx, page, errors } = await open(browser, url, { vp: { width: w, height: 760 } });
      await play(page);
      const r = await page.evaluate((W) => {
        const out = {};
        for (const id of ["bRelease", "bSplit", "bJoin", "bInvert", "bCycle", "bHomo", "bBack", "bRedraw"]) {
          const e = document.getElementById(id), b = e.getBoundingClientRect(), hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          out[id] = { inside: b.left >= 0 && b.right <= W + 0.5, h: Math.round(b.height), click: e === hit || e.contains(hit) };
        }
        const t = document.querySelector(".table").getBoundingClientRect(), p = document.getElementById("bRelease").getBoundingClientRect();
        out.playInTable = p.left >= t.left && p.right <= t.right;
        out.playWide = p.width >= W - 80;
        const bk = document.getElementById("bBack").getBoundingClientRect(), rd = document.getElementById("bRedraw").getBoundingClientRect();
        out.backLeftOfRedraw = bk.right <= rd.left;
        out.backOutsideTable = !document.getElementById("bBack").closest(".table");
        return out;
      }, w);
      for (const id of ["bRelease", "bSplit", "bJoin", "bInvert", "bCycle", "bHomo", "bBack", "bRedraw"]) {
        assert.equal(r[id].inside, true, `${w}px ${id} は画面の中`);
        assert.ok(r[id].h >= 30, `${w}px ${id} の高さ ${r[id].h}`);
        assert.equal(r[id].click, true, `${w}px ${id} の真ん中を押せる（ほかに隠されない）`);
      }
      assert.equal(r.playInTable, true); assert.equal(r.playWide, true); assert.equal(r.backLeftOfRedraw, true); assert.equal(r.backOutsideTable, true);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally { await browser.close(); srv.close(); }
});

test("レビュー P-093：取ったばかりの札・ヒントの札を選んでも弁柄の縁／押せない Back・Redraw と空の台の字も 4.5 以上／選びの一覧が卓にそろう／号数の行は320pxで1行", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const url = `http://127.0.0.1:${srv.address().port}/index.html`;
    for (const w of [375, 320]) {
      const { ctx, page, errors } = await open(browser, url, { vp: { width: w, height: 800 }, init: { "kj-issue": "20" } });
      await page.evaluate(CONTRAST);
      const mast = await page.evaluate(() => { const r = (id) => document.getElementById(id).getBoundingClientRect(); const n = r("mastNo"), d = r("mastDate"); return { oneLine: n.height < 24 && d.height < 24, noOverlap: n.right <= d.left }; });
      assert.equal(await page.textContent("#mastNo"), "第弐拾壱號");
      assert.deepEqual(mast, { oneLine: true, noOverlap: true }, `${w}px：第弐拾壱號でも号数が1行`);
      await play(page);
      // 押せない Back・Redraw・空の台の字
      assert.equal(await page.evaluate(() => document.getElementById("bBack").disabled), true);
      for (const sel of ["#bBack", "#bRedraw", "#row .empty"]) { const r = await ratio(page, sel); assert.ok(r >= 4.5, `${w}px ${sel}（押せない・空）の明暗差 ${r}`); }
      // 取ったばかり・ヒント
      const edge = await page.evaluate(() => { const out = {}; const t = document.querySelector("#meHand .tile"); for (const cls of [["new"], ["hint"], ["hint", "lift"]]) { t.className = "tile " + cls.join(" ") + " sel"; out[cls.join(".")] = getComputedStyle(t).borderTopColor; } return out; });
      for (const [k, v] of Object.entries(edge)) assert.equal(v, "rgb(156, 59, 46)", `${w}px：${k} の札を選んだら弁柄の縁`);
      await page.evaluate(() => __KJ.render());
      // 選びの一覧（Same reading）：卓の幅にそろい、卓の外へはみ出さない
      await page.locator("#meHand .tile").nth(0).click();
      await page.evaluate(() => { const c = document.getElementById("choices"); c.innerHTML = '<div class="g"><span>x</span><button>天</button></div>'; c.classList.add("on"); });
      const g = await page.evaluate(() => { const c = document.getElementById("choices").getBoundingClientRect(), t = document.querySelector(".table").getBoundingClientRect(); return { l: c.left - t.left, r: t.right - c.right }; });
      assert.ok(Math.abs(g.l) <= 1 && Math.abs(g.r) <= 1, `${w}px：選びの一覧は卓にそろう（${JSON.stringify(g)}）`);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally { await browser.close(); srv.close(); }
});

test("KJ-097：操作5つ（Split・Join・Flip・Cycle・Same reading）の高さは 44px 以上（375／320px）。375×667 で自分の手札・ストックは画面の中", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const url = `http://127.0.0.1:${srv.address().port}/index.html`;
    const ids = ["bSplit", "bJoin", "bInvert", "bCycle", "bHomo"];
    for (const [w, h] of [[375, 667], [320, 667], [320, 568]]) {
      const { ctx, page, errors } = await open(browser, url, { vp: { width: w, height: h } });
      await play(page);
      await page.evaluate(() => { const G = __KJ.game; G.me.cards.push({ id: 9400, c: "月", t: 0, fresh: false, tray: true }); __KJ.render(); }); // ストックに札がある
      const r = await page.evaluate((ids) => {
        const out = { h: {} };
        for (const id of ids) out.h[id] = document.getElementById(id).getBoundingClientRect().height;
        const q = (s) => document.querySelector(s).getBoundingClientRect();
        out.hand = q("#meHand").bottom; out.tray = q("#meTray").bottom; out.sw = document.documentElement.scrollWidth;
        return out;
      }, ids);
      console.log(`# KJ-097 ${w}×${h} ops=${JSON.stringify(r.h)} hand=${r.hand} tray=${r.tray}`);
      for (const id of ids) assert.ok(r.h[id] >= 44, `${w}×${h} ${id} の高さ ${r.h[id]} は 44px 以上`);
      if (w === 375) assert.ok(r.sw <= w, `${w}px 横スクロールがない`); // 320px の横幅は KJ-097 より前からはみ出しがある（main でも 343px）。このカードでは直さない
      if (w === 375) assert.ok(r.hand <= h && r.tray <= h, `375×667 手札・ストックの下端が 667 以内（手札 ${r.hand}・ストック ${r.tray}）`);
      if (process.env.KJ_SHOT_DIR) await page.screenshot({ path: path.join(process.env.KJ_SHOT_DIR, `kj-097-${w}x${h}.png`) });
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally { await browser.close(); srv.close(); }
});

test("表紙を詰める（KJ-101）：絵柄の箱が前（190px）より低く、題字は箱の上寄りで小さい。昇る日は箱の下に付いたまま。375／320px で収まる", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const url = `http://127.0.0.1:${srv.address().port}/index.html`;
    for (const w of [412, 375, 320]) {
      const { ctx, page, errors } = await open(browser, url, { vp: { width: w, height: 700 } });
      const st = await page.evaluate(() => {
        const box = document.getElementById("mastTitle"), name = document.querySelector(".mast-name span"), svg = box.querySelector("svg.mast-sun");
        const b = box.getBoundingClientRect(), n = name.getBoundingClientRect(), sr = svg.getBoundingClientRect();
        const sun = svg.querySelector("circle").getBoundingClientRect();
        return { boxH: b.height, fs: parseFloat(getComputedStyle(name).fontSize), nameTop: n.top - b.top, sunBottomAtBox: sun.bottom >= b.bottom - 6, sunShown: sun.top < b.bottom - 8, noHScroll: document.documentElement.scrollWidth <= innerWidth, nameInside: n.left >= b.left && n.right <= b.right && n.bottom <= b.bottom };
      });
      assert.ok(st.boxH < 190 && st.boxH <= 140, `${w}px：箱の高さ ${st.boxH}（前は 190）`);
      assert.ok(st.fs < 38 && st.fs <= 28, `${w}px：題字の大きさ ${st.fs}（前は 38／32）`);
      assert.ok(st.nameTop < 40 && st.nameTop <= 20, `${w}px：題字は箱の上寄り（上から ${st.nameTop}px。前は 40+罫）`);
      assert.equal(st.sunBottomAtBox, true, `${w}px：昇る日は箱の下に付いたまま`);
      assert.equal(st.sunShown, true, `${w}px：昇る日が箱の中に見えている`);
      assert.equal(st.nameInside && st.noHScroll, true, `${w}px：題字が箱に収まり、横にはみ出さない`);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally { await browser.close(); srv.close(); }
});

test("説明文（KJ-110）：作者の文の2行（数は決まりと選んだ時間から）・下に英訳・英訳の明暗差 4.5 以上・字が Kaisei／Zen にある", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const url = `http://127.0.0.1:${srv.address().port}/index.html`;
    for (const vp of [{ width: 412, height: 780 }, { width: 320, height: 568 }]) {
      const { ctx, page, errors } = await open(browser, url, { vp });
      await page.evaluate(CONTRAST);
      const read = () => page.evaluate(() => ({ ja: document.getElementById("lead").textContent, en: document.getElementById("leadEn").textContent }));
      const R = JSON.parse(fs.readFileSync(new URL("../data/rules.json", import.meta.url), "utf8"));
      await page.check('#tim input[value="300"]');
      let t = await read();
      assert.equal(t.ja, `漢字を割ってくっつけて、放つ。\n${R.win.score}点先取か5分経過時に、得点の多い方が勝ち。`, "作者の文のとおり");
      assert.equal(t.en, `Split kanji, join them, and play words. First to ${R.win.score} points — or the higher score after 5 minutes — wins.`);
      await page.check('#tim input[value="600"]');
      t = await read();
      assert.ok(t.ja.includes("10分経過時") && t.en.includes("after 10 minutes"), "時間を選ぶと数が変わる");
      // 2行：改行で2行に見える（高さ＝行の高さの2倍前後）／英訳は日本語の下にある
      const g = await page.evaluate(() => { const a = document.getElementById("lead"), b = document.getElementById("leadEn"); const lh = parseFloat(getComputedStyle(a).lineHeight) || 13 * 1.5; return { h: a.getBoundingClientRect().height, lh, aBottom: a.getBoundingClientRect().bottom, bTop: b.getBoundingClientRect().top, size: parseFloat(getComputedStyle(b).fontSize), sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }; });
      assert.ok(g.h >= g.lh * 1.8 && g.h <= g.lh * 2.2, `日本語はちょうど2行 ${g.h}/${g.lh}`);
      assert.ok(g.bTop >= g.aBottom - 0.5, "英訳は日本語の下");
      assert.ok(g.size >= 11 && g.size <= 12, `英訳の大きさ ${g.size}`);
      assert.ok(g.sw <= g.cw, "横にはみ出さない");
      assert.ok((await ratio(page, "#leadEn")) >= 4.5, "英訳の明暗差");
      const ok = await page.evaluate(async () => { const e = document.getElementById("leadEn"); await document.fonts.load('11.5px "KJ Zen"', e.textContent); return document.fonts.check('11.5px "KJ Zen"', e.textContent) && getComputedStyle(e).fontFamily.startsWith('"KJ Zen"'); });
      assert.equal(ok, true, "英訳は画面の字（Zen）");
      assert.deepEqual(errors, []);
      await ctx.close();
    }
    // 試合中は広い画面でも英訳は出ない（試合の画面は変えない）
    const { ctx, page } = await open(browser, url, { vp: { width: 800, height: 700 } });
    await page.evaluate(() => document.body.classList.add("playing"));
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("leadEn")).display), "none");
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});

test("説明文（KJ-101）：いつも大正風（KJ Kaisei）。札の字を明朝にしても変わらない。紙の地の上でも、背景の記事の字（墨 20%）が後ろに重なる所でも明暗差 4.5 以上", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const url = `http://127.0.0.1:${srv.address().port}/index.html`;
    const { ctx, page, errors } = await open(browser, url, { vp: { width: 375, height: 700 } });
    await page.evaluate(CONTRAST);
    const fam = () => page.evaluate(() => getComputedStyle(document.getElementById("lead")).fontFamily.split(",")[0].replace(/"/g, "").trim());
    assert.equal(await fam(), "KJ Kaisei", "初期（大正風）");
    await page.evaluate(() => document.documentElement.setAttribute("data-face", "mincho"));
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--kanji").includes("KJ Shippori")), true, "札の字は明朝に替わった");
    assert.equal(await fam(), "KJ Kaisei", "札の字を明朝にしても説明文は大正風のまま");
    // 字体が実際に読まれ、説明文の字が Kaisei で描かれる（端末の字体に落ちていない）
    const ok = await page.evaluate(async () => { await document.fonts.load('13px "KJ Kaisei"', document.getElementById("lead").textContent); return document.fonts.check('13px "KJ Kaisei"', document.getElementById("lead").textContent); });
    assert.equal(ok, true, "KJ Kaisei が説明文の字を持って読まれている");
    assert.ok((await ratio(page, "#lead")) >= 4.5, "字と紙の地の明暗差");
    // 背景の記事（#bgnews。墨 20% の字）が後ろに重なる所：紙の地に墨を 20% 重ねた色に対しても 4.5 以上（レビュー P-101）
    const over = await page.evaluate(() => {
      const lin = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
      const lum = (c) => .2126 * lin(c[0]) + .7152 * lin(c[1]) + .0722 * lin(c[2]);
      const nums = (s) => /\(([^)]+)\)/.exec(s)[1].split(",").map(Number);
      const f = nums(getComputedStyle(document.getElementById("lead")).color), bg = nums(getComputedStyle(document.body).backgroundColor);
      const news = nums(getComputedStyle(document.getElementById("bgnews")).color), a = news[3] ?? 1;
      const mix = [0, 1, 2].map((i) => bg[i] * (1 - a) + news[i] * a);
      const x = lum(f), y = lum(mix);
      return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
    });
    assert.ok(over >= 4.5, `記事の字と重なる所の明暗差 ${over}`);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});

test("▼（KJ-101）：はじめる前の画面で、下に見えていない所があるときだけ右下に出る。いちばん下で消え、戻ると出る。押せない。試合中・チュートリアル・終わりの画面では出ない", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const url = `http://127.0.0.1:${srv.address().port}/index.html`;
    const vis = (page) => page.evaluate(() => { const e = document.getElementById("scrollHint"); return !!e && getComputedStyle(e).display !== "none"; });
    // 低い画面：下に余りがある → 出る
    const { ctx, page, errors } = await open(browser, url, { vp: { width: 375, height: 500 } });
    assert.equal(await vis(page), true, "はじめは下に余りがあるので出る");
    const geo = await page.evaluate(() => { const e = document.getElementById("scrollHint"), r = e.getBoundingClientRect(), s = getComputedStyle(e); return { pos: s.position, pe: s.pointerEvents, right: innerWidth - r.right, bottom: innerHeight - r.bottom, anim: s.animationName, aria: e.getAttribute("aria-hidden"), color: s.color }; });
    assert.equal(geo.pos, "fixed"); assert.equal(geo.pe, "none", "押せない"); assert.equal(geo.aria, "true");
    assert.ok(geo.right >= 0 && geo.right <= 40 && geo.bottom >= 0 && geo.bottom <= 40, `右下にある（右 ${geo.right}・下 ${geo.bottom}）`);
    assert.equal(geo.anim, "none", "動きを減らす設定（この試験の端末）では動かさず置くだけ");
    // 押せない：▼の真上の点を押すと、下にあるものに届く（▼が受けない）
    assert.equal(await page.evaluate(() => { const e = document.getElementById("scrollHint"), r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return t !== e; }), true);
    // いちばん下まで行くと消える。戻ると また出る
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForFunction(() => getComputedStyle(document.getElementById("scrollHint")).display === "none");
    assert.equal(await vis(page), false, "いちばん下で消える");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction(() => getComputedStyle(document.getElementById("scrollHint")).display !== "none");
    // 終わりの画面（body.esOn）・チュートリアル（body.tutorial）では出ない
    await page.evaluate(() => document.body.classList.add("esOn"));
    await page.waitForFunction(() => getComputedStyle(document.getElementById("scrollHint")).display === "none");
    await page.evaluate(() => { document.body.classList.remove("esOn"); document.body.classList.add("tutorial"); });
    await page.waitForFunction(() => getComputedStyle(document.getElementById("scrollHint")).display === "none");
    await page.evaluate(() => document.body.classList.remove("tutorial"));
    await page.waitForFunction(() => getComputedStyle(document.getElementById("scrollHint")).display !== "none");
    // 試合中は出ない
    await play(page);
    assert.equal(await vis(page), false, "試合中は出ない");
    assert.deepEqual(errors, []);
    await ctx.close();
    // 高い画面：下に余りが無い → 出ない
    const t = await open(browser, url, { vp: { width: 375, height: 4000 } });
    assert.equal(await vis(t.page), false, "全部見えているときは出ない");
    await t.ctx.close();
    // 動きを減らさない端末では動く
    const ctx2 = await browser.newContext({ viewport: { width: 375, height: 500 }, reducedMotion: "no-preference" });
    await ctx2.addInitScript(() => { try { localStorage.setItem("kj-tutorial", "1"); } catch (e) { /* 読めない端末 */ } });
    const p2 = await ctx2.newPage(); await p2.goto(url);
    await p2.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
    const anim = await p2.evaluate(() => { const s = getComputedStyle(document.getElementById("scrollHint")); return { n: s.animationName, d: s.animationDuration, i: s.animationIterationCount }; });
    assert.deepEqual(anim, { n: "kjHintBob", d: "1.6s", i: "infinite" }, "ゆっくり（1.6 秒）上下する");
    await ctx2.close();
  } finally { await browser.close(); srv.close(); }
});
