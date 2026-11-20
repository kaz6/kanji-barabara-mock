/* 漢字版（仮）モックの遊びの決まり。画面（DOM）には触らない。
   ブラウザでは window.KJ、Node では require("./js/core.js") で使う（tests/ から）。 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.KJ = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const GARBAGE = "■"; // おじゃま札（R-019）
  const FILES = ["kanji", "words", "readings", "parts", "antonyms", "cycles", "radical_forms", "special", "rules"];

  // ---------- 試し用の切り替え（KJ-002）。初期値は KJ-001 の形 ----------
  const SETTINGS = {
    dest: {
      name: "できた語の行き先",
      def: "throw",
      opts: {
        throw: "投げる（相手に部品が届く）",
        vanish: "消える（相手には何も起きない）",
        garbage: "消えて、相手におじゃま札 ■ が字数ぶん落ちる",
      },
    },
    drop: {
      name: "時間で落ちてくる",
      def: "off",
      opts: { off: "なし", on: "あり（一定の秒数ごとに、二人とも袋から1枚）" },
    },
    cpuPace: {
      name: "CPU の間隔",
      def: "normal",
      opts: { normal: "ふつう", slow: "ゆっくり" },
    },
  };
  function normalizeSettings(s) {
    const out = {};
    for (const [k, def] of Object.entries(SETTINGS)) {
      out[k] = s && Object.prototype.hasOwnProperty.call(def.opts, s[k]) ? s[k] : def.def;
    }
    return out;
  }
  function settingsLabel(D, s) {
    const r = D.rules;
    const pace = r.cpu.pace[s.cpuPace];
    return [
      `${SETTINGS.dest.name}=${SETTINGS.dest.opts[s.dest]}`,
      `${SETTINGS.drop.name}=${s.drop === "on" ? `あり（${r.drop_every_sec}秒ごとに二人とも1枚）` : "なし"}`,
      `${SETTINGS.cpuPace.name}=${SETTINGS.cpuPace.opts[s.cpuPace]}（${pace[0]}〜${pace[1]}秒）`,
    ];
  }

  // ---------- 表を引く ----------
  function makeTables(D) {
    const T = {};
    T.N5 = new Set(D.kanji.kanji.map((k) => k.c));
    T.WORDS = new Map(D.words.words.map((w) => [w.w, w]));
    T.JOIN = new Map(); // "左右" → [できる字…]（十口 は 古・田 の2つ。R-016）
    for (const [k, [a, b]] of Object.entries(D.parts.parts)) {
      const key = a + b;
      if (!T.JOIN.has(key)) T.JOIN.set(key, []);
      T.JOIN.get(key).push(k);
    }
    T.INV = new Map();
    for (const [a, b] of D.antonyms.pairs) { T.INV.set(a, b); T.INV.set(b, a); }
    T.NEXT = new Map();
    for (const cy of D.cycles.cycles) {
      const c = cy.chars;
      c.forEach((x, i) => { if (!T.NEXT.has(x)) T.NEXT.set(x, c[(i + 1) % c.length]); });
    }
    T.HOMO = new Map();
    for (const g of D.readings.same_reading_groups) {
      for (const c of g.chars) { if (!T.HOMO.has(c)) T.HOMO.set(c, []); T.HOMO.get(c).push(g); }
    }
    T.SPECIAL = new Map(D.special.special.map((s) => [s.w, s]));
    T.COMMON_WORDS = D.words.words.filter((w) => w.common && w.w.length >= 2);
    T.parts = D.parts.parts;
    return T;
  }
  const isN5 = (T, c) => T.N5.has(c);
  const splitOnce = (T, c) => T.parts[c] || [c];
  const canSplit = (T, c) => !!T.parts[c];
  function delivered(T, text) {
    const cs = [...text];
    if (cs.length <= 2) return cs;
    const one = cs.flatMap((c) => splitOnce(T, c));
    return cs.length === 3 ? one : one.flatMap((c) => splitOnce(T, c));
  }
  const joinResults = (T, a, b) => T.JOIN.get(a + b) || [];
  // 逆に並べればくっつく（順番の決まりは変えない。表示だけ。KJ-002 の4）
  const joinReversed = (T, a, b) => joinResults(T, a, b).length === 0 && joinResults(T, b, a).length > 0;
  function throwable(T, used, text) {
    if (!text) return { ok: false, why: "" };
    if (text.includes(GARBAGE)) return { ok: false, why: "■ は使えない" };
    if (used.has(text)) return { ok: false, why: "投げ済み" };
    if (T.WORDS.has(text) || ([...text].length === 1 && isN5(T, text))) return { ok: true };
    if ([...text].length === 1) return { ok: false, why: "部品は投げられない" };
    return { ok: false, why: "辞書にない" };
  }
  const homoChars = (T, c) => [...new Set((T.HOMO.get(c) || []).flatMap((g) => g.chars))].filter((x) => x !== c);
  function marks(T, c) {
    let m = "";
    if (T.INV.has(c)) m += "反";
    if (T.NEXT.has(c)) m += "巡";
    if (T.HOMO.has(c)) m += "音";
    return m;
  }

  // ---------- 遊び ----------
  // env: { now: () => 秒, rand: () => 0..1, date: () => Date }
  function createGame(D, T, settings, env) {
    env = env || {};
    const now = env.now || (() => Date.now() / 1000);
    const rand = env.rand || Math.random;
    const s = normalizeSettings(settings);
    const R = D.rules;
    let uid = 0;
    const g = { D, T, settings: s, log: [], events: [], used: new Set(), over: false, winner: null, startedAt: (env.date || (() => new Date()))() };
    const t0 = now();
    g.now = now;
    g.elapsed = () => now() - t0;
    g.nextDrop = s.drop === "on" ? t0 + R.drop_every_sec : Infinity;

    const card = (c, fresh) => ({ id: ++uid, c, t: now(), fresh: !!fresh });
    function shuffle(a) {
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    }
    const makeBag = () => { const out = []; for (let i = 0; i < R.same_char_max_in_start; i++) out.push(...T.N5); return shuffle(out); };
    function draw(p, n) {
      if (p.bag.length < n) p.bag.push(...makeBag());
      return p.bag.splice(0, n);
    }
    function player(key, name) {
      const p = { key, name, bag: makeBag(), cards: [], cd: { invert: 0, cycle: 0, homophone: 0 }, lastSpecial: null };
      p.cards = draw(p, R.start_hand).map((c) => card(c));
      return p;
    }
    g.me = player("me", "あなた");
    g.cpu = player("cpu", "CPU");
    g.opp = (p) => (p === g.me ? g.cpu : g.me);
    g.byId = (p, id) => p.cards.find((x) => x.id === id);
    g.ready = (p, k) => now() >= p.cd[k];
    g.cdLeft = (p, k) => Math.max(0, p.cd[k] - now());
    const useCd = (p, k) => { p.cd[k] = now() + R.cooldown_sec[k]; };

    const QUIET = new Set(["ためした", "終わり", "動けない", "動ける"]);
    function addLog(who, op, from, to, note) {
      g.log.push({ t: g.elapsed(), who, op, from: from || [], to: to || [], me: g.me.cards.length, cpu: g.cpu.cards.length, note: note || "" });
      if (!QUIET.has(op)) checkStuck();
    }
    g.addLog = addLog;

    // ---------- 動けない（KJ-002 追記。R-023） ----------
    // 手札をそのまま並べて投げられる語（N5 の1字か辞書の語、投げ済みでない）が1つも無い状態
    g.throwableInHand = (p) => {
      const cs = p.cards.map((x) => x.c).filter((c) => c !== GARBAGE);
      const have = {};
      for (const c of cs) have[c] = (have[c] || 0) + 1;
      for (const c of Object.keys(have)) if (isN5(T, c) && !g.used.has(c)) return c;
      for (const w of T.WORDS.values()) {
        if (g.used.has(w.w)) continue;
        const need = {};
        let ok = true;
        for (const c of w.w) { need[c] = (need[c] || 0) + 1; if (!have[c] || need[c] > have[c]) { ok = false; break; } }
        if (ok) return w.w;
      }
      return null;
    };
    // 投げる以外で使える手（待ち時間は残りの秒数を添える）
    g.movesInHand = (p) => {
      const cs = p.cards.map((x) => x.c);
      const out = [];
      if (cs.some((c) => canSplit(T, c))) out.push("割る");
      if (p.cards.some((a) => p.cards.some((b) => a !== b && joinResults(T, a.c, b.c).length))) out.push("くっつける");
      for (const [name, k, ok] of [["反転", "invert", (c) => T.INV.has(c)], ["巡り", "cycle", (c) => T.NEXT.has(c)], ["同音", "homophone", (c) => T.HOMO.has(c)]]) {
        if (!cs.some(ok)) continue;
        const left = g.cdLeft ? g.cdLeft(p, k) : 0;
        out.push(left > 0 ? `${name}（待ち ${Math.ceil(left)}秒）` : name);
      }
      return out;
    };
    function checkStuck() {
      if (!g.me || !g.cpu || g.over) return;
      for (const p of [g.me, g.cpu]) {
        if (!p.cards.length) continue; // 空のカゴはすぐ袋から補充される
        const w = g.throwableInHand(p);
        if (!w && !p.stuck) {
          p.stuck = true;
          const mv = g.movesInHand(p);
          g.log.push({ t: g.elapsed(), who: p.name, op: "動けない", from: p.cards.map((x) => x.c), to: [], me: g.me.cards.length, cpu: g.cpu.cards.length,
            note: "投げられる語なし。使える手：" + (mv.length ? mv.join("・") : "なし") });
        } else if (w && p.stuck) {
          p.stuck = false;
          g.log.push({ t: g.elapsed(), who: p.name, op: "動ける", from: p.cards.map((x) => x.c), to: [], me: g.me.cards.length, cpu: g.cpu.cards.length, note: "投げられる語：" + w });
        }
      }
    }
    addLog("—", "はじめ", [], [], "最初の手 " + g.me.cards.map((x) => x.c).join("") + " / " + g.cpu.cards.map((x) => x.c).join(""));

    function cardsOf(p, ids) {
      if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) return null;
      const cs = ids.map((id) => g.byId(p, id));
      return cs.every(Boolean) ? cs : null;
    }
    function replaceCards(p, ids, chars) { // ids の位置に chars を入れる
      const pos = p.cards.findIndex((x) => x.id === ids[0]);
      p.cards = p.cards.filter((x) => !ids.includes(x.id));
      const nc = chars.map((c) => card(c));
      p.cards.splice(Math.max(0, pos), 0, ...nc);
      return nc;
    }
    const fail = (why) => ({ ok: false, why });
    const live = () => !g.over;

    g.split = (p, ids) => {
      const cs = cardsOf(p, ids);
      if (!live() || !cs || cs.length !== 1) return fail("1枚だけ");
      const c = cs[0].c;
      if (!canSplit(T, c)) return fail("割れない");
      const nc = replaceCards(p, ids, splitOnce(T, c));
      addLog(p.name, "割る", [c], nc.map((x) => x.c));
      return { ok: true, cards: nc };
    };
    g.join = (p, ids, choice) => {
      const cs = cardsOf(p, ids);
      if (!live() || !cs || cs.length !== 2) return fail("2枚だけ");
      const rs = joinResults(T, cs[0].c, cs[1].c);
      if (!rs.length) return fail(joinReversed(T, cs[0].c, cs[1].c) ? "並べる順が逆" : "くっつかない");
      const to = choice === undefined ? rs[0] : choice;
      if (!rs.includes(to)) return fail("その字にはならない");
      const nc = replaceCards(p, ids, [to]);
      addLog(p.name, "くっつける", cs.map((x) => x.c), [to]);
      return { ok: true, cards: nc };
    };
    function oneStep(op, k, map) {
      return (p, ids) => {
        const cs = cardsOf(p, ids);
        if (!live() || !cs || cs.length !== 1) return fail("1枚だけ");
        const c = cs[0].c;
        if (!map.has(c)) return fail("できない字");
        if (!g.ready(p, k)) return fail("待ち時間");
        useCd(p, k);
        const nc = replaceCards(p, ids, [map.get(c)]);
        addLog(p.name, op, [c], [nc[0].c]);
        return { ok: true, cards: nc };
      };
    }
    g.invert = oneStep("反転", "invert", T.INV);
    g.cycle = oneStep("巡り", "cycle", T.NEXT);
    g.homophone = (p, ids, to) => {
      const cs = cardsOf(p, ids);
      if (!live() || !cs || cs.length !== 1) return fail("1枚だけ");
      const c = cs[0].c;
      if (!homoChars(T, c).includes(to)) return fail("同じ読みではない");
      if (!g.ready(p, "homophone")) return fail("待ち時間");
      useCd(p, "homophone");
      const nc = replaceCards(p, ids, [to]);
      addLog(p.name, "同音", [c], [to]);
      return { ok: true, cards: nc };
    };
    g.throw = (p, ids) => {
      const cs = cardsOf(p, ids);
      if (!live() || !cs) return fail("札がない");
      const text = cs.map((x) => x.c).join("");
      const th = throwable(T, g.used, text);
      if (!th.ok) return fail(th.why);
      const q = g.opp(p);
      p.cards = p.cards.filter((x) => !ids.includes(x.id));
      g.used.add(text);
      let pieces = [], note;
      if (s.dest === "throw") { pieces = delivered(T, text); note = "相手に届く"; }
      else if (s.dest === "garbage") { pieces = [...text].map(() => GARBAGE); note = "消えて相手に ■"; }
      else note = "消えた";
      q.cards.push(...pieces.map((c) => card(c, true)));
      addLog(p.name, "投げる", [...text], pieces, note);
      // 特別な語・つながる相手（D-015）
      const prev = p.lastSpecial && T.SPECIAL.get(p.lastSpecial);
      if (prev && prev.next.includes(text)) g.events.push({ type: "fx", who: p.name, text: p.lastSpecial + text });
      else if (T.SPECIAL.has(text)) g.events.push({ type: "fx", who: p.name, text });
      p.lastSpecial = T.SPECIAL.has(text) ? text : null;
      g.events.push({ type: "throw", who: p.name, text, pieces });
      refill(p);
      checkOver([q]);
      return { ok: true, text, pieces };
    };
    // はじかれた並び（KJ-002 の2）。画面側が「並べたのにやめた」ときに呼ぶ
    g.tried = (p, chars, why) => { if (live()) addLog(p.name, "ためした", chars, [], why); };

    function refill(p) {
      if (p.cards.length === 0) {
        p.cards.push(...draw(p, R.refill_when_empty).map((c) => card(c, true)));
        addLog(p.name, "補充", [], p.cards.map((x) => x.c), "カゴが空");
      }
    }
    function checkOver(ps) {
      if (g.over) return;
      const lost = ps.filter((p) => p.cards.length > R.basket_size);
      if (!lost.length) return;
      g.over = true;
      g.winner = lost.length === 2 ? null : g.opp(lost[0]);
      addLog("—", "終わり", [], [], lost.length === 2 ? "引き分け（二人ともあふれた）" : `${g.winner.name}の勝ち（${lost[0].name}のカゴがあふれた）`);
      g.events.push({ type: "over", winner: g.winner });
    }
    // 時間で落ちてくる（KJ-002 の3）。画面が定期的に呼ぶ
    g.tick = () => {
      let changed = false;
      while (live() && now() >= g.nextDrop) {
        for (const p of [g.me, g.cpu]) p.cards.push(...draw(p, 1).map((c) => card(c, true)));
        addLog("二人", "落ちてくる", [], [g.me.cards[g.me.cards.length - 1].c, g.cpu.cards[g.cpu.cards.length - 1].c], "あなた・CPU の順");
        g.nextDrop += R.drop_every_sec;
        checkOver([g.me, g.cpu]);
        changed = true;
      }
      return changed;
    };

    // ---------- CPU（1段階。R-009） ----------
    g.cpuDelay = () => { const [a, b] = R.cpu.pace[s.cpuPace]; return a + rand() * (b - a); };
    const pick = (a) => a[Math.floor(rand() * a.length)];
    function pickIds(p, text) {
      const pool = p.cards.slice(), ids = [];
      for (const ch of text) { const i = pool.findIndex((x) => x.c === ch); if (i < 0) return null; ids.push(pool[i].id); pool.splice(i, 1); }
      return ids;
    }
    g.cpuTurn = () => {
      if (!live()) return null;
      const p = g.cpu, r = R.cpu, full = p.cards.length >= R.basket_size - 4;
      if (full || rand() < r.throw_chance) {
        const ws = T.COMMON_WORDS.filter((w) => !g.used.has(w.w) && pickIds(p, w.w));
        if (ws.length) {
          const L = Math.max(...ws.map((w) => [...w.w].length));
          const w = pick(ws.filter((x) => [...x.w].length === L));
          return g.throw(p, pickIds(p, w.w));
        }
      }
      const joins = [];
      for (const a of p.cards) for (const b of p.cards) {
        if (a !== b) for (const k of joinResults(T, a.c, b.c)) joins.push([a, b, k]);
      }
      const good = joins.filter((j) => isN5(T, j[2]));
      if (joins.length) { const j = pick(good.length ? good : joins); return g.join(p, [j[0].id, j[1].id], j[2]); }
      const singles = p.cards.filter((x) => isN5(T, x.c) && !g.used.has(x.c));
      if (singles.length && (full || rand() < 0.4)) return g.throw(p, [pick(singles).id]);
      const cyc = p.cards.filter((x) => T.NEXT.has(x.c));
      if (cyc.length && g.ready(p, "cycle") && rand() < 0.5) return g.cycle(p, [pick(cyc).id]);
      const inv = p.cards.filter((x) => T.INV.has(x.c));
      if (inv.length && g.ready(p, "invert") && rand() < 0.3) return g.invert(p, [pick(inv).id]);
      return null;
    };

    // ---------- ログの書き出し（KJ-002 の2） ----------
    g.logText = () => {
      const pad = (n) => String(n).padStart(2, "0");
      const d = g.startedAt;
      const ds = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      const head = [
        "# 漢字版（仮）モック ログ",
        `# はじめた時刻 ${ds}（端末の時計）`,
        ...settingsLabel(D, s).map((x) => "# 設定 " + x),
        `# 決まり カゴ=${R.basket_size} 最初の手=${R.start_hand} 同じ字は袋に${R.same_char_max_in_start}枚 空なら${R.refill_when_empty}枚`,
        `# 決まり 待ち時間 反転=${R.cooldown_sec.invert}秒 巡り=${R.cooldown_sec.cycle}秒 同音=${R.cooldown_sec.homophone}秒`,
        `# 決まり CPU 語を投げる割合=${R.cpu.throw_chance} 落ちてくる間隔=${R.drop_every_sec}秒（設定があり のときだけ）`,
        "# 手 はじめ・割る・くっつける・反転・巡り・同音・投げる・ためした・落ちてくる・補充・動けない（投げられる語が手札に無くなった。使った札＝その時の手札）・動ける（無くなった状態から戻った）・終わり",
        "# データ " + FILES.map((f) => `${f}=${D[f].version}`).join(" "),
        `# 字 ${T.N5.size}・語 ${T.WORDS.size}`,
        "秒\tどちら\t手\t使った札\tできた札\tあなたのカゴ\tCPUのカゴ\tメモ",
      ];
      const rows = g.log.map((e) => [e.t.toFixed(1), e.who, e.op, e.from.join(" "), e.to.join(" "), e.me, e.cpu, e.note].join("\t"));
      return head.concat(rows).join("\n") + "\n";
    };
    return g;
  }

  return {
    GARBAGE, FILES, SETTINGS, normalizeSettings, settingsLabel,
    makeTables, isN5, splitOnce, canSplit, delivered, joinResults, joinReversed, throwable, homoChars, marks,
    createGame,
  };
});
