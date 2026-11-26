// 戦況の欄・背景の記事・紙のざらつき（KJ-094。P-094）。Playwright の Chromium がないと skip になる
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
async function open(browser, url, { vp = { width: 375, height: 800 }, init = {}, blockStorage = false } = {}) {
  const ctx = await browser.newContext({ viewport: vp, reducedMotion: "reduce" });
  await ctx.addInitScript(([st, block]) => {
    try {
      if (!sessionStorage.getItem("kjInit")) { sessionStorage.setItem("kjInit", "1"); localStorage.setItem("kj-tutorial", "1"); for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); }
    } catch (e) { /* 読めない端末 */ }
    if (block) { Storage.prototype.setItem = () => { throw new Error("blocked"); }; Storage.prototype.getItem = () => { throw new Error("blocked"); }; }
  }, [init, blockStorage]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
  return { ctx, page, errors };
}
async function play(page, chars = "休日口辶十日下天") {
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
const CONTRAST = `(function(){
  const rgb=s=>{const m=/rgba?\\(([^)]+)\\)/.exec(s);const p=m[1].split(",").map(Number);return{r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}};
  const lin=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};
  const lum=c=>.2126*lin(c.r)+.7152*lin(c.g)+.0722*lin(c.b);
  const bgOf=e=>{for(let x=e;x;x=x.parentElement){const c=rgb(getComputedStyle(x).backgroundColor);if(c.a>0.5)return c}return rgb(getComputedStyle(document.body).backgroundColor)};
  window.__ratio=e=>{const f=rgb(getComputedStyle(e).color),b=bgOf(e);const a=lum(f),c=lum(b);return (Math.max(a,c)+.05)/(Math.min(a,c)+.05)};
})()`;
// 放った言葉を記録に足して描き直す（文は K.senkyoLines が記録から組む）
const addRel = (page, rows) => page.evaluate((rs) => {
  const G = __KJ.game;
  for (const [who, w, pts, takes] of rs) {
    const name = who === "me" ? G.me.name : G.cpu.name;
    G.log.push({ t: 1, who: name, op: "放つ", from: [...w], to: [], pts, note: "" });
    for (const c of takes || []) G.log.push({ t: 1, who: name, op: "取る", from: [c], to: [c], pts: 0, note: "" });
  }
  __KJ.render();
}, rows);
const lisText = (page) => page.$$eval("#released li", (a) => a.map((x) => x.textContent));

test("戦況の欄：左に墨の地の縦書きの見出し「戦況」・中は縦書き。「放った言葉」の見出しは無い。放つ前は空", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const { ctx, page, errors } = await open(browser, `http://127.0.0.1:${srv.address().port}/index.html`);
    await play(page);
    const st = await page.evaluate(() => {
      const cs = (s) => getComputedStyle(document.querySelector(s)), r = (s) => document.querySelector(s).getBoundingClientRect();
      const head = r("#skHead"), log = r("#released"), sec = r("#senkyo");
      return {
        headText: document.getElementById("skHead").textContent, headWm: cs("#skHead").writingMode, headBg: cs("#skHead").backgroundColor, headFg: cs("#skHead").color,
        logWm: cs("#released").writingMode, left: head.right <= log.left + 1 && Math.abs(head.top - sec.top) <= 3, h: Math.round(sec.height), w: Math.round(sec.width),
        oldHead: document.body.innerText.includes("放った言葉") ? "残っている" : "無い", n: document.querySelectorAll("#released li").length,
      };
    });
    assert.equal(st.headText, "戦況");
    assert.equal(st.headWm, "vertical-rl");
    assert.equal(st.headBg, "rgb(42, 38, 34)", "見出しは墨の地");
    assert.equal(st.headFg, "rgb(232, 219, 180)", "字は紙の色");
    assert.equal(st.logWm, "vertical-rl", "中は縦書き");
    assert.ok(st.left, "見出しは左・中の左端に接する");
    assert.equal(st.h, 40, "空のあいだは低い（40px。見出し「戦況」2字が1列に入る最小。KJ-106。375×700 に収める決まり。KJ-010）");
    // KJ-106：空のとき、見出しの2字は1列に「戦」の下に「況」と並ぶ（2列に割れて「況戦」と読めない）
    const cols = await page.evaluate(() => { const h = document.getElementById("skHead"), t = h.firstChild, out = []; for (let i = 0; i < t.length; i++) { const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + 1); const b = r.getBoundingClientRect(); out.push({ c: t.data[i], l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top) }); } return { out, headRects: (() => { const r = document.createRange(); r.selectNodeContents(h); return r.getClientRects().length; })(), hh: Math.round(h.getBoundingClientRect().height) }; });
    assert.equal(cols.out.length, 2);
    assert.equal(cols.out[0].c, "戦", "上の字は「戦」");
    assert.equal(cols.out[1].c, "況", "下の字は「況」");
    assert.ok(Math.abs(cols.out[0].l - cols.out[1].l) <= 1 && Math.abs(cols.out[0].r - cols.out[1].r) <= 1, `2字の左端がそろう（1列。${JSON.stringify(cols.out)}）`);
    assert.ok(cols.out[0].t < cols.out[1].t, "「戦」が「況」の上");
    assert.equal(cols.headRects, 1, "見出しは1列（折り返さない）");
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("skHead")).fontSize), "12px", "字の大きさは今のまま");
    assert.equal(st.oldHead, "無い", "「放った言葉」の見出しは戦況に替わった");
    assert.equal(st.n, 0, "放つ前は何も無い");
    await addRel(page, [["me", "空白", 3, []]]);
    const h2 = await page.evaluate(() => Math.round(document.getElementById("senkyo").getBoundingClientRect().height));
    assert.ok(h2 >= 100 && h2 <= 215, `1つ放ったら、欄の高さは今の「放った言葉」くらい（${h2}px）`);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});

