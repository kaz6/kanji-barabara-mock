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

test("表紙：題字「バラバラ新報」を二重罫線で挟み、すぐ下の行に 第○號（左）・今日の日付（中）。試合の画面には出ない", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const url = `http://127.0.0.1:${srv.address().port}/index.html`;
    const { ctx, page, errors } = await open(browser, url);
    assert.equal((await page.textContent("#mastTitle")).trim(), "バラバラ新報");
    assert.equal(await page.textContent("#mastNo"), "第一號");
    const date = await page.textContent("#mastDate");
    assert.match(date, /^[〇一二三四五六七八九]{4}年[一二三四五六七八九十]+月[一二三四五六七八九十]+日$/);
    const today = await page.evaluate(() => KJ.kansujiDate(new Date()));
    assert.equal(date, today, "今日の日付");
    const st = await page.evaluate(() => {
      const t = getComputedStyle(document.getElementById("mastTitle")), l = getComputedStyle(document.querySelector(".mast-line"));
      const r = (id) => document.getElementById(id).getBoundingClientRect();
      const title = r("mastTitle"), no = r("mastNo"), dt = r("mastDate");
      return { tt: t.borderTopStyle, tb: t.borderBottomStyle, lb: l.borderBottomStyle, below: no.top >= title.bottom - 1, noLeft: no.left < innerWidth / 3, dtMid: Math.abs((dt.left + dt.right) / 2 - innerWidth / 2) < 6, vis: document.getElementById("mast").offsetParent !== null };
    });
    assert.deepEqual(st, { tt: "double", tb: "double", lb: "double", below: true, noLeft: true, dtMid: true, vis: true }, "題字の上下・号数の行の下が二重罫線／号数は左・日付は中／題字の下の行");
    await play(page);
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("mast")).display), "none", "試合の画面には題字を出さない");
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});

test("号数：試合を始めるたびに増え、端末に覚える。読めなければ 第一號。チュートリアルは数えない", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const url = `http://127.0.0.1:${srv.address().port}/index.html`;
    const { ctx, page, errors } = await open(browser, url);
    assert.equal(await page.textContent("#mastNo"), "第一號");
    await play(page);
    assert.equal(await page.evaluate(() => localStorage.getItem("kj-issue")), "1", "始めたら 1 試合");
    await page.click("#bSetup");
    assert.equal(await page.textContent("#mastNo"), "第二號");
    await page.click("#start");
    await page.click("#bSetup");
    assert.equal(await page.textContent("#mastNo"), "第三號");
    assert.equal(await page.evaluate(() => localStorage.getItem("kj-issue")), "2");
    await page.click("#start");
    await page.click("#again"); // もう一度も 1 試合
    assert.equal(await page.evaluate(() => localStorage.getItem("kj-issue")), "4");
    await page.reload();
    await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
    assert.equal(await page.textContent("#mastNo"), "第五號", "ページを開き直しても覚えている");
    await ctx.close();
    // 読めない値・負の値
    for (const bad of ["abc", "-4", ""]) {
      const o = await open(browser, url, { init: { "kj-issue": bad } });
      assert.equal(await o.page.textContent("#mastNo"), "第一號", `kj-issue=${JSON.stringify(bad)}`);
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
    for (const sel of ["#mastTitle", "#mastNo", "#mastDate", "#title", "#lead", ".setup .gt", "#setupInfo", '#opp label:not(:has(input:checked))', "#opp label:has(input:checked)", "#start", "#bTutorial", "#face label:not(:has(input:checked))", "#face label:has(input:checked)"]) {
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

test("罫線と形：卓の上下は太い罫線・左に縦書きの見出し「卓　場と台」・操作5つは罫線で仕切った一続きの段・選んだ札は弁柄の縁・角丸はやめた", { skip }, async () => {
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
    assert.equal(st.content, '"卓　場と台"');
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
      assert.equal(await page.textContent("#mastNo"), "第二十一號");
      assert.deepEqual(mast, { oneLine: true, noOverlap: true }, `${w}px：第二十一號でも号数が1行`);
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
