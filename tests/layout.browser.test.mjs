// 試合の画面の置き場（KJ-078。作者 2026-11-25「案A 台のそばに Back」。D-096）：Back は台の右端／Play は幅いっぱい／Redraw は卓の外の点の行の右端で、長押しで引き直す
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
try { ({ chromium } = require("playwright")); } catch { /* 入っていない */ }
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


async function open(browser, url, vp = { width: 375, height: 800 }) {
  const ctx = await browser.newContext({ viewport: vp, reducedMotion: "reduce" });
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
  await page.evaluate(() => {
    const G = __KJ.game; G.cpuTurn = () => null;
    G.me.cards = [..."天上天下十口休日"].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
    G.field = [..."山川玉"].map((c, i) => ({ id: 9500 + i, c, t: 0, fresh: false }));
    __KJ.render();
  });
  return { ctx, page, errors };
}
const box = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, sel);
const handIds = (page) => page.evaluate(() => __KJ.game.me.cards.map((c) => c.id).join(","));
async function press(page, ms) { // Redraw をマウスで押して ms だけ待ち、離す
  const b = await box(page, "#bRedraw");
  await page.mouse.move(b.l + b.w / 2, b.t + b.h / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}
const shot = async (page, name) => { if (process.env.KJ_SHOT_DIR) await page.screenshot({ path: path.join(process.env.KJ_SHOT_DIR, name) }); };

test("置き場（KJ-078・KJ-090）：Back は「あなた」の行の Redraw の左（卓の外）・台の札を戻す／台の行は幅いっぱい／Play は卓の幅いっぱい／群は Play の下／Redraw は点の行の右端（卓の外）", { skip }, async (t) => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); srv.close(); });
  const { ctx, page, errors } = await open(browser, url);
  // 札が無いとき：Back は押せない見た目
  assert.equal(await page.evaluate(() => document.getElementById("bBack").disabled), true, "台が空なら Back は押せない");
  await page.locator("#meHand .tile", { hasText: "休" }).first().click();
  await page.locator("#meHand .tile", { hasText: "日" }).first().click();
  assert.equal(await page.locator("#row .tile").count(), 2);
  assert.equal(await page.evaluate(() => document.getElementById("bBack").disabled), false, "札を選ぶと Back が押せる");
  // Back（KJ-090）：卓の外。「あなた ○点 手札」の行の、Redraw のすぐ左。高さは Redraw と同じ・幅 44px 以上・Redraw との間 8px 以上
  const row = await box(page, "#row"), bk = await box(page, "#bBack"), rd0 = await box(page, "#bRedraw"), tb = await box(page, ".table");
  assert.ok(await page.evaluate(() => !document.querySelector(".table").contains(document.getElementById("bBack")) && document.querySelector("#meSide .side-head").contains(document.getElementById("bBack"))), "Back は卓の外で、あなたの点の行の中");
  assert.ok(bk.w >= 44, `Back は幅 44px 以上（${bk.w}）`);
  assert.ok(Math.abs(bk.h - rd0.h) <= 1 && Math.abs(bk.t - rd0.t) <= 1, `Back の高さと位置は Redraw と同じ（${bk.h}・${rd0.h}）`);
  assert.ok(bk.r <= rd0.l - 8 && rd0.l - bk.r <= 16, `Back は Redraw のすぐ左（間 ${rd0.l - bk.r}px）`);
  // 台の行：Back が抜けたので卓の内側の幅いっぱい
  assert.ok(await page.evaluate(() => !document.querySelector(".rowline > button")), "台の行にボタンはない");
  // KJ-093：卓の左に縦書きの見出し（幅 18〜20px＋すきま）があるので、左の余白はその分だけ大きい
  assert.ok(tb.r - row.r <= 14 && row.l - tb.l <= 34, `台の行は卓の幅いっぱい（左右の余白 ${row.l - tb.l}・${tb.r - row.r}）`);
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("bBack")).borderTopWidth), "1px", "枠線付き");
  assert.ok(await page.evaluate(() => !!document.querySelector("#bBack svg") && document.getElementById("bBack").textContent.trim() === "Back"), "左向きの矢印＋Back");
  // Play：卓の幅いっぱい（卓の内側の幅）
  const play = await box(page, "#bRelease"), ops = await box(page, ".ops");
  assert.ok(Math.abs(play.w - ops.w) <= 1, `Play は幅いっぱい（${play.w} / ${ops.w}）`);
  // 群：Play の下に5つが1段
  const set = await page.evaluate(() => ["bSplit", "bJoin", "bInvert", "bCycle", "bHomo"].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { t: Math.round(r.top), l: r.left, r: r.right }; }));
  assert.equal(new Set(set.map((s) => s.t)).size, 1, "群は1段");
  assert.ok(set[0].t >= play.b - 1, "群は Play の下");
  assert.ok(Math.abs(set[0].l - ops.l) <= 1 && Math.abs(set[4].r - ops.r) <= 1, "群は Play と同じ幅に並ぶ");
  assert.equal(await page.evaluate(() => document.querySelectorAll(".ops-main button").length), 1, "Play の段には Play だけ");
  // Redraw：卓の外・「あなた ○点 手札」の行の右端
  const rd = await box(page, "#bRedraw"), sc = await box(page, "#meScore"), me = await box(page, "#meSide");
  assert.ok(await page.evaluate(() => !document.querySelector(".table").contains(document.getElementById("bRedraw")) && document.querySelector("#meSide .side-head").contains(document.getElementById("bRedraw"))), "Redraw は卓の外で、あなたの点の行の中");
  assert.ok(rd.t < sc.b + 20 && rd.b > sc.t - 20 && rd.l > sc.r, "Redraw は点と同じ行の右");
  assert.ok(me.r - rd.r <= 2, `Redraw は行の右端（${me.r - rd.r}px）`);
  assert.match(await page.textContent("#cdRedraw"), /^0pt あと5回$/, "点と回数の表示は今のまま");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= 375), true, "横スクロールがない");
  await shot(page, "kj-090-375-selected.png");
  // Back は今までどおり台の札を全部戻す（1枚のときは最後の1枚を戻す）。カードの「最後の1枚を戻す」は1枚のときの形
  await page.click("#bBack");
  assert.equal(await page.locator("#row .tile").count(), 0, "Back で台が空になる（選んだ札はぜんぶ戻る）");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("Redraw（KJ-078）：1回タップでは引き直さず「長押しで引き直し」と小さく出る／長押しで引き直す／途中で離すと引き直さない／押している間は地が埋まる", { skip }, async (t) => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); srv.close(); });
  const { ctx, page, errors } = await open(browser, url);
  const h0 = await handIds(page);
  // 1回タップ
  await page.click("#bRedraw");
  await page.waitForTimeout(100);
  assert.equal(await handIds(page), h0, "1回タップでは引き直さない");
  assert.equal(await page.textContent("#rdNote"), "長押しで引き直し", "短く案内が出る");
  assert.equal(await page.evaluate(() => __KJ.game.me.redraws || 0), 0, "回数も減らない");
  assert.equal(await page.locator("#msg .why, #msg.rej").count(), 0, "🚫 ではない");
  assert.equal(await page.evaluate(() => document.getElementById("msg").textContent.includes("🚫")), false);
  // 途中で離す（0.3秒）
  await press(page, 300);
  await page.waitForTimeout(500);
  assert.equal(await handIds(page), h0, "途中で離したら引き直さない");
  assert.equal(await page.evaluate(() => document.getElementById("bRedraw").classList.contains("holding")), false, "離したら埋まりも戻る");
  // 押している間：地が左から埋まる（途中の画像）
  const b = await box(page, "#bRedraw");
  await page.mouse.move(b.l + b.w / 2, b.t + b.h / 2);
  await page.mouse.down();
  await page.waitForTimeout(300);
  const w = await page.evaluate(() => { const bt = document.getElementById("bRedraw"); return { cls: bt.classList.contains("holding"), fill: parseFloat(getComputedStyle(bt, "::before").width), full: bt.getBoundingClientRect().width }; });
  assert.equal(w.cls, true);
  assert.ok(w.fill > 4 && w.fill < w.full - 2, `押している間、地が途中まで埋まっている（${Math.round(w.fill)} / ${Math.round(w.full)}）`);
  assert.equal(await handIds(page), h0, "まだ引き直さない");
  await shot(page, "kj-078-375-redraw-holding.png");
  await page.waitForTimeout(500);
  assert.notEqual(await handIds(page), h0, "埋まりきったら引き直す");
  await page.mouse.up();
  assert.equal(await page.textContent("#cdRedraw"), "-5pt あと4回", "1回引き直した（次は -5pt あと4回）");
  assert.equal(await page.evaluate(() => __KJ.game.me.redraws), 1, "指を離しても二重に引き直さない");
  // 長押しの長さは1か所の定数
  assert.match(fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), /const REDRAW_HOLD_MS=600;/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

