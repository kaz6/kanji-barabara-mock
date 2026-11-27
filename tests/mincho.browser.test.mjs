// KJ-131：「明朝体」を放つと、その試合の終わりまで札の字が明朝に替わる（ページをめくる演出）。
// 替える前の写し（.flip）が重なり、右端を軸に左へめくれて 1 秒以内に消える・めくっている間も札を押せる（写しは pointer-events:none）・
// 動きを減らす設定では写しが出ず一度に替わる・設定（kj-face）は書き換えず試合が終わると設定に戻る・戦況に1行・合言葉の部屋では相手のページも替わる。
// Playwright の Chromium がないと skip になる。skip は「通った」ではない。KJ_SHOT_MINCHO=<フォルダ> で めくり途中（0.4秒ほど）と後の画像を書く
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
const SHOT = process.env.KJ_SHOT_MINCHO || "";

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

// CPU 戦（とても弱い）を N4 で始める。CPU は動かさない・手札と場を決める。reduce＝動きを減らす設定。face＝端末の設定（kj-face）
async function begin(browser, url, { hand = "明朝体大正年年", reduce = false, face = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 700 }, reducedMotion: reduce ? "reduce" : "no-preference" });
  await ctx.addInitScript((f) => { try { localStorage.setItem("kj-tutorial", "1"); if (f) localStorage.setItem("kj-face", f); } catch (e) { /* 読めない端末 */ } }, face);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
  await page.check('#lvl input[value="N4"]');
  await page.check('#opp input[value="cpu"]');
  await page.check('#pow input[value="weak"]');
  await page.click("#start");
  await page.evaluate((h) => {
    const G = __KJ.game; G.cpuTurn = () => null;
    G.me.cards = [...h].map((c, i) => ({ id: 9000 + i, c, t: 0, fresh: false }));
    G.field = [..."山川玉"].map((c, i) => ({ id: 9500 + i, c, t: 0, fresh: false }));
    G.deck.splice(0, G.deck.length, ...Array(60).fill("一"));
    __KJ.render();
  }, hand);
  return { ctx, page, errors };
}
const tap = (page, ch) => page.locator("#meHand .tile:not(.sel)", { hasText: ch }).first().click();
const dataFace = (page) => page.evaluate(() => document.documentElement.getAttribute("data-face"));
const flips = (page) => page.evaluate(() => document.querySelectorAll(".flip").length);
async function throwWord(page, w) { for (const ch of w) await tap(page, ch); await page.click("#bRelease"); }

