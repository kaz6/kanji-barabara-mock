// KJ-123：はじめる前の画面の組み直し（画面）。CPU戦／友達と対戦（作る・入る）・時間は2つ・900 が残っていても10分・歯車と振動・入り方のログ。
// kj_claims は page.route の偽物（本物の Supabase には出さない）。Playwright の Chromium がないと skip になる。skip は「通った」ではない。
// KJ_SHOT_START=<フォルダ> で 375×667 と 320×640 の「CPU戦／作る／入る」の画像を書く
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

// share: "ok"＝navigator.share を差し替え（呼ばれた引数を window.__shared に残す）／"abort"＝閉じた（AbortError）／"fail"＝閉じた以外の失敗／"none"＝navigator.share が無い端末
async function open(browser, url, { share = "none", handler = null, pre = null, vp = { width: 375, height: 667 } } = {}) { // KJ-123 の試験用に share.browser.test.mjs から写した（偽物の kj_claims の回し方は同じ）
  const ctx = await browser.newContext({ viewport: vp, permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.addInitScript(([s, pre]) => {
    try { localStorage.setItem("kj-tutorial", "1"); } catch (e) { /* 読めない端末 */ }
    window.__shared = [];
    window.supabase = { createClient: () => ({ channel: () => { const ch = { on: () => ch, subscribe: (cb) => { setTimeout(() => cb("CHANNEL_ERROR"), 0); return ch; }, unsubscribe: () => {} }; return ch; } }) };
    if (s === "none") Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    else Object.defineProperty(navigator, "share", { configurable: true, value: (d) => { window.__shared.push(d); if (s === "fail") return Promise.reject(Object.assign(new Error("x"), { name: "NotAllowedError" })); return s === "abort" ? Promise.reject(Object.assign(new Error("x"), { name: "AbortError" })) : Promise.resolve(); } });
    if (pre) { try { new Function(pre)(); } catch (e) { /* 読めない端末 */ } }
  }, [share, pre]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.route("https://cdn.jsdelivr.net/**", (r) => { errors.push("CDN を読みに行った"); return r.abort(); });
  if (handler) await page.route("https://ysxrdhzybzvucxwdqchw.supabase.co/rest/v1/kj_claims**", handler);
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("setupInfo").textContent.startsWith("字 "));
  return { ctx, page, errors };
}


const SHOTS = process.env.KJ_SHOT_START;
const shot = async (page, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + ".png"), fullPage: true }); };
const texts = (page, sel) => page.locator(sel).allTextContents().then((a) => a.map((x) => x.trim()));
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test("はじめる前の画面の組み直し（KJ-123）", { skip }, async (t) => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  try {
    await t.test("遊び方は CPU戦／友達と対戦。時間は5分と10分だけ。背景の記事の段は無い", async () => {
      const A = await open(browser, base);
      assert.deepEqual(await texts(A.page, "#opp label"), ["CPU戦", "友達と対戦"]);
      assert.deepEqual(await texts(A.page, "#tim label"), ["5分", "10分"]);
      assert.equal(await A.page.locator("#grpNews, #news, #newsLabel").count(), 0);
      assert.equal(await A.page.isVisible("#grpFace"), true, "札の字の段は画面に残す");
      assert.equal(await A.page.locator("#vib").isVisible(), false, "振動の段ははじめる前の画面に並ばない（歯車の中）");
      assert.deepEqual(A.errors, []);
      await A.ctx.close();
    });

    await t.test("端末に 900（15分）が覚えてあれば 10分 として扱う。試合も10分", async () => {
      const A = await open(browser, base, { pre: "localStorage.setItem('kj-time','900')" });
      assert.equal(await A.page.locator("#tim input:checked").getAttribute("value"), "600");
      assert.match(await A.page.textContent("#lead"), /10分経過時/);
      await A.page.click("#start");
      assert.equal(await A.page.evaluate(() => __KJ.game.timeLimit), 600);
      await A.ctx.close();
    });

    for (const vp of [{ width: 375, height: 667 }, { width: 320, height: 640 }]) {
      const tag = `${vp.width}x${vp.height}`;
      await t.test(`${tag}：CPU戦（強さが出る・作る／入るは出ない）`, async () => {
        const A = await open(browser, base, { vp });
        assert.deepEqual([await A.page.isVisible("#pow"), await A.page.isVisible("#act"), await A.page.isVisible("#roomBox"), await A.page.isVisible("#start")], [true, false, false, true]);
        assert.equal(await noOverflow(A.page), true);
        await shot(A.page, `cpu-${tag}`);
        assert.deepEqual(A.errors, []);
        await A.ctx.close();
      });

      await t.test(`${tag}：部屋を作る（レベル・時間は作る前に選べる／作ると数字・共有・待つ文・やめる／できたらレベル・時間は押せない／やめると戻る）`, async () => {
        const A = await open(browser, base, { vp, share: "ok", handler: fakeClaims() });
        await A.page.check('#opp input[value="room"]');
        assert.equal(await A.page.locator("#act input:checked").count(), 0, "初めはどちらも選ばれていない");
        assert.deepEqual([await A.page.isVisible("#lvl"), await A.page.isVisible("#tim"), await A.page.isVisible("#roomShow"), await A.page.isVisible("#bShare")], [true, true, false, false], "作る前にレベル・時間が出ている");
        await A.page.check('#lvl input[value="N5"]');
        await A.page.check('#tim input[value="300"]');
        await A.page.check('#act input[value="host"]');
        await A.page.waitForSelector("#roomShow:not([hidden])");
        assert.match((await A.page.textContent("#roomShow")).trim(), /^[0-9]{4}$/);
        assert.deepEqual([await A.page.isVisible("#bShare"), await A.page.isVisible("#bRoomCancel"), await A.page.isVisible("#roomCode")], [true, true, false]);
        assert.match(await A.page.textContent("#roomMsg"), /レベル N5・5分）。相手を待っています/, "選んだレベル・時間で作った");
        assert.equal(await A.page.evaluate(() => [...document.querySelectorAll("#act input,#lvl input,#tim input")].every((i) => i.disabled)), true, "やめるまで押せない");
        assert.equal(await A.page.evaluate(() => getComputedStyle(document.querySelector("#tim label")).opacity), "0.45", "押せない見え方");
        assert.equal(await A.page.locator("#act input:checked").getAttribute("value"), "host");
        assert.equal(await noOverflow(A.page), true);
        await shot(A.page, `host-${tag}`);
        await A.page.click("#bRoomCancel");
        assert.equal(await A.page.locator("#act input:checked").count(), 0, "やめたら選びが外れる");
        assert.equal(await A.page.evaluate(() => [...document.querySelectorAll("#act input,#lvl input,#tim input")].every((i) => !i.disabled)), true);
        await A.page.check('#act input[value="host"]'); // 作り直せる
        await A.page.waitForSelector("#roomShow:not([hidden])");
        assert.deepEqual(A.errors, []);
        await A.ctx.close();
      });

      await t.test(`${tag}：部屋に入る（合言葉の入力と「合言葉で入る」・レベル時間は出ない・入る側の文が1行）`, async () => {
        const A = await open(browser, base, { vp, handler: fakeClaims() });
        await A.page.check('#opp input[value="room"]');
        await A.page.check('#act input[value="enter"]');
        assert.deepEqual([await A.page.isVisible("#roomCode"), await A.page.isVisible("#bEnter"), await A.page.isVisible("#lvl"), await A.page.isVisible("#tim"), await A.page.isVisible("#bShare")], [true, true, false, false, false]);
        assert.equal((await A.page.textContent("#bEnter")).trim(), "合言葉で入る");
        const gt = A.page.locator("#enterBox .gt");
        assert.equal((await gt.textContent()).trim(), "入る側は、作った人のレベル・時間で遊ぶ");
        const h = await gt.evaluate((e) => ({ h: e.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(e).lineHeight) || e.getBoundingClientRect().height }));
        assert.ok(h.h <= h.lh * 1.2, `1行 ${JSON.stringify(h)}`);
        assert.equal(await noOverflow(A.page), true);
        await shot(A.page, `enter-${tag}`);
        // 部屋に入る→部屋を作る：レベル・時間が出る
        await A.page.check('#act input[value="host"]');
        await A.page.waitForSelector("#roomShow:not([hidden])");
        assert.equal(await A.page.isVisible("#lvl"), true);
        assert.deepEqual(A.errors, []);
        await A.ctx.close();
      });
    }

    await t.test("歯車：見出しの行の右端。押すと設定の欄が開き、振動の入／切がある（初期は入）。読み上げは「設定」。墨の線の SVG（箱・影なし）", async () => {
      const A = await open(browser, base);
      const g = A.page.locator("#bGear");
      assert.equal(await g.isVisible(), true);
      assert.equal(await g.getAttribute("aria-label"), "設定");
      assert.equal(await g.getAttribute("aria-expanded"), "false");
      const geo = await A.page.evaluate(() => { const h = document.querySelector("#setup h2").getBoundingClientRect(), b = document.getElementById("bGear").getBoundingClientRect(), s = document.getElementById("setup").getBoundingClientRect(); return { sameRow: b.top < h.bottom && b.bottom > h.top, right: s.right - b.right, afterTitle: b.left >= h.right - 1 }; });
      assert.equal(geo.sameRow && geo.afterTitle && geo.right < 20, true, JSON.stringify(geo));
      const look = await g.evaluate((e) => { const cs = getComputedStyle(e), svg = e.querySelector("svg"); return { bs: cs.boxShadow, br: cs.borderTopWidth, bg: cs.backgroundColor, rad: cs.borderRadius, svgStroke: svg && getComputedStyle(svg.querySelector("g")).stroke, fill: svg && getComputedStyle(svg.querySelector("g")).fill, filter: cs.filter }; });
      assert.deepEqual([look.bs, look.br, look.bg, look.rad, look.fill, look.filter], ["none", "0px", "rgba(0, 0, 0, 0)", "0px", "none", "none"]);
      assert.notEqual(look.svgStroke, "none");
      assert.equal(await g.evaluate((e) => e.getBoundingClientRect().width >= 44 && e.getBoundingClientRect().height >= 44), true, "指で押せる大きさ");
      assert.equal(await A.page.isVisible("#setPanel"), false);
      await g.click();
      assert.equal(await g.getAttribute("aria-expanded"), "true");
      assert.equal(await A.page.isVisible("#setPanel"), true);
      assert.deepEqual(await texts(A.page, "#vib label"), ["入", "切"]);
      assert.equal(await A.page.locator("#vib input:checked").getAttribute("value"), "1", "初期は入");
      await A.page.check('#vib input[value="0"]');
      assert.equal(await A.page.evaluate(() => localStorage.getItem("kj-vibe")), "0", "kj-vibe に書く");
      await g.click();
      assert.equal(await A.page.isVisible("#setPanel"), false, "もう一度押すと閉じる");
      assert.equal(await noOverflow(A.page), true);
      assert.deepEqual(A.errors, []);
      await A.ctx.close();
    });

    await t.test("navigator.vibrate が無い端末では、歯車は出る（曲の入／切があるため。KJ-133）が、振動の欄だけ出ない", async () => {
      const A = await open(browser, base, { pre: "Object.defineProperty(navigator,'vibrate',{configurable:true,value:undefined})" });
      assert.equal(await A.page.evaluate(() => typeof navigator.vibrate), "undefined");
      assert.equal(await A.page.isVisible("#bGear"), true, "曲の入／切があるので歯車はいつも出る（KJ-133）");
      assert.equal(await A.page.isVisible("#setPanel"), false);
      await A.page.click("#bGear");
      assert.equal(await A.page.isVisible("#grpVib"), false, "振動の欄だけ出ない");
      assert.equal(await A.page.isVisible("#grpBgm"), true, "曲の欄は出る");
      assert.deepEqual(A.errors, []);
      await A.ctx.close();
    });

    await t.test("入り方：リンク（?room= の合言葉のまま入る）／手入力（打って入る）がログの頭に出る。作る側には出ない（play_logs の log の文に入ることは tests/entry.test.js）", async () => {
      const handler = fakeClaims();
      const A = await open(browser, base, { handler });
      await A.page.addInitScript(() => { window.__KJ_POLL_MS = 150; });
      await A.page.check('#opp input[value="room"]');
      await A.page.check('#act input[value="host"]');
      await A.page.waitForSelector("#roomShow:not([hidden])");
      const code = (await A.page.textContent("#roomShow")).trim();
      // リンクで開く
      const L = await open(browser, base + "?room=" + code, { handler, pre: "window.__KJ_POLL_MS = 150" });
      // KJ-149：リンクで開くと押さなくても入る（［合言葉で入る］は押さない）
      for (const P of [A, L]) await P.page.waitForSelector("#game:not([hidden])", { timeout: 8000 });
      const first = (P) => P.page.evaluate(() => __KJ.game.logText().split("\n")[0]);
      assert.equal(await first(L), "# 入り方：リンク");
      assert.match(await first(A), /^# 漢対普請瓦版 ログ/, "作る側には書かない");
      assert.deepEqual([...A.errors, ...L.errors].filter((e) => !/status of 409/.test(e)), []);
      await A.ctx.close(); await L.ctx.close();
      // 手で打って入る
      const A2 = await open(browser, base, { handler });
      await A2.page.addInitScript(() => { window.__KJ_POLL_MS = 150; });
      await A2.page.check('#opp input[value="room"]');
      await A2.page.check('#act input[value="host"]');
      await A2.page.waitForSelector("#roomShow:not([hidden])");
      const code2 = (await A2.page.textContent("#roomShow")).trim();
      const T2 = await open(browser, base, { handler });
      await T2.page.addInitScript(() => { window.__KJ_POLL_MS = 150; });
      await T2.page.check('#opp input[value="room"]');
      await T2.page.check('#act input[value="enter"]');
      await T2.page.fill("#roomCode", code2);
      await T2.page.click("#bEnter");
      for (const P of [A2, T2]) await P.page.waitForSelector("#game:not([hidden])", { timeout: 8000 });
      assert.equal(await first(T2), "# 入り方：手入力");
      assert.match(await first(A2), /^# 漢対普請瓦版 ログ/);
      assert.deepEqual([...A2.errors, ...T2.errors].filter((e) => !/status of 409/.test(e)), []);
      await A2.ctx.close(); await T2.ctx.close();
    });
  } finally {
    await browser.close();
    srv.close();
  }
});