// 試合の画面の置き場（KJ-090。作者 2026-11-25「バックまで、指が遠い。また、上の3つはほぼ使わないので、仕組みの横に置いてしまう」）
for (const vw of [375, 320]) {
  test(`置き場（KJ-090）${vw}px：上の3つ（もう一度・設定を変える・ログ）は「しくみ」と同じ行／残り時間は CPU の行の右端／上の行は無い／Back と Redraw は画面の中`, { skip }, async (t) => {
    const srv = await serve();
    const url = `http://127.0.0.1:${srv.address().port}/index.html`;
    const browser = await chromium.launch();
    t.after(async () => { await browser.close(); srv.close(); });
    const { ctx, page, errors } = await open(browser, url, { width: vw, height: 800 });
    await page.locator("#meHand .tile", { hasText: "休" }).first().click();
    await page.locator("#meHand .tile", { hasText: "日" }).first().click();
    await shot(page, `kj-090-${vw}-selected.png`);
    // 上の3つ：しくみ と同じ行（高さが重なる）・しくみ の右
    const sm = await box(page, "summary .sm");
    for (const id of ["again", "bSetup", "bLog"]) {
      const b = await box(page, `#${id}`);
      assert.ok(b.t < sm.b && b.b > sm.t, `${id} は「しくみ」と同じ行（${Math.round(b.t)}〜${Math.round(b.b)} / ${Math.round(sm.t)}〜${Math.round(sm.b)}）`);
      assert.ok(b.l >= sm.r, `${id} は「しくみ」の右`);
      assert.ok(b.l >= 0 && b.r <= vw, `${id} は画面の中`);
    }
    // 画面のいちばん上は CPU の行（上の3つの行は無い）
    const cpu = await box(page, "#cpuSide");
    assert.ok(await page.evaluate(() => !document.querySelector("#game > .bar") && !document.querySelector("#game").firstElementChild.querySelector("#again")), "画面の上に3つの行は無い");
    assert.ok(cpu.t < await page.evaluate(() => document.getElementById("msg").getBoundingClientRect().top + 400), "CPU の行が上にある");
    // 残り時間：CPU の行の右端（字の大きさは前のまま）
    const clock = await box(page, "#clock"), cs = await box(page, "#cpuScore");
    assert.ok(await page.evaluate(() => document.querySelector("#cpuSide .side-head").contains(document.getElementById("clock"))), "残り時間は CPU の行の中");
    assert.ok(clock.t < cs.b && clock.b > cs.t && clock.l > cs.r, "残り時間は CPU の点と同じ行の右");
    assert.ok(cpu.r - clock.r <= 2, `残り時間は行の右端（${cpu.r - clock.r}px）`);
    assert.equal(await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector("#clock .n")).fontSize)), 24, "字の大きさは今のまま");
    // Back と Redraw：画面の中・Redraw の左に Back・間 8px 以上
    const bk = await box(page, "#bBack"), rd = await box(page, "#bRedraw");
    assert.ok(bk.l >= 0 && rd.r <= vw, `Back・Redraw は画面の中（${Math.round(bk.l)}〜${Math.round(rd.r)} / ${vw}）`);
    assert.ok(bk.r <= rd.l - 8, `Back は Redraw の左・間 8px 以上（${rd.l - bk.r}）`);
    assert.ok(bk.w >= 44 && Math.abs(bk.h - rd.h) <= 1, `Back は幅 44px 以上・高さは Redraw と同じ（${bk.w}×${bk.h}・${rd.h}）`);
    const me = await box(page, "#meSide");
    assert.ok(rd.r <= me.r + 1, "Redraw は行の右端を越えない");
    // 押すと戻る・Redraw の長押しは今のまま
    await page.click("#bBack");
    assert.equal(await page.locator("#row .tile").count(), 0, "Back で台の札が戻る");
    const h0 = await handIds(page);
    await press(page, 100);
    assert.equal(await handIds(page), h0, "短く離すと引き直さない（長押しは今のまま）");
    await press(page, 1000);
    assert.notEqual(await handIds(page), h0, "長押しで引き直す");
    // 上の3つが押せる：ログが開く（ログの欄は上の3つの上に出る）
    await page.click("#bLog");
    assert.equal(await page.evaluate(() => document.getElementById("logPanel").classList.contains("on")), true, "ログが開く");
    await page.click("#bLog");
    // しくみを開くと、中身は上の3つの下に出る。上の3つを押しても開閉しない
    const open0 = await page.evaluate(() => document.querySelector("details").open);
    assert.equal(open0, false);
    await page.click("#bLog"); await page.click("#bLog");
    assert.equal(await page.evaluate(() => document.querySelector("details").open), false, "上の3つを押してもしくみは開かない");
    await page.click("summary .sm");
    assert.equal(await page.evaluate(() => document.querySelector("details").open), true, "しくみを押すと開く");
    const how = await box(page, "#howto"), bl = await box(page, "#bLog");
    assert.ok(how.t >= bl.b - 1, "しくみの中身は上の3つの行の下に出る");
        assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test("置き場（KJ-090）：試合の終わりの面が出ているあいだも、上の3つは画面の上に出て押せる", { skip }, async (t) => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); srv.close(); });
  const { ctx, page, errors } = await open(browser, url);
  await page.evaluate(() => { __KJ.game.cpu.score = 50; });
  await page.locator("#meHand .tile", { hasText: "休" }).first().click();
  await page.locator("#meHand .tile", { hasText: "日" }).first().click();
  await page.click("#bRelease");
  await page.waitForSelector("#endShow.on");
  const b = await box(page, "#again");
  assert.ok(b.t >= 0 && b.b <= 60, `上の3つは画面の上に出ている（${Math.round(b.t)}〜${Math.round(b.b)}）`);
  await page.click("#again"); // 面に隠れない
  assert.equal(await page.evaluate(() => document.getElementById("endShow").classList.contains("on")), false, "面が出ているあいだも押せる");
  assert.equal(await page.evaluate(() => document.body.classList.contains("esOn")), false, "面が閉じたら上の留めは外れる");
  assert.ok((await box(page, "#again")).t > 100, "閉じたら「しくみ」の行へ戻る");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("置き場（KJ-090）：はじめる前の画面に上の3つ・ログの欄は出ない／360px で点が -15 でも Back・Redraw は画面の中／選びの一覧が出ていても Back は押せる／CPU の行の長い文は残り時間に切られない", { skip }, async (t) => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); srv.close(); });
  // はじめる前
  const ctx0 = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const p0 = await ctx0.newPage();
  await p0.goto(url);
  await p0.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
  for (const id of ["again", "bSetup", "bLog"]) assert.equal(await p0.isVisible(`#${id}`), false, `はじめる前に ${id} は出ない`);
  assert.equal(await p0.isVisible("#logPanel"), false);
  await ctx0.close();
  // 360px・-15点
  const { ctx, page, errors } = await open(browser, url, { width: 360, height: 800 });
  await page.evaluate(() => { __KJ.game.me.score = -15; __KJ.render(); });
  const bk = await box(page, "#bBack"), rd = await box(page, "#bRedraw"), me = await box(page, "#meSide");
  assert.ok(rd.r <= 360 && rd.r <= me.r + 1 && bk.l >= 0, `360px・-15点でも Back・Redraw は欄の中（${Math.round(rd.r)} / ${Math.round(me.r)}）`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "横スクロールが出ない");
  // CPU の行：高さは変わらない。「相手の通信が切れた」は切れず、出ているあいだは残り時間を引っ込める
  const h0 = (await box(page, "#cpuSide")).h;
  // 描き直しの時計に上書きされないよう、1回の評価の中で入れて測る
  const gone = await page.evaluate(() => { const e = document.getElementById("cpuCds"); e.textContent = "相手の通信が切れた"; e.className = "cds gone"; return { cut: e.scrollWidth > e.clientWidth + 1, clock: getComputedStyle(document.getElementById("clock")).display }; });
  assert.equal(gone.cut, false, "「相手の通信が切れた」が切れない");
  assert.equal(gone.clock, "none", "出ているあいだは残り時間を引っ込める");
  const wait = await page.evaluate(() => { const e = document.getElementById("cpuCds"); e.textContent = "待ち：反転 9・巡り 9・同音 9"; e.className = "cds"; return document.getElementById("cpuSide").getBoundingClientRect().height; });
  assert.ok(Math.abs(wait - h0) <= 1, "待ちが出ても CPU の行の高さは変わらない（卓が上下しない）");
  await page.evaluate(() => { document.getElementById("cpuCds").textContent = ""; });
  // 選びの一覧が出ていても Back を押せる
  await page.evaluate(() => { __KJ.game.me.score = 0; __KJ.render(); });
  await page.locator("#meHand .tile", { hasText: "天" }).first().click();
  await page.evaluate(() => { const c = document.getElementById("choices"); c.classList.add("on"); c.dataset.kind = "homo"; c.innerHTML = '<div class="g"><span>x</span>' + [..."山川玉回代県借天上下口日"].map((x) => `<button>${x}</button>`).join("") + "</div>"; });
  // 一覧の字は Back・Redraw と重ならない（隠れて選べなくならない）
  const bb = await box(page, "#bBack"), rr = await box(page, "#bRedraw");
  const hit = await page.evaluate(([a, b]) => [...document.querySelectorAll("#choices button")].filter((e) => { const r = e.getBoundingClientRect(); return [a, b].some((q) => r.left < q.r && r.right > q.l && r.top < q.b && r.bottom > q.t); }).length, [bb, rr]);
  assert.equal(hit, 0, "一覧の字が Back・Redraw の下に隠れない");
  await page.click("#bBack");
  assert.equal(await page.locator("#row .tile").count(), 0, "一覧が出ていても Back で戻る");
  assert.deepEqual(errors, []);
  await ctx.close();
});
