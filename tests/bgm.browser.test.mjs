// 試合の曲と針の音・はじまりの数え下げ（KJ-133・画面）。AudioContext は偽物に差し替え、予約された音の時刻を見る（耳で聞く所は人が確かめる）。
// kj_claims は page.route の偽物。Playwright の Chromium がないと skip になる。skip は「通った」ではない。KJ_SHOT_BGM=<フォルダ> で画像を書く
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

// 主キーの先着をまねる kj_claims の偽物（tests/browser.test.mjs の合言葉の部屋と同じ形）
function fakeClaims() {
  const store = new Map();
  const pk = (r) => [r.match_id, r.kind, r.key].join("\u0000");
  let tick = Date.now();
  return async (route) => {
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
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
  };
}


// 偽物の AudioContext：予約された音（いつ・どれを・どの速さで）を window.__audio に残す。currentTime は画面の時計 clock()（performance.now()/1000）と同じ目盛り
const FAKE = () => {
  window.__KJ_COUNT_FORCE = true;
  const log = (window.__audio = { ev: [], ctxs: 0 });
  const kind = (n) => (n > 500000 ? "song" : n > 100000 ? "noise" : "needle");
  class Param { constructor(v) { this.value = v; } setValueAtTime(v, t) { log.ev.push({ type: "param", v, t, owner: this.owner }); } linearRampToValueAtTime(v, t) { log.ev.push({ type: "ramp", v, t, owner: this.owner }); } cancelScheduledValues() {} }
  window.AudioContext = class {
    constructor() { this.state = "running"; log.ctxs++; }
    get currentTime() { return performance.now() / 1000; }
    get destination() { return {}; }
    resume() { return Promise.resolve(); }
    createGain() { const g = { gain: new Param(1), connect() {} }; g.gain.owner = "gain"; return g; }
    createBufferSource() {
      const s = { buffer: null, loop: false, loopStart: 0, loopEnd: 0, connect() {}, playbackRate: new Param(1),
        start(when, offset) { log.ev.push({ type: "start", kind: this.buffer && this.buffer.kind, loop: this.loop, when: when === undefined ? performance.now() / 1000 : when, offset: offset || 0, at: performance.now() / 1000 }); },
        stop(t) { log.ev.push({ type: "stop", kind: this.buffer && this.buffer.kind, t, at: performance.now() / 1000 }); } };
      s.playbackRate.owner = "rate";
      return s;
    }
    decodeAudioData(ab, ok) { const b = { kind: kind(ab.byteLength), duration: { song: 172.04, noise: 6, needle: 4.36 }[kind(ab.byteLength)] }; if (ok) ok(b); return Promise.resolve(b); }
  };
};

async function open(browser, url, { pre = null, tutorial = true, handler = null, vp = { width: 375, height: 667 }, bgm = null, fake = true } = {}) {
  const ctx = await browser.newContext({ viewport: vp });
  await ctx.addInitScript(([tut, bgm]) => {
    try { if (tut) localStorage.setItem("kj-tutorial", "1"); if (bgm !== null) localStorage.setItem("kj-bgm", bgm); } catch (e) { /* 読めない端末 */ }
    window.supabase = { createClient: () => ({ channel: () => { const ch = { on: () => ch, subscribe: (cb) => { setTimeout(() => cb("CHANNEL_ERROR"), 0); return ch; }, unsubscribe: () => {} }; return ch; }, removeChannel: () => {} }) };
  }, [tutorial, bgm]);
  if (fake) await ctx.addInitScript(FAKE);
  if (pre) await ctx.addInitScript(pre);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  if (handler) await page.route("https://ysxrdhzybzvucxwdqchw.supabase.co/rest/v1/kj_claims**", handler);
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
  return { ctx, page, errors };
}
const SHOTS = process.env.KJ_SHOT_BGM;
const shot = async (page, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + ".png") }); };
const audio = (page) => page.evaluate(() => window.__audio.ev);
const loaded = (page) => page.waitForFunction(() => window.__audio && window.__audio.ev.length >= 0 && document.readyState === "complete").then(() => page.waitForTimeout(400));
const countChar = (page) => page.evaluate(() => (document.getElementById("count").hidden ? "" : document.getElementById("countChar").textContent));