test("戦況の文：放つたびに増える。あなた・CPU の文。読みと点が文に入る。取るたびに「場ヨリ○ヲ取ル。」が足される。放った言葉は漢字のまま（使用済みが読める）", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const { ctx, page, errors } = await open(browser, `http://127.0.0.1:${srv.address().port}/index.html`);
    await play(page);
    // 画面の操作で放つ：休日 を台に並べて Play
    for (const c of "休日") await page.locator("#meHand .tile", { hasText: c }).first().click();
    await page.click("#bRelease");
    let t = await lisText(page);
    assert.equal(t.length, 1);
    assert.match(t[0], /^アナタ、休日（キュウジツ）ヲ放ツ。二字ニテ三点。$/, "放った直後（まだ取っていない）");
    await page.locator("#field .tile").nth(0).click();
    t = await lisText(page);
    assert.match(t[0], /^アナタ、休日（キュウジツ）ヲ放ツ。二字ニテ三点。場ヨリ[^・]+ヲ取ル。$/, "1枚取ったら 場ヨリ○ヲ取ル。");
    await page.locator("#field .tile").nth(1).click();
    t = await lisText(page);
    assert.equal(t.length, 1, "取っても行は増えない");
    assert.match(t[0], /^アナタ、休日（キュウジツ）ヲ放ツ。二字ニテ三点。場ヨリ[^・]+・[^・]+ヲ取ル。$/, "2枚取り終えた");
    assert.equal(await page.textContent("#takes"), "");
    // CPU が放つ：新しい行が右（先頭）に
    await addRel(page, [["cpu", "学校名", 9, ["後", "道", "午"]]]);
    t = await lisText(page);
    assert.equal(t.length, 2);
    assert.match(t[0], /^CPU、学校名/, "新しい順（先頭が新しい）");
    assert.match(t[0], /三字ニテ九点。場ヨリ後・道・午ヲ取ル。$/);
    assert.match(t[1], /^アナタ、休日/);
    // 放った言葉そのものは漢字のまま＝札の字（--kanji）で出る
    const w = await page.$$eval("#released li .w", (a) => a.map((x) => ({ t: x.textContent, ff: getComputedStyle(x).fontFamily })));
    assert.deepEqual(w.map((x) => x.t), ["学校名", "休日"]);
    assert.ok(w.every((x) => x.ff.includes("KJ Kaisei")), "札の字の字体");
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});

