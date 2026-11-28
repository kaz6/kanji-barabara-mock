// 合言葉の部屋のエモートの画面（KJ-142）：自分の行の小さな印のボタン→4つの言葉→選ぶと送って閉じる。二人の画面の送った人の行の近くに朱の角判が約1.5秒出て消える（押せない）。
// 送ったあと3秒は押せない・歯車の「エモート」を切にすると自分のボタンも相手のエモートも出ない・CPU 戦・ひとり・チュートリアルでは出ない・ログに手「エモート」。
// kj_claims は page.route で Node の中の偽物（主キーの先着）に回し、Realtime は差し替え。本物の Supabase には出さない。
// KJ_SHOT_EMOTE=<フォルダ> で画像（4つ並んだところ・判子が出たところ。375×667 と 320px）を書く。Playwright の Chromium がないと skip になる。skip は「通った」ではない。
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
const SHOT = process.env.KJ_SHOT_EMOTE || "";

const TYPES = { ".css": "text/css; charset=utf-8", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".mp3": "audio/mpeg", ".wav": "audio/wav" };
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
function fakeClaims() {
  const store = new Map();
  const pk = (r) => [r.match_id, r.kind, r.key].join("\u0000");
  let tick = Date.now();
  const handler = async (route) => {
    const req = route.request(), u = new URL(req.url());
    if (req.method() === "POST") {
      const row = JSON.parse(req.postData());
      if (store.has(pk(row))) return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ code: "23505" }) });
      tick += 10;
      const r = { ...row, created_at: new Date(Math.max(tick, Date.now())).toISOString().replace("Z", "+00:00") };
      store.set(pk(r), r);
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify([r]) });
    }
    const eq = (k) => { const v = u.searchParams.get(k); return v === null ? null : v.replace(/^eq\./, ""); };
    const since = u.searchParams.get("created_at");
    let rows = [...store.values()].filter((r) => r.match_id === eq("match_id") && (eq("kind") === null || r.kind === eq("kind")) && (eq("key") === null || r.key === eq("key")));
    if (since) rows = rows.filter((r) => Date.parse(r.created_at) >= Date.parse(since.replace(/^gte\./, "")));
    rows.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
  };
  return { store, handler };
}