test("明朝体の画面（KJ-131）", { skip }, async (t) => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); srv.close(); });

  await t.test("放つと 写しが重なり（右端が軸・裏は紙の色・押せない）、下は明朝に。1 秒以内に消える。めくっている間も札を取れる。設定は書き換えない", async () => {
    const { ctx, page, errors } = await begin(browser, url);
    assert.equal(await dataFace(page), "taisho", "はじめは大正風");
    assert.equal(await flips(page), 0);
    await throwWord(page, "明朝体");
    const st = await page.evaluate(() => {
      const w = document.querySelector(".flip"), pg = w && w.querySelector(".flip-pg"), f = w && w.querySelector(".flip-f"), b = w && w.querySelector(".flip-b");
      const cs = (e) => getComputedStyle(e);
      return w ? {
        n: document.querySelectorAll(".flip").length,
        origin: cs(pg).transformOrigin, pe: cs(w).pointerEvents, anim: cs(pg).animationName, dur: cs(pg).animationDuration,
        bfF: cs(f).backfaceVisibility, bfB: cs(b).backfaceVisibility, backBg: cs(b).backgroundColor, rootBg: cs(document.body).backgroundColor,
        hasGame: !!f.querySelector("#game"), hasShadow: !!w.querySelector(".flip-sh"), aria: w.getAttribute("aria-hidden"),
        box: [w.getBoundingClientRect().width, document.getElementById("game").getBoundingClientRect().width],
        face: document.documentElement.getAttribute("data-face"),
      } : null;
    });
    assert.ok(st, "写しが出る");
    assert.equal(st.n, 1);
    assert.equal(st.face, "mincho", "写しを重ねたあとで、下は明朝に替わっている");
    assert.equal(st.pe, "none", "写しは押せない");
    assert.equal(st.anim, "flipTurn");
    assert.equal(st.dur, "0.8s", "0.8 秒ほど（仮）");
    assert.match(st.origin, /^(100%|\d+(\.\d+)?px) /, "右端が軸（原点の x が右端）");
    const [ox] = st.origin.split(" ").map(parseFloat);
    assert.ok(Math.abs(ox - st.box[0]) < 1.5 || st.origin.startsWith("100%"), `軸は右端 ${st.origin}`);
    assert.equal(st.bfF, "hidden"); assert.equal(st.bfB, "hidden");
    assert.equal(st.backBg, "rgb(232, 219, 180)", "めくれた紙の裏は紙の色");
    assert.equal(st.hasGame, true, "替わる前の見た目の写し");
    assert.equal(st.hasShadow, true, "下に薄い影");
    assert.equal(st.aria, "true");
    assert.ok(Math.abs(st.box[0] - st.box[1]) < 1, "写しは遊ぶ画面と同じ幅");
    // めくっている間も遊べる：場の札を取れる（写しの下の本物を押す）
    const takesBefore = await page.evaluate(() => __KJ.game.me.takes);
    assert.ok(takesBefore > 0);
    await page.locator("#field .tile").nth(0).click();
    assert.equal(await page.evaluate(() => __KJ.game.me.takes), takesBefore - 1, "めくっている間も札を取れる");
    assert.equal(await page.evaluate(() => __KJ.game.over), false, "時計は止まらない・試合は続く");
    await page.waitForFunction(() => document.querySelectorAll(".flip").length === 0, null, { timeout: 1500 });
    if (SHOT) await page.screenshot({ path: path.join(SHOT, "kj-131-mincho-after-375.png") });
    assert.equal(await dataFace(page), "mincho", "試合のあいだは明朝のまま");
    assert.equal(await page.evaluate(() => localStorage.getItem("kj-face")), null, "設定（kj-face）は書き換えない");
    const fam = await page.evaluate(() => getComputedStyle(document.querySelector("#meHand .tile")).fontFamily);
    assert.match(fam, /KJ Shippori/, "札の字が明朝（Shippori）の並び");
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  if (SHOT) await t.test("画像（KJ_SHOT_MINCHO のときだけ）：めくっている途中（0.25 秒の所で止めて撮る。0.4 秒だと真横で見えない）", async () => {
    const { ctx, page } = await begin(browser, url);
    await throwWord(page, "明朝体");
    await page.evaluate(() => document.getAnimations().filter((a) => /^flip/.test(a.animationName || "")).forEach((a) => { a.pause(); a.currentTime = 250; }));
    await page.screenshot({ path: path.join(SHOT, "kj-131-mincho-mid-375.png") });
    await ctx.close();
  });

  await t.test("戦況の欄に「明朝体！札ノ字ガ明朝ニ」が1行出る。ログにも1行。点は普通（3字で9点）", async () => {
    const { ctx, page } = await begin(browser, url, { reduce: true });
    await throwWord(page, "明朝体");
    const txt = await page.locator("#released").innerText();
    assert.equal((txt.match(/明朝体！札ノ字ガ明朝ニ/g) || []).length, 1);
    assert.equal(await page.evaluate(() => __KJ.game.me.score), 9);
    assert.equal(await page.evaluate(() => __KJ.game.log.filter((e) => e.op === "札の字").length), 1);
    await ctx.close();
  });

  await t.test("動きを減らす設定：写しは出ず、一度に明朝に替わる", async () => {
    const { ctx, page, errors } = await begin(browser, url, { reduce: true });
    await throwWord(page, "明朝体");
    assert.equal(await dataFace(page), "mincho");
    assert.equal(await flips(page), 0);
    await page.waitForTimeout(300);
    assert.equal(await flips(page), 0);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await t.test("大正 を放っても何も起きない（写しも出ない・札の字もそのまま）。2回目の適用も何もしない", async () => {
    const { ctx, page } = await begin(browser, url, { hand: "大正明朝体年" });
    await throwWord(page, "大正");
    assert.equal(await dataFace(page), "taisho");
    await page.waitForTimeout(150);
    assert.equal(await flips(page), 0);
    // 取りきって 明朝体 を放つ → 替わる → もう一度適用しても写しは出ない
    await page.evaluate(() => { __KJ.game.me.takes = 0; __KJ.render(); });
    await throwWord(page, "明朝体");
    await page.waitForFunction(() => document.querySelectorAll(".flip").length === 0, null, { timeout: 1500 });
    assert.equal(await dataFace(page), "mincho");
    await page.evaluate(() => { __KJ.game.applyFace(__KJ.game.me, "明朝体", { op: "face", target: "both", value: "mincho" }); __KJ.drain(); __KJ.render(); });
    assert.equal(await flips(page), 0, "2回目は演出も出さない");
    await ctx.close();
  });

  await t.test("試合が終わると設定に戻る：大正風の設定なら大正風・明朝の設定なら明朝のまま。kj-face は変わらない", async () => {
    for (const set of [null, "mincho"]) {
      const { ctx, page } = await begin(browser, url, { reduce: true, face: set });
      const before = await dataFace(page);
      assert.equal(before, set === "mincho" ? "mincho" : "taisho");
      await throwWord(page, "明朝体");
      assert.equal(await dataFace(page), "mincho");
      await page.evaluate(() => { const G = __KJ.game; G.endsAt = G.now() - 0.1; });
      await page.waitForFunction(() => /勝ち|負け|引き分け/.test(document.getElementById("msg").textContent), null, { timeout: 8000 });
      assert.equal(await dataFace(page), set === "mincho" ? "mincho" : "taisho", "終わったら設定（札の字）に戻る");
      assert.equal(await page.evaluate(() => localStorage.getItem("kj-face")), set);
      await ctx.close();
    }
  });

  await t.test("もう一度（新しい試合）は設定の札の字から。はじめる前の画面へ戻っても設定", async () => {
    const { ctx, page } = await begin(browser, url, { reduce: true });
    await throwWord(page, "明朝体");
    assert.equal(await dataFace(page), "mincho");
    await page.click("#bSetup");
    assert.equal(await page.isVisible("#setup"), true);
    assert.equal(await dataFace(page), "taisho", "試合を捨ててはじめる前の画面へ戻ると設定");
    await page.click("#start");
    assert.equal(await dataFace(page), "taisho", "新しい試合は設定の字から");
    assert.equal(await page.evaluate(() => __KJ.game.face), null);
    await ctx.close();
  });

  // ---------- 合言葉の部屋：相手のページも替わる（2つのページ。kj_claims は page.route の偽物。Realtime は差し替え） ----------
  await t.test("合言葉の部屋：A が 明朝体 を放つと、B のページの札の字も明朝に替わる（戦況に1行・めくりの写しは消える・相手の設定は書き換えない）", async () => {
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
    const mk = async () => {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 760 }, reducedMotion: "no-preference" });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
      await page.route("https://ysxrdhzybzvucxwdqchw.supabase.co/rest/v1/kj_claims**", handler);
      await page.route("https://cdn.jsdelivr.net/**", (r) => { errors.push("CDN を読みに行った"); return r.abort(); });
      await page.addInitScript(() => {
        window.__KJ_POLL_MS = 150;
        try { localStorage.setItem("kj-tutorial", "1"); } catch (e) { /* 読めない端末 */ }
        window.supabase = { createClient: () => ({ channel: () => { const ch = { on: () => ch, subscribe: (cb) => { setTimeout(() => cb("CHANNEL_ERROR"), 0); return ch; }, unsubscribe: () => {} }; return ch; } }) };
      });
      await page.goto(url);
      await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
      await page.check('#opp input[value="room"]');
      return { ctx, page, errors };
    };
    const A = await mk(), B = await mk();
    await A.page.check('#lvl input[value="N4"]');
    await A.page.check('#act input[value="host"]');
    await A.page.waitForSelector("#roomShow:not([hidden])");
    const code = (await A.page.textContent("#roomShow")).trim();
    await B.page.check('#act input[value="enter"]');
    await B.page.fill("#roomCode", code);
    await B.page.click("#bEnter");
    for (const P of [A, B]) await P.page.waitForSelector("#game:not([hidden])", { timeout: 8000 });
    for (const P of [A, B]) assert.equal(await dataFace(P.page), "taisho");
    await A.page.evaluate(() => { const G = __KJ.game; G.me.cards = [..."明朝体"].map((c, i) => ({ id: 9100 + i, c, t: 0, fresh: false })); __KJ.render(); });
    await throwWord(A.page, "明朝体");
    await A.page.waitForFunction(() => __KJ.game.me.score === 9);
    await B.page.waitForFunction(() => document.documentElement.getAttribute("data-face") === "mincho", null, { timeout: 5000 });
    assert.equal(await dataFace(A.page), "mincho");
    assert.equal(await B.page.evaluate(() => __KJ.game.face), "mincho");
    assert.equal(await B.page.evaluate(() => localStorage.getItem("kj-face")), null, "相手の設定は書き換えない");
    assert.match(await B.page.locator("#released").first().innerText(), /明朝体！札ノ字ガ明朝ニ/); // めくっている間は写しにも同じ id があるので first（本物が先）
    await B.page.waitForFunction(() => document.querySelectorAll(".flip").length === 0, null, { timeout: 2000 });
    for (const P of [A, B]) assert.deepEqual(P.errors.filter((e) => !/status of 409/.test(e)), []);
    await A.ctx.close(); await B.ctx.close();
  });
});