test("戦況：あなたの行は弁柄の太字・CPU の行は普通。字と地の明暗差 4.5 以上", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const { ctx, page, errors } = await open(browser, `http://127.0.0.1:${srv.address().port}/index.html`);
    await play(page);
    await addRel(page, [["me", "空白", 3, ["新", "話"]], ["cpu", "学校名", 9, []]]);
    await page.evaluate(CONTRAST);
    const st = await page.evaluate(() => [...document.querySelectorAll("#released li")].map((l) => ({ cls: l.className, fw: +getComputedStyle(l).fontWeight, color: getComputedStyle(l).color, ratio: window.__ratio(l), wColor: getComputedStyle(l.querySelector(".w")).color })));
    assert.equal(st.length, 2);
    const cpu = st[0], me = st[1];
    assert.equal(me.cls, "me");
    assert.ok(me.fw >= 700, "あなたの行は太字");
    assert.equal(me.color, "rgb(156, 59, 46)", "弁柄");
    assert.equal(me.wColor, "rgb(156, 59, 46)", "放った言葉も弁柄");
    assert.ok(cpu.fw <= 500, "CPU の行は太字にしない");
    assert.notEqual(cpu.color, me.color);
    assert.ok(me.ratio >= 4.5 && cpu.ratio >= 4.5, `明暗差（あなた ${me.ratio.toFixed(2)}・CPU ${cpu.ratio.toFixed(2)}）`);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});

test("戦況：入りきらない古い行は欄の外（左）へ流れる。欄の高さは変わらず、横にはみ出さない（375・320px）。新しい行が右", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    for (const vp of [{ width: 375, height: 800 }, { width: 320, height: 800 }]) {
      const { ctx, page, errors } = await open(browser, `http://127.0.0.1:${srv.address().port}/index.html`, { vp });
      await play(page);
      await addRel(page, [["me", "空白", 3, ["新", "話"]]]);
      const h1 = await page.evaluate(() => Math.round(document.getElementById("senkyo").getBoundingClientRect().height));
      const rows = [];
      for (let i = 0; i < 12; i++) rows.push([i % 2 ? "me" : "cpu", ["学校名", "天上天下", "休日", "新月", "口話", "大雨"][i % 6], 3 + i, ["人", "木"]]);
      await addRel(page, rows);
      // 戦況の欄だけを隠したときの横幅（320px は KJ-097 より前から手札の欄でみ出す。字体のある環境で幅がちがう）。欄を出したときにそれより増えないこと
      const hs0 = await page.evaluate(() => { const e = document.getElementById("senkyo"); e.style.display = "none"; const v = document.documentElement.scrollWidth - innerWidth; e.style.display = ""; return v; });
      const st = await page.evaluate(() => {
        const ul = document.getElementById("released"), lis = [...ul.children], u = ul.getBoundingClientRect(), sec = document.getElementById("senkyo").getBoundingClientRect();
        const first = lis[0].getBoundingClientRect(), second = lis[1].getBoundingClientRect(), last = lis[lis.length - 1].getBoundingClientRect();
        return { n: lis.length, h: Math.round(sec.height), newestRight: first.right > second.right, lastOut: last.right < u.left + 1 || last.left < u.left - 1, firstIn: first.right <= u.right + 1 && first.left >= u.left,
          overflowX: getComputedStyle(ul).overflowX, hscroll: document.documentElement.scrollWidth - innerWidth, secRight: sec.right <= innerWidth + 0.5 };
      });
      assert.equal(st.n, 13);
      assert.equal(st.h, h1, `${vp.width}px：行が増えても欄の高さは同じ`);
      assert.ok(st.newestRight, "新しい行ほど右");
      assert.ok(st.firstIn, "いちばん新しい行は欄の中");
      assert.ok(st.lastOut, "いちばん古い行は欄の外へ流れた");
      assert.equal(st.overflowX, "hidden");
      assert.ok(st.hscroll <= Math.max(0, hs0), `${vp.width}px：横スクロールを増やさない（前 ${hs0}・後 ${st.hscroll}）`);
      if (vp.width === 375) assert.ok(st.hscroll <= 0, "375px：横スクロールなし");
      assert.ok(st.secRight);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally { await browser.close(); srv.close(); }
});