test("KJ-142 合言葉の部屋のエモート（画面）", { skip, timeout: 120000 }, async (t) => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); srv.close(); });
  if (SHOT) fs.mkdirSync(SHOT, { recursive: true });

  const { store, handler } = fakeClaims();
  const mk = async () => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error" && !/status of 409/.test(m.text())) errors.push(m.text()); });
    await page.route("https://ysxrdhzybzvucxwdqchw.supabase.co/rest/v1/kj_claims**", handler);
    await page.route("https://cdn.jsdelivr.net/**", (r) => { errors.push("CDN を読みに行った"); return r.abort(); });
    await page.addInitScript(() => {
      try { localStorage.setItem("kj-tutorial", "1"); } catch (e) { /* 読めない端末 */ }
      window.__KJ_POLL_MS = 150;
      window.supabase = { createClient: () => ({ channel: () => { const ch = { on: () => ch, subscribe: (cb) => { setTimeout(() => cb("CHANNEL_ERROR"), 0); return ch; }, unsubscribe: () => {} }; return ch; } }) };
    });
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
    return { ctx, page, errors };
  };
  const vis = (P, sel) => P.page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden"; }, sel);
  const text = (P, id) => P.page.evaluate((i) => document.getElementById(i).textContent, id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---- CPU 戦では出ない（設定にはある） ----
  const C = await mk();
  assert.equal(await C.page.evaluate(() => document.getElementById("emoteSet").querySelectorAll("input").length), 2, "歯車の欄に 入／切 がある");
  assert.equal(await C.page.evaluate(() => document.getElementById("emoteSet").querySelector("input:checked").value), "1", "初めは入");
  await C.page.click("#start");
  await C.page.waitForSelector("#game:not([hidden])");
  assert.equal(await vis(C, "#emote"), false, "CPU 戦にはボタンが出ない");
  assert.equal(await vis(C, "#bEmote"), false);
  await C.ctx.close();

  // ---- 合言葉の部屋 ----
  const A = await mk(), B = await mk();
  for (const P of [A, B]) await P.page.check('#opp input[value="room"]');
  await A.page.check('#act input[value="host"]');
  await A.page.waitForSelector("#roomShow:not([hidden])");
  const code = (await text(A, "roomShow")).trim();
  await B.page.check('#act input[value="enter"]');
  await B.page.fill("#roomCode", code);
  await B.page.click("#bEnter");
  for (const P of [A, B]) await P.page.waitForSelector("#game:not([hidden])", { timeout: 8000 });

  await t.test("試合中、自分の行に小さな印のボタンが1つ。初めは言葉は閉じている。読み上げの名前がある", async () => {
    for (const P of [A, B]) {
      assert.equal(await vis(P, "#emote"), true);
      assert.equal(await vis(P, "#bEmote"), true);
      assert.equal(await vis(P, "#emoteRow"), false);
      assert.equal(await P.page.getAttribute("#bEmote", "aria-label"), "エモートを送る");
      assert.equal(await P.page.evaluate(() => document.getElementById("bEmote").closest("#meSide .side-head") !== null), true, "「あなた ○点」の行の中");
    }
  });

  await t.test("押すと4つの言葉が並ぶ（上手！・矢場！・雑魚！・降参！）。375×667 で手札やほかのボタンと重ならない", async () => {
    await A.page.click("#bEmote");
    assert.equal(await vis(A, "#emoteRow"), true);
    assert.deepEqual(await A.page.evaluate(() => [...document.querySelectorAll("#emoteRow .emw")].map((b) => b.textContent)), ["上手！", "矢場！", "雑魚！", "降参！"]);
    assert.equal(await A.page.getAttribute("#bEmote", "aria-expanded"), "true");
    const box = await A.page.evaluate(() => {
      const r = document.getElementById("emoteRow").getBoundingClientRect(), h = document.getElementById("meHand").getBoundingClientRect(), v = document.documentElement.clientWidth;
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, handTop: h.top, vw: v };
    });
    assert.ok(box.bottom <= box.handTop, "手札の上に出る（手札は隠さない）");
    assert.ok(box.left >= 0 && box.right <= box.vw, "画面からはみ出さない");
    if (SHOT) await A.page.screenshot({ path: path.join(SHOT, "emote-open-375.png") });
    await A.page.setViewportSize({ width: 320, height: 640 });
    const b2 = await A.page.evaluate(() => { const r = document.getElementById("emoteRow").getBoundingClientRect(); return { l: r.left, r: r.right, vw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth, bw: [...document.querySelectorAll("#emoteRow .emw")].every((b) => b.scrollWidth <= b.clientWidth + 1) }; });
    assert.ok(b2.l >= 0 && b2.r <= b2.vw, "320px でもはみ出さない " + JSON.stringify(b2)); // ページ全体の横幅は 320px では札の列が今も少し越える（main のときから。エモートとは別）
    assert.equal(b2.bw, true, "言葉が切れない");
    if (SHOT) await A.page.screenshot({ path: path.join(SHOT, "emote-open-320.png") });
    await A.page.setViewportSize({ width: 375, height: 667 });
  });

  await t.test("言葉を選ぶと送って閉じる：A の画面の自分の行の近く・B の画面の相手の行の近くに朱の角判。約1.5秒で消える。押せない（下の札を押せる）", async () => {
    await A.page.click('#emoteRow .emw[data-i="1"]');
    assert.equal(await vis(A, "#emoteRow"), false, "選ぶと閉じる");
    await A.page.waitForSelector("#emMe.on");
    await B.page.waitForSelector("#emOpp.on", { timeout: 5000 });
    assert.equal(await text(A, "emMe"), "矢場！");
    assert.equal(await text(B, "emOpp"), "矢場！");
    assert.equal(await vis(A, "#emOpp"), false, "自分の判子は自分の行だけ");
    assert.equal(await vis(B, "#emMe"), false);
    const st = await A.page.evaluate(() => { const e = document.getElementById("emMe"), cs = getComputedStyle(e), h = document.querySelector("#meSide .side-head").getBoundingClientRect(), r = e.getBoundingClientRect(); return { pe: cs.pointerEvents, color: cs.color, border: cs.borderTopColor, bs: cs.borderTopStyle, rb: r.bottom, ht: h.top, rl: r.left, rr: r.right, vw: document.documentElement.clientWidth }; });
    assert.equal(st.pe, "none"); assert.equal(st.bs, "double");
    assert.equal(st.color, await A.page.evaluate(() => getComputedStyle(document.getElementById("nope").querySelector(".no-ic")).color), "否 の判子と同じ朱");
    assert.ok(Math.abs(st.rb - st.ht) < 8, "自分の行のすぐ上");
    assert.ok(st.rl >= 0 && st.rr <= st.vw);
    const sb = await B.page.evaluate(() => { const r = document.getElementById("emOpp").getBoundingClientRect(), h = document.querySelector("#cpuSide .side-head").getBoundingClientRect(); return { rt: r.top, hb: h.bottom, rr: r.right, vw: document.documentElement.clientWidth }; });
    assert.ok(Math.abs(sb.rt - sb.hb) < 8, "相手の行のすぐ下");
    assert.ok(sb.rr <= sb.vw);
    // 判子が出ている間も、遊びの手（札を選ぶ）ができる
    await A.page.locator("#meHand .tile").first().click();
    assert.ok((await A.page.evaluate(() => __KJ.row.length)) >= 1, "判子のあいだも札を選べる");
    await A.page.locator("#meHand .tile").first().click();
    if (SHOT) { await A.page.screenshot({ path: path.join(SHOT, "emote-stamp-me-375.png") }); await B.page.screenshot({ path: path.join(SHOT, "emote-stamp-opp-375.png") }); }
    await A.page.waitForFunction(() => !document.getElementById("emMe").classList.contains("on"), null, { timeout: 4000 });
    await B.page.waitForFunction(() => !document.getElementById("emOpp").classList.contains("on"), null, { timeout: 4000 });
  });

  await t.test("送ったあと3秒は押せない（ボタンが押せない見え方）。待てば押せる", async () => {
    // 送ってからの時間は、A の時計で数える（判子が消えるころはまだ待ち時間）
    assert.equal(await A.page.evaluate(() => document.getElementById("bEmote").disabled), true);
    await A.page.evaluate(() => document.getElementById("bEmote").click());
    assert.equal(await vis(A, "#emoteRow"), false, "待ち時間のあいだは開かない");
    await A.page.waitForFunction(() => !document.getElementById("bEmote").disabled, null, { timeout: 5000 });
    await A.page.click("#bEmote");
    assert.equal(await vis(A, "#emoteRow"), true);
    await A.page.click("#bEmote");
    assert.equal(await vis(A, "#emoteRow"), false, "もう一度押すと閉じる");
    assert.equal([...store.values()].filter((r) => r.payload && r.payload.type === "emote").length, 1, "送ったのは1つだけ");
  });

  await t.test("B が歯車で「エモート」を切にすると、B のボタンは出ず、A のエモートも B に出ない。A には判子が出る", async () => {
    await B.page.evaluate(() => { const i = document.querySelector('#emoteSet input[value="0"]'); i.checked = true; i.dispatchEvent(new Event("change", { bubbles: true })); });
    assert.equal(await B.page.evaluate(() => localStorage.getItem("kj-emote")), "0");
    assert.equal(await vis(B, "#emote"), false);
    assert.equal(await vis(A, "#emote"), true);
    await A.page.click("#bEmote");
    await A.page.click('#emoteRow .emw[data-i="3"]');
    await A.page.waitForSelector("#emMe.on");
    assert.equal(await text(A, "emMe"), "降参！");
    await B.page.waitForFunction(() => __KJ.game.log.some((e) => e.op === "エモート" && e.note === "降参！"), null, { timeout: 5000 });
    assert.equal(await vis(B, "#emOpp"), false, "切のときは相手のエモートを出さない");
    await B.page.evaluate(() => { const i = document.querySelector('#emoteSet input[value="1"]'); i.checked = true; i.dispatchEvent(new Event("change", { bubbles: true })); });
    assert.equal(await vis(B, "#emote"), true, "入に戻すとボタンが出る");
  });

  await t.test("ログに手「エモート」：送ったのと届いたの両方（メモに言葉）。コピーしたログにも入る", async () => {
    for (const P of [A, B]) {
      const rows = await P.page.evaluate(() => __KJ.game.log.filter((e) => e.op === "エモート").map((e) => [e.who, e.note]));
      assert.deepEqual(rows.map((r) => r[1]), ["矢場！", "降参！"]);
    }
    assert.deepEqual(await A.page.evaluate(() => __KJ.game.log.filter((e) => e.op === "エモート").map((e) => e.who)), ["あなた", "あなた"]);
    assert.deepEqual(await B.page.evaluate(() => __KJ.game.log.filter((e) => e.op === "エモート").map((e) => e.who)), ["相手", "相手"]);
    await B.page.click("#bLog");
    assert.match(await B.page.inputValue("#logText"), /エモート[\s\S]*降参！/);
    await B.page.click("#bLog");
  });

  await t.test("320px でも判子が画面に収まる（相手の行の下・自分の行の上）", async () => {
    await A.page.waitForFunction(() => !document.getElementById("bEmote").disabled, null, { timeout: 5000 });
    for (const P of [A, B]) await P.page.setViewportSize({ width: 320, height: 640 });
    await A.page.click("#bEmote");
    await A.page.click('#emoteRow .emw[data-i="2"]');
    await A.page.waitForSelector("#emMe.on");
    await B.page.waitForSelector("#emOpp.on", { timeout: 5000 });
    for (const [P, id] of [[A, "emMe"], [B, "emOpp"]]) {
      const r = await P.page.evaluate((i) => { const b = document.getElementById(i).getBoundingClientRect(); return [b.left, b.right, document.documentElement.clientWidth]; }, id);
      assert.ok(r[0] >= 0 && r[1] <= r[2], `${id} が 320px に収まる ${r}`);
    }
    if (SHOT) { await A.page.screenshot({ path: path.join(SHOT, "emote-stamp-me-320.png") }); await B.page.screenshot({ path: path.join(SHOT, "emote-stamp-opp-320.png") }); }
    for (const P of [A, B]) await P.page.setViewportSize({ width: 375, height: 667 });
  });

  await t.test("English のときも言葉は日本語のまま（ボタンの読み上げは English）", async () => {
    await A.page.evaluate(() => localStorage.setItem("kj-lang", "en"));
    assert.deepEqual(await A.page.evaluate(() => window.KJ_STR.EMOTES.slice()), ["上手！", "矢場！", "雑魚！", "降参！"]);
  });

  await t.test("試合が終わるとボタンも判子も消える。ブラウザのエラーなし", async () => {
    for (const P of [A, B]) await P.page.evaluate(() => { const G = __KJ.game; G.endsAt = G.now() - 0.1; });
    for (const P of [A, B]) await P.page.waitForFunction(() => __KJ.game.over, null, { timeout: 9000 });
    for (const P of [A, B]) { assert.equal(await vis(P, "#emote"), false); assert.equal(await vis(P, "#emoteRow"), false); }
    for (const P of [A, B]) assert.deepEqual(P.errors, []);
  });
});