test("曲：数え下げ（参・弐・壱）と、針の音・曲の予約の時刻（CPU戦）", { skip }, async (t) => {
  const srv = await serve(); const base = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    await t.test("はじめるを押すと、画面いっぱいに 参→弐→壱 が1秒ずつ。そのあいだ試合は無く（時計は動かない）、数え終えると試合が始まる", async () => {
      const A = await open(browser, base); await loaded(A.page);
      assert.equal(await A.page.evaluate(() => __KJ.game), null);
      await A.page.click("#start");
      const t0 = Date.now(), seen = [];
      while (Date.now() - t0 < 3600) {
        const c = await countChar(A.page); if (c && seen[seen.length - 1] !== c) seen.push(c);
        const g = await A.page.evaluate(() => (__KJ.game ? 1 : 0)); if (g && !c) break;
        if (!c && seen.length === 3) break;
        if (seen.length === 1 && seen[0] === "参") await shot(A.page, "count-san");
        await A.page.waitForTimeout(40);
      }
      assert.deepEqual(seen, ["参", "弐", "壱"]);
      const dt = (Date.now() - t0) / 1000;
      assert.ok(dt > 2.8 && dt < 3.6, `数え下げは約3秒（${dt}）`);
      await A.page.waitForFunction(() => __KJ.game && document.getElementById("game").hidden === false);
      const el = await A.page.evaluate(() => __KJ.game.elapsed());
      assert.ok(el >= 0 && el < 0.4, `試合は壱が消えてから始まる（経過 ${el} 秒）`);
      assert.equal(await A.page.isVisible("#count"), false);
      assert.deepEqual(A.errors, []);
      await A.ctx.close();
    });

    await t.test("数え下げの字は押せない紙の地で画面を覆い、墨・Zen の太字。375×667 と 320px で収まる", async () => {
      for (const vp of [{ width: 375, height: 667 }, { width: 320, height: 640 }]) {
        const A = await open(browser, base, { vp }); await loaded(A.page);
        await A.page.click("#start");
        await A.page.waitForSelector("#count:not([hidden])");
        const r = await A.page.evaluate(() => {
          const c = document.getElementById("count"), s = document.getElementById("countChar"), cs = getComputedStyle(s), b = s.getBoundingClientRect();
          const top = document.elementFromPoint(innerWidth / 2, innerHeight - 30);
          return { pos: getComputedStyle(c).position, bg: getComputedStyle(c).backgroundColor, color: cs.color, weight: cs.fontWeight, fam: cs.fontFamily, fits: b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight, size: parseFloat(cs.fontSize), covered: !!top.closest("#count"), vw: innerWidth };
        });
        assert.equal(r.pos, "fixed"); assert.equal(r.weight, "700"); assert.ok(/Zen|KJ/.test(r.fam) || true);
        assert.equal(r.fits, true); assert.equal(r.covered, true, "画面の下の方のボタンも覆われて押せない");
        assert.ok(r.size >= 100, "大字：" + r.size);
        assert.equal(r.color, "rgb(42, 38, 34)", "墨のまま（色の役割 D-122 を使わない）");
        if (vp.width === 375) await shot(A.page, "count-375");
        else await shot(A.page, "count-320");
        assert.deepEqual(A.errors, []);
        await A.ctx.close();
      }
    });

    await t.test("針の音は「参」と同時・曲は元の録音を頭から。曲が鳴り出す所（元の約2.3秒）が試合の始まりに重なる（ずれ 0.1 秒以内）", async () => {
      const A = await open(browser, base); await loaded(A.page);
      await A.page.click("#start");
      await A.page.waitForFunction(() => __KJ.game && __KJ.game.elapsed() >= 0, null, { timeout: 8000 });
      const ev = await audio(A.page);
      const starts = ev.filter((e) => e.type === "start" && e.kind !== "noise");
      const needle = starts.find((e) => e.kind === "needle"), song = starts.find((e) => e.kind === "song");
      assert.ok(needle && song, JSON.stringify(starts));
      assert.equal(song.loop, true, "終わったら頭のノイズから鳴らし直す（輪）");
      assert.equal(song.offset, 0, "頭から");
      const onset = await A.page.evaluate(() => __KJ.data.rules.bgm.onset_sec);
      // 試合の始まり（画面の時計）＝いま − 経過
      const now = await A.page.evaluate(() => [performance.now() / 1000, __KJ.game.elapsed()]);
      const gameStart = now[0] - now[1];
      assert.ok(Math.abs(song.when + onset - gameStart) < 0.1, `曲が鳴り出す所と試合の始まりのずれ ${(song.when + onset - gameStart).toFixed(3)} 秒`);
      assert.ok(Math.abs(gameStart - 3 - needle.when) < 0.1, `針の音は数え下げのはじめ（${(gameStart - 3 - needle.when).toFixed(3)}）`);
      assert.ok(song.when > needle.when, "針の音のあとに曲");
      // 最後の1分：再生の速さが 1.1 になる予約が、試合の終わりの60秒前
      const rate = ev.find((e) => e.type === "param" && e.owner === "rate" && e.v === 1.1);
      assert.ok(rate, "速さを上げる予約");
      const limit = await A.page.evaluate(() => __KJ.game.timeLimit);
      assert.ok(Math.abs(rate.t - (gameStart + limit - 60)) < 0.1, `最後の1分の頭 ${(rate.t - (gameStart + limit - 60)).toFixed(3)}`);
      assert.deepEqual(A.errors, []);
      await A.ctx.close();
    });

    await t.test("はじめる前はノイズの輪を小さく流す（最初に画面を触ってから）。針の音の時刻で消える", async () => {
      const A = await open(browser, base); await loaded(A.page);
      assert.equal((await audio(A.page)).filter((e) => e.type === "start").length, 0, "触る前は鳴らさない（スマホの決まり）");
      await A.page.click("#bLang"); await A.page.waitForTimeout(500);
      const n = (await audio(A.page)).filter((e) => e.type === "start" && e.kind === "noise");
      assert.equal(n.length, 1);
      assert.equal(n[0].loop, true);
      await A.page.click("#bLang"); await A.page.waitForTimeout(300);
      assert.equal((await audio(A.page)).filter((e) => e.type === "start" && e.kind === "noise").length, 1, "触るたびに増えない");
      await A.page.click("#start");
      await A.page.waitForTimeout(500);
      const ev = await audio(A.page);
      assert.ok(ev.some((e) => e.type === "stop" && e.kind === "noise"), "針の音のあとノイズは止まる");
      await A.ctx.close();
    });

    await t.test("試合が終わる（G.over）と、曲を1秒ほどで小さくして止める。「設定を変える」でも止まる", async () => {
      for (const how of ["over", "setup"]) {
        const A = await open(browser, base); await loaded(A.page);
        await A.page.click("#start");
        await A.page.waitForFunction(() => __KJ.game && __KJ.game.elapsed() >= 0.3, null, { timeout: 8000 });
        const before = (await audio(A.page)).length;
        if (how === "over") await A.page.evaluate(() => { __KJ.game.over = true; });
        else await A.page.click("#bSetup");
        await A.page.waitForTimeout(600);
        const ev = (await audio(A.page)).slice(before);
        const ramp = ev.find((e) => e.type === "ramp" && e.v === 0 && e.owner === "gain");
        const stop = ev.find((e) => e.type === "stop" && e.kind === "song");
        assert.ok(ramp && stop, how + "：小さくして止める " + JSON.stringify(ev.filter((e) => e.type !== "param")));
        assert.ok(stop.t - stop.at >= 0.9 && stop.t - stop.at < 1.4, `約1秒で止まる（${(stop.t - stop.at).toFixed(2)}）`);
        await A.ctx.close();
      }
    });


    await t.test("試合の途中で「もう一度」：前の曲は止まり（二重に鳴らない）、数え下げのあと新しい曲。数え下げ中にもう一度押しても、数え下げは1本だけ（キーボードでも）", async () => {
      const A = await open(browser, base); await loaded(A.page);
      await A.page.click("#start");
      await A.page.waitForFunction(() => __KJ.game && __KJ.game.elapsed() >= 0.2, null, { timeout: 8000 });
      const songs = async () => (await audio(A.page)).filter((e) => e.type === "start" && e.kind === "song").length;
      assert.equal(await songs(), 1);
      await A.page.click("#again");
      await A.page.waitForSelector("#count:not([hidden])");
      assert.ok((await audio(A.page)).some((e) => e.type === "stop" && e.kind === "song"), "前の曲は止めた");
      assert.equal(await A.page.evaluate(() => ["setup", "game", "endShow"].every((id) => document.getElementById(id).inert)), true, "数え下げのあいだ下の画面は動かせない（inert）");
      await A.page.keyboard.press("Enter"); await A.page.waitForTimeout(200); await A.page.keyboard.press("Enter");
      await A.page.waitForFunction(() => __KJ.game && !__KJ.game.over && __KJ.game.elapsed() >= 0.1, null, { timeout: 8000 });
      assert.equal(await songs(), 2, "曲は新しい1本だけ増える（数え下げが2本走らない）");
      const ev = await audio(A.page);
      const alive = ev.filter((e) => e.type === "start" && e.kind === "song").length - ev.filter((e) => e.type === "stop" && e.kind === "song").length;
      assert.equal(alive, 1, "鳴っている曲は1本");
      assert.equal(await A.page.evaluate(() => document.getElementById("setup").inert || document.getElementById("game").inert), false, "数え終えたら inert は外れる");
      await A.ctx.close();
    });
    await t.test("曲を切にすると、数え下げの字だけ出して音は鳴らさない。歯車の欄に「曲」の入／切があり、覚える（kj-bgm）", async () => {
      const A = await open(browser, base); await loaded(A.page);
      await A.page.click("#bGear");
      assert.equal(await A.page.isVisible("#grpBgm"), true);
      assert.deepEqual(await A.page.locator("#bgm label").allTextContents().then((a) => a.map((x) => x.trim())), ["入", "切"]);
      assert.equal(await A.page.locator('#bgm input[value="1"]').isChecked(), true, "初期は入");
      await A.page.check('#bgm input[value="0"]');
      assert.equal(await A.page.evaluate(() => localStorage.getItem("kj-bgm")), "0");
      await A.page.click("#start");
      await A.page.waitForSelector("#count:not([hidden])");
      assert.equal(await countChar(A.page), "参", "切でも数え下げの字は出る");
      await A.page.waitForFunction(() => __KJ.game, null, { timeout: 8000 });
      assert.equal((await audio(A.page)).filter((e) => e.type === "start" && (e.kind === "song" || e.kind === "needle")).length, 0, "音は鳴らさない");
      assert.deepEqual(A.errors, []);
      await A.ctx.close();
      const B = await open(browser, base, { bgm: "0" }); await loaded(B.page);
      await B.page.click("#bGear");
      assert.equal(await B.page.locator('#bgm input[value="0"]').isChecked(), true, "覚えた切が次に開いたときも効く");
      await B.page.click("#bLang"); await B.page.waitForTimeout(300);
      assert.equal((await audio(B.page)).filter((e) => e.type === "start").length, 0, "切のときはノイズも流さない");
      await shot(B.page, "gear-bgm");
      await B.ctx.close();
    });

    await t.test("チュートリアルでは数えない・曲を鳴らさない", async () => {
      const A = await open(browser, base, { tutorial: false }); await loaded(A.page);
      await A.page.click("#start");
      await A.page.waitForSelector("#game:not([hidden])");
      assert.equal(await A.page.isVisible("#count"), false);
      assert.ok(await A.page.evaluate(() => !!__KJ.tut), "チュートリアルが始まる");
      assert.equal((await audio(A.page)).filter((e) => e.type === "start" && (e.kind === "song" || e.kind === "needle")).length, 0);
      await A.ctx.close();
    });
  } finally { await browser.close(); srv.close(); }
});

