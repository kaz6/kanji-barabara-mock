// 合言葉の部屋の再戦と何勝何敗の画面（KJ-141）：終わりの「もう一度」で同じ相手ともう一試合（二人とも押したら始まる・押した側は「相手を待っています」）・
// 終わりの画面に「この相手と 2勝1敗」・相手が抜けたら「相手が抜けた」と出て、もう一度ではじめる前の画面へ・CPU 戦には出ない。
// kj_claims は page.route で Node の中の偽物（主キーの先着）に回し、Realtime は差し替え。本物の Supabase には出さない。
// KJ_SHOT_REMATCH=<フォルダ> で画像（待っている画面・何勝何敗の出た終わりの画面）を書く。Playwright の Chromium がないと skip になる。skip は「通った」ではない
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
const SHOT = process.env.KJ_SHOT_REMATCH || "";

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

test("KJ-141 合言葉の部屋の再戦と何勝何敗（画面）", { skip, timeout: 120000 }, async (t) => {
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
    await page.check('#opp input[value="room"]');
    return { ctx, page, errors };
  };
  const click = (P, id) => P.page.evaluate((i) => document.getElementById(i).click(), id);
  const text = (P, id) => P.page.evaluate((i) => document.getElementById(i).textContent, id);
  const gameId = (P) => P.page.evaluate(() => __KJ.game.match.id);
  // 試合を時間切れで終える：score の高い方が勝つ（hostPts／guestPts は、放つ言葉 学生＝3点 を放つか、放たない）
  async function playAndEnd(A, B, winner, word = "学生", pts = 3) {
    const W = winner === "host" ? A : B;
    await W.page.evaluate((w) => { const G = __KJ.game; G.me.cards = [...w].map((c, i) => ({ id: 9100 + i, c, t: 0, fresh: false })); __KJ.render(); }, word);
    for (const c of word) await W.page.locator("#meHand .tile", { hasText: c }).first().click();
    await W.page.click("#bRelease");
    await W.page.waitForFunction((n) => __KJ.game.me.score === n, pts);
    for (const P of [A, B]) await P.page.evaluate(() => { const G = __KJ.game; G.endsAt = G.now() - 0.1; });
    for (const P of [A, B]) await P.page.waitForFunction(() => __KJ.game.over, null, { timeout: 9000 });
  }

  const A = await mk(), B = await mk();
  await A.page.check('#act input[value="host"]');
  await A.page.waitForSelector("#roomShow:not([hidden])");
  const code = (await text(A, "roomShow")).trim();
  await B.page.check('#act input[value="enter"]');
  await B.page.fill("#roomCode", code);
  await B.page.click("#bEnter");
  for (const P of [A, B]) await P.page.waitForSelector("#game:not([hidden])", { timeout: 8000 });
  const id1 = await gameId(A);
  const set1 = await A.page.evaluate(() => [__KJ.game.level, __KJ.game.timeLimit]);

  await t.test("1戦目：A の勝ち。終わりの画面に「この相手と 1勝0敗／0勝1敗」。ログの頭は 1戦目", async () => {
    await playAndEnd(A, B, "host");
    assert.equal(await text(A, "esTally"), "この相手と 1勝0敗");
    assert.equal(await text(B, "esTally"), "この相手と 0勝1敗");
    assert.match(await text(A, "msg"), /勝ち/);
    for (const P of [A, B]) { await P.page.click("#bLog"); assert.match(await P.page.inputValue("#logText"), /# この相手と 1戦目/); await P.page.click("#bLog"); }
    assert.equal(await A.page.evaluate(() => __KJ.rematch !== null && __KJ.mc === null), true, "つなぎは再戦の受け付けに替わった");
  });

  await t.test("A だけ「もう一度」を押す：「相手を待っています」。まだ始まらない。もう一度押しても何も増えない", async () => {
    await click(A, "again");
    await A.page.waitForFunction(() => document.getElementById("msg").textContent === "相手を待っています");
    assert.equal(await text(A, "esRematch"), "相手を待っています", "終わりの画面が出ているあいだも見える");
    assert.equal(await text(B, "esRematch"), "");
    if (SHOT) await A.page.screenshot({ path: path.join(SHOT, "rematch-waiting-375.png") });
    await click(A, "again");
    await new Promise((r) => setTimeout(r, 700));
    assert.equal(await gameId(A), id1, "始まっていない");
    assert.equal(await A.page.evaluate(() => __KJ.game.over), true);
    assert.equal([...store.values()].filter((r) => r.payload && r.payload.type === "again").length, 1, "again は1つだけ");
    assert.notEqual(await text(B, "msg"), "相手を待っています", "押していない B には出ない");
  });

  await t.test("B も押す：二人とも同じ新しい match_id・同じ場・同じレベルと時間で2戦目が始まる。ログは 2戦目", async () => {
    await click(B, "again");
    for (const P of [A, B]) await P.page.waitForFunction((old) => __KJ.game && !__KJ.game.over && __KJ.game.match.id !== old, id1, { timeout: 9000 });
    const [a, b] = [await gameId(A), await gameId(B)];
    assert.equal(a, b); assert.notEqual(a, id1);
    const field = (P) => P.page.evaluate(() => __KJ.game.field.map((x) => x.c).join(""));
    assert.equal(await field(A), await field(B), "二人で同じ場");
    for (const P of [A, B]) assert.deepEqual(await P.page.evaluate(() => [__KJ.game.level, __KJ.game.timeLimit]), set1, "同じレベル・時間");
    assert.equal(await A.page.evaluate(() => [__KJ.mc !== null, __KJ.rematch]).then((x) => x[0] && x[1] === null), true, "新しい試合のつなぎがある");
    for (const P of [A, B]) { await P.page.click("#bLog"); assert.match(await P.page.inputValue("#logText"), /# この相手と 2戦目/); await P.page.click("#bLog"); }
    assert.equal(await text(A, "msg") === "相手を待っています", false, "待ちの一言は消える");
    // 新しい試合の点は 0 から。新しい match_id で先着が働く：A が言葉を放って場から取ると、B の画面の場からも消え、点が届く
    assert.equal(await A.page.evaluate(() => __KJ.game.me.score), 0);
    await A.page.evaluate(() => { const G = __KJ.game; G.me.cards = [..."学生"].map((c, i) => ({ id: 9100 + i, c, t: 0, fresh: false })); __KJ.render(); });
    await A.page.locator("#meHand .tile", { hasText: "学" }).click();
    await A.page.locator("#meHand .tile", { hasText: "生" }).click();
    await A.page.click("#bRelease");
    await A.page.waitForFunction(() => __KJ.game.me.score === 3 && __KJ.game.me.takes > 0);
    await A.page.click("#field .tile >> nth=0");
    await B.page.waitForFunction(() => !__KJ.game.field.some((x) => x.n === 0) && /3 点/.test(document.getElementById("cpuScore").textContent), null, { timeout: 5000 });
    assert.equal(await A.page.evaluate(() => __KJ.game.field.some((x) => x.n === 0)), false);
  });

  await t.test("2戦目：B の勝ち。二人とも「この相手と 1勝1敗」", async () => {
    await playAndEnd(A, B, "guest", "大学生", 9); // A は 学生 の3点・B はそれより多い 大学生 の9点
    assert.equal(await text(A, "esTally"), "この相手と 1勝1敗");
    assert.equal(await text(B, "esTally"), "この相手と 1勝1敗");
    if (SHOT) {
      await A.page.waitForSelector("#endShow.on");
      await A.page.screenshot({ path: path.join(SHOT, "rematch-tally-375.png") });
    }
    assert.equal(await A.page.evaluate(() => JSON.stringify(__KJ.roomTally)), JSON.stringify({ tally: { w: 1, l: 1, d: 0 }, round: 2 }));
  });

  await t.test("3戦目：引き分けは「1勝1敗1分」。tally は部屋にいるあいだだけ（端末には覚えない）", async () => {
    await click(A, "again"); await click(B, "again");
    for (const P of [A, B]) await P.page.waitForFunction(() => __KJ.game && !__KJ.game.over && __KJ.game.match.id && __KJ.roomTally.round === 3, null, { timeout: 9000 });
    for (const P of [A, B]) await P.page.evaluate(() => { const G = __KJ.game; G.endsAt = G.now() - 0.1; });
    for (const P of [A, B]) await P.page.waitForFunction(() => __KJ.game.over, null, { timeout: 9000 });
    assert.equal(await text(A, "esTally"), "この相手と 1勝1敗1分");
    assert.equal(await text(B, "esTally"), "この相手と 1勝1敗1分");
    for (const P of [A, B]) assert.equal(await P.page.evaluate(() => Object.keys(localStorage).filter((k) => /tally|rematch|round/i.test(k) || /勝/.test(localStorage.getItem(k) || "")).length), 0);
  });

  await t.test("B が「設定を変える」で抜けると、A に「相手が抜けた」。A の「もう一度」ははじめる前の画面へ（部屋は残らない）", async () => {
    await click(B, "bSetup");
    await A.page.waitForFunction(() => document.getElementById("msg").textContent === "相手が抜けた", null, { timeout: 6000 });
    assert.equal(await text(A, "esRematch"), "相手が抜けた");
    assert.equal(await B.page.evaluate(() => [__KJ.rematch, __KJ.roomTally]).then((x) => x[0] === null && x[1] === null), true, "B は部屋を出た（何勝何敗も消える）");
    await click(A, "again");
    assert.equal(await A.page.isVisible("#setup"), true);
    assert.equal(await A.page.evaluate(() => [__KJ.rematch, __KJ.roomTally, __KJ.mc]).then((x) => x.every((v) => v === null)), true);
    assert.equal(await A.page.locator("#act input:checked").count(), 0, "作る／入るは選ばれていない");
  });

  await t.test("部屋を出て作り直すと、何勝何敗は 0 から・1戦目に戻る", async () => {
    await A.page.check('#act input[value="host"]');
    await A.page.waitForSelector("#roomShow:not([hidden])");
    const c2 = (await text(A, "roomShow")).trim();
    await B.page.check('#act input[value="enter"]');
    await B.page.fill("#roomCode", c2);
    await B.page.click("#bEnter");
    for (const P of [A, B]) await P.page.waitForSelector("#game:not([hidden])", { timeout: 8000 });
    assert.equal(await A.page.evaluate(() => __KJ.roomTally.round), 1);
    await playAndEnd(A, B, "host");
    assert.equal(await text(A, "esTally"), "この相手と 1勝0敗");
    for (const P of [A, B]) assert.deepEqual(P.errors, []);
  });

  await t.test("試合の途中で「もう一度」を押すと、今までどおり抜けて はじめる前の画面へ", async () => {
    await click(A, "again"); await click(B, "again");
    for (const P of [A, B]) await P.page.waitForFunction(() => __KJ.game && !__KJ.game.over && __KJ.roomTally.round === 2, null, { timeout: 9000 });
    await click(A, "again"); // 遊んでいる途中
    assert.equal(await A.page.isVisible("#setup"), true);
    await B.page.waitForFunction(() => document.getElementById("cpuCds").textContent === "相手の通信が切れた", null, { timeout: 6000 });
    await A.ctx.close(); await B.ctx.close();
  });

  await t.test("CPU 戦には何勝何敗が出ず、「もう一度」は今までどおりすぐ始まる", async () => {
    const C = await mk();
    await C.page.check('#opp input[value="cpu"]');
    await C.page.evaluate(() => document.getElementById("start").click());
    await C.page.waitForSelector("#game:not([hidden])");
    await C.page.evaluate(() => { const G = __KJ.game; G.endsAt = G.now() - 0.1; });
    await C.page.waitForFunction(() => __KJ.game.over, null, { timeout: 9000 });
    assert.equal(await text(C, "esTally"), "");
    assert.equal(await C.page.evaluate(() => [__KJ.rematch, __KJ.roomTally]).then((x) => x[0] === null && x[1] === null), true);
    await click(C, "again");
    await C.page.waitForFunction(() => __KJ.game && !__KJ.game.over);
    assert.equal(await text(C, "esTally"), "");
    assert.deepEqual(C.errors, []);
    await C.ctx.close();
  });
});