test("背景の記事：画面いっぱいに縦書き 10px・墨の不透明度 20%・札やボタンの下・押せない・読み上げない。画面を埋めるだけ繰り返す", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const { ctx, page, errors } = await open(browser, `http://127.0.0.1:${srv.address().port}/index.html`);
    const st = await page.evaluate(() => {
      const e = document.getElementById("bgnews"), s = getComputedStyle(e), r = e.getBoundingClientRect(), m = getComputedStyle(document.querySelector("main"));
      return { pos: s.position, wm: s.writingMode, fs: s.fontSize, color: s.color, pe: s.pointerEvents, hidden: e.getAttribute("aria-hidden"), z: +s.zIndex, mz: +m.zIndex, disp: s.display,
        full: [r.left, r.top, r.width, r.height].join(","), vp: [0, 0, innerWidth, innerHeight].join(","), len: e.textContent.length, head: e.textContent.slice(0, 5), area: innerWidth * innerHeight };
    });
    assert.equal(st.pos, "fixed");
    assert.equal(st.wm, "vertical-rl");
    assert.equal(st.fs, "10px");
    assert.equal(st.color, "rgba(42, 38, 34, 0.2)", "墨の不透明度 20%");
    assert.equal(st.pe, "none", "押せない");
    assert.equal(st.hidden, "true", "読み上げない");
    assert.equal(st.z, -1, "札・ボタンより下の層");
    assert.ok(Number.isNaN(st.mz), "main に z-index は付けない（#fxPts が #fx の上に出る決まり）");
    assert.equal(st.full, st.vp, "背景いっぱい");
    assert.equal(st.head, "本紙特報。");
    assert.ok(st.len * 10 * 15.5 >= st.area, `画面が埋まるだけ繰り返す（${st.len}字）`);
    // 札の上では、いちばん上の要素は札。記事は押せない（空いた所で elementFromPoint は記事を返さない）
    await play(page);
    const top = await page.evaluate(() => {
      const t = document.querySelector("#meHand .tile").getBoundingClientRect(), x = document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2);
      const stack = document.elementsFromPoint(t.left + t.width / 2, t.top + t.height / 2).map((e) => e.id || e.className);
      const gap = document.elementFromPoint(2, 2);
      return { onTile: !!x.closest(".tile"), below: stack.indexOf("bgnews"), above: stack.findIndex((n) => /tile/.test(String(n))), gap: gap && gap.id };
    });
    assert.ok(top.onTile, "札の上は札");
    assert.equal(top.below, -1, "押せない部品は、押す場所の候補にも出ない（pointer-events:none）");
    assert.notEqual(top.gap, "bgnews");
    // 画面を広げると、足りない分を足す
    await page.setViewportSize({ width: 900, height: 900 });
    await page.waitForFunction((n) => document.getElementById("bgnews").textContent.length > n, st.len);
    const len2 = await page.evaluate(() => document.getElementById("bgnews").textContent.length);
    assert.ok(len2 > st.len, "広い画面では繰り返しが増える");
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});