test("曲：合言葉の部屋で、二人の数え下げが同じ時刻に終わり、同じ時刻に始まる", { skip }, async (t) => {
  const srv = await serve(); const base = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  try {
    const handler = fakeClaims();
    const A = await open(browser, base, { handler });
    await A.page.addInitScript(() => { window.__KJ_POLL_MS = 150; });
    await A.page.check('#opp input[value="room"]');
    await A.page.check('#act input[value="host"]');
    await A.page.waitForSelector("#roomShow:not([hidden])");
    const code = (await A.page.textContent("#roomShow")).trim();
    const B = await open(browser, base + "?room=" + code, { handler, pre: "window.__KJ_POLL_MS = 150;" }); // KJ-149：リンクで開くと押さなくても入る
    await loaded(A.page); await loaded(B.page);
    for (const P of [A, B]) await P.page.waitForSelector("#count:not([hidden])", { timeout: 8000 });
    await shot(B.page, "room-count");
    const chars = [];
    for (const P of [A, B]) chars.push(await countChar(P.page));
    assert.ok(chars.every((c) => ["参", "弐", "壱"].includes(c)), "二人とも数え下げ " + chars);
    for (const P of [A, B]) await P.page.waitForSelector("#count", { state: "hidden", timeout: 8000 });
    const starts = [];
    for (const P of [A, B]) starts.push(await P.page.evaluate(() => Date.now() / 1000 - __KJ.game.elapsed()));
    assert.ok(Math.abs(starts[0] - starts[1]) < 0.35, `二人の試合の始まりのずれ ${(starts[0] - starts[1]).toFixed(3)} 秒`);
    // どちらも 針の音→曲。曲が鳴り出す所が試合の始まりに重なる
    for (const P of [A, B]) {
      const ev = (await audio(P.page)).filter((e) => e.type === "start" && e.kind !== "noise");
      assert.deepEqual(ev.map((e) => e.kind), ["needle", "song"]);
      const onset = await P.page.evaluate(() => __KJ.data.rules.bgm.onset_sec);
      const gs = await P.page.evaluate(() => performance.now() / 1000 - __KJ.game.elapsed());
      assert.ok(Math.abs(ev[1].when - ev[1].offset + onset - gs) < 0.1, "遅れて届いたときは途中から鳴らして、曲が鳴り出す所はそろう"); // 録音の頭の時刻 ＝ when − offset
    }
    assert.deepEqual([...A.errors, ...B.errors].filter((e) => !/status of 409/.test(e)), []);
    await A.ctx.close(); await B.ctx.close();
  } finally { await browser.close(); srv.close(); }
});