test("設定「背景の記事」：入／切（初期は入）。切なら記事だけ消える（ざらつきは残る）。端末に覚える。覚えられない端末でも落ちない", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const url = `http://127.0.0.1:${srv.address().port}/index.html`;
    const { ctx, page, errors } = await open(browser, url);
    const state = () => page.evaluate(() => ({
      attr: document.documentElement.getAttribute("data-news"), disp: getComputedStyle(document.getElementById("bgnews")).display, ls: localStorage.getItem("kj-news"),
      checked: document.querySelector('#news input:checked').value, label: document.getElementById("newsLabel").textContent,
      grain: (getComputedStyle(document.body).backgroundImage.match(/url\("data:image\/svg\+xml/g) || []).length,
    }));
    assert.deepEqual(await page.$$eval("#news label", (a) => a.map((x) => x.textContent.trim())), ["入", "切"]);
    assert.deepEqual(await state(), { attr: "on", disp: "block", ls: null, checked: "1", label: "背景の記事", grain: 2 }, "初期は入");
    await page.check('#news input[value="0"]');
    assert.deepEqual(await state(), { attr: "off", disp: "none", ls: "0", checked: "0", label: "背景の記事", grain: 2 }, "切：記事だけ消える。ざらつき（背景の粒と繊維）は残る");
    await page.reload();
    await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
    assert.deepEqual(await state(), { attr: "off", disp: "none", ls: "0", checked: "0", label: "背景の記事", grain: 2 }, "開き直しても切");
    await page.check('#news input[value="1"]');
    assert.deepEqual(await state(), { attr: "on", disp: "block", ls: "1", checked: "1", label: "背景の記事", grain: 2 });
    await page.reload();
    await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
    assert.equal((await state()).attr, "on", "開き直しても入");
    assert.deepEqual(errors, []);
    await ctx.close();
    // 覚えられない端末（localStorage が読めない・書けない）：入のまま動き、切り替えても落ちない
    const B = await open(browser, url, { blockStorage: true });
    assert.equal(await B.page.evaluate(() => document.documentElement.getAttribute("data-news")), "on");
    await B.page.check('#news input[value="0"]');
    assert.equal(await B.page.evaluate(() => document.documentElement.getAttribute("data-news")), "off");
    assert.deepEqual(B.errors, []);
    await B.ctx.close();
  } finally { await browser.close(); srv.close(); }
});

test("紙のざらつき：body の背景に粒と繊維の SVG（feTurbulence）を敷く。画面を毎回描き直す層は増やさない（背景タイルと固定の1枚だけ）", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const { ctx, page, errors } = await open(browser, `http://127.0.0.1:${srv.address().port}/index.html`);
    const st = await page.evaluate(() => {
      const css = getComputedStyle(document.body);
      return { img: css.backgroundImage, color: css.backgroundColor, size: css.backgroundSize, att: css.backgroundAttachment, svgFilters: document.querySelectorAll("svg feTurbulence").length };
    });
    const urls = st.img.match(/url\("data:image\/svg\+xml[^)]*\)/g) || [];
    assert.equal(urls.length, 2, "粒と繊維");
    assert.ok(urls.every((u) => decodeURIComponent(u).includes("feTurbulence")));
    assert.ok(urls.some((u) => decodeURIComponent(u).includes("baseFrequency='0.9'")), "粒");
    assert.ok(urls.some((u) => decodeURIComponent(u).includes("baseFrequency='0.012 0.09'")), "繊維");
    assert.ok(urls.every((u) => decodeURIComponent(u).includes("stitchTiles='stitch'")), "継ぎ目なし");
    assert.equal(st.color, "rgb(232, 219, 180)", "地は紙の色");
    assert.equal(st.att, "scroll, scroll, scroll", "固定の背景にしない（スクロールのたびに描き直さない）");
    assert.equal(st.svgFilters, 0, "ページの中に SVG フィルタを置かない（毎回の描きに入らない）");
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});

test("ストックの空きマス（点線）：紙の色を濃く敷いて、背景の記事が透けて邪魔にならない", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const { ctx, page, errors } = await open(browser, `http://127.0.0.1:${srv.address().port}/index.html`);
    await play(page);
    const a = await page.evaluate(() => {
      const s = document.querySelector("#meTray .slot, .tray .slot"); if (!s) return null;
      const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(s).backgroundColor).slice(1)[0].split(",").map(Number);
      return { a: m.length > 3 ? m[3] : 1, bs: getComputedStyle(s).borderTopStyle };
    });
    assert.ok(a, "空きマスがある");
    assert.ok(a.a >= 0.85, `空きマスの地は濃い（不透明度 ${a.a}）`);
    assert.equal(a.bs, "dotted", "点線は今のまま");
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});

test("375×700：戦況の欄（空のあいだ）を足しても、ページ全体が 375×700 に収まる（KJ-010 の決まり）。放ったあとは欄が伸びる", { skip }, async () => {
  const srv = await serve(); const browser = await chromium.launch();
  try {
    const { ctx, page, errors } = await open(browser, `http://127.0.0.1:${srv.address().port}/index.html`, { vp: { width: 375, height: 700 } });
    await play(page);
    const geo = () => page.evaluate(() => ({ sh: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth, sy: scrollY, tray: document.getElementById("meTray").getBoundingClientRect().bottom }));
    const g0 = await geo();
    assert.ok(g0.sh <= 700 && g0.sw <= 375 && g0.sy === 0, `空のあいだは 375×700 に収まる（高さ ${g0.sh}）`);
    await addRel(page, [["me", "空白", 3, ["新"]]]);
    const g1 = await geo();
    assert.ok(g1.sh > g0.sh, "放ったら欄が伸びる（下にスクロールできる）");
    assert.equal(g1.tray, g0.tray, "札・ストックの位置は動かない（戦況は下の欄）");
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});
