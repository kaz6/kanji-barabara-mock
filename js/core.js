/* 漢字版（仮）モックの遊びの決まり。画面（DOM）には触らない。
   ブラウザでは window.KJ、Node では require("./js/core.js") で使う（tests/ から）。
   KJ-003：「役づくりの競争」（D-017・D-018）。手札で言葉を作って放つと点が入り、場から字を取れる */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.KJ = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 相手の選び方（KJ-004）。ひとりで＝CPU なし・場の取り合いなし・50点で終わらず制限時間で終わる
  const OPPONENTS = [
    { key: "solo", label: "ひとりで" },
    { key: "weak", label: "とても弱い" },
    { key: "normal", label: "いまの強さ" },
  ];
  // 並べ方（KJ-005）。手札で選ぶ＝手札の上で選んだ順にそのまま操作する／台に並べる＝台に並べてから操作する
  const LAYOUTS = [
    { key: "hand", label: "手札で選ぶ" },
    { key: "table", label: "台に並べる" },
  ];
  const layoutLabel = (key) => (LAYOUTS.find((l) => l.key === key) || LAYOUTS[0]).label;
  const cpuInterval = (D, key) => (key === "weak" ? D.rules.cpu.weak_interval_sec : D.rules.cpu.interval_sec);

  const FILES = ["kanji", "words", "readings", "parts", "antonyms", "cycles", "radical_forms", "special", "rules"];

  // ---------- 表を引く ----------
  function makeTables(D) {
    const T = {};
    T.N5 = new Set(D.kanji.kanji.map((k) => k.c));
    T.JOUYOU = new Set(D.parts.jouyou || []); // N5 の外でも「字」として見せる（KJ-003）
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
  // 画面で「字」として見せるか（N5 か常用漢字）。部品の見た目にしない
  const isChar = (T, c) => T.N5.has(c) || T.JOUYOU.has(c);
  const splitOnce = (T, c) => T.parts[c] || [c];
  const canSplit = (T, c) => !!T.parts[c];
  // 部品にバラして届く形（D-003・D-004）。KJ-003 の遊びでは使わない（消すかは作者が決める）
  function delivered(T, text) {
    const cs = [...text];
    if (cs.length <= 2) return cs;
    const one = cs.flatMap((c) => splitOnce(T, c));
    return cs.length === 3 ? one : one.flatMap((c) => splitOnce(T, c));
  }
  const joinResults = (T, a, b) => T.JOIN.get(a + b) || [];
  // 逆に並べればくっつく（順番の決まりは変えない。表示だけ）
  const joinReversed = (T, a, b) => joinResults(T, a, b).length === 0 && joinResults(T, b, a).length > 0;
  // 放てるか：words.json の語（1〜4字）か、N5 の1字。一度放った言葉は二人とも使えない（D-005）
  function releasable(T, used, text) {
    if (!text) return { ok: false, why: "" };
    if (used.has(text)) return { ok: false, why: "放った言葉" };
    if (T.WORDS.has(text) || ([...text].length === 1 && isN5(T, text))) return { ok: true };
    if ([...text].length === 1) return { ok: false, why: "部品は放てない" };
    return { ok: false, why: "辞書にない" };
  }
  // 役の点数（R-026）。1字1・2字3・3字6・4字12、四字熟語の印つきは倍、特別な語はさらに倍
  function scoreOf(D, T, text) {
    const S = D.rules.score;
    const n = [...text].length;
    let pts = S.by_length[String(n)] || 0;
    const parts = [`${n}字${pts}`];
    const w = T.WORDS.get(text);
    if (w && w.yoji) { pts *= S.yoji_mult; parts.push(`四字熟語×${S.yoji_mult}`); }
    if (T.SPECIAL.has(text)) { pts *= S.special_mult; parts.push(`特別な語×${S.special_mult}`); }
    return { pts, how: parts.join("・") };
  }
  const homoChars = (T, c) => [...new Set((T.HOMO.get(c) || []).flatMap((g) => g.chars))].filter((x) => x !== c);
  function marks(T, c) {
    let m = "";
    if (T.INV.has(c)) m += "反";
    if (T.NEXT.has(c)) m += "巡";
    if (T.HOMO.has(c)) m += "音";
    return m;
  }
  // ログの頭に書く仮置きの値
  function opponentLabel(D, key) {
    if (key === "solo") return `ひとりで（CPU なし。場の取り合いなし。50点では終わらず、${D.rules.win.time_limit_sec / 60}分たったら終わって点を出す。CPU の列は 0）`;
    const [a, b] = cpuInterval(D, key);
    return key === "weak" ? `とても弱い（CPU は ${a}〜${b}秒に1回動く。動き方はいまの CPU のまま）` : `いまの強さ（CPU は ${a}〜${b}秒に1回動く）`;
  }
  function rulesLabel(D, key) {
    const R = D.rules, S = R.score;
    key = key || R.opponent_default;
    const [a, b] = cpuInterval(D, key);
    return [
      `場=${R.field_size}枚 最初の手札=${R.start_hand}枚 手札の上限=${R.hand_max}枚＋部品の置き場${R.split_extra}枚（置き場は割るときだけ増える。全部で${R.hand_max + R.split_extra}枚まで）山=N5 の字を${R.same_char_in_deck}枚ずつ（尽きたら足す）`,
      `点数 ${Object.entries(S.by_length).map(([n, p]) => `${n}字${p}`).join("・")} 四字熟語×${S.yoji_mult} 特別な語×${S.special_mult}`,
      `放ったら 放った字数×${R.take_per_char}枚を場から選んで取れる。放った言葉は消える（相手には届かない）`,
      `引き直し ${R.redraw.cost}点で手札を全部入れ替え（${R.start_hand}枚）。${R.redraw.cost}点ない人は${R.redraw.free_wait_sec}秒待って0点で`,
      `勝ち 先に${R.win.score}点、または${R.win.time_limit_sec / 60}分で点の多い方（同点は引き分け）。ひとりでは50点で終わらず${R.win.time_limit_sec / 60}分で終わる`,
      `待ち時間 反転=${R.cooldown_sec.invert}秒 巡り=${R.cooldown_sec.cycle}秒 同音=${R.cooldown_sec.homophone}秒（その人の操作ごと）`,
      key === "solo" ? "CPU なし" : `CPU ${a}〜${b}秒に1回動く`,
    ];
  }

  // ---------- 遊び ----------
  // env: { now: () => 秒, rand: () => 0..1, date: () => Date }
  function createGame(D, T, env) {
    env = env || {};
    const now = env.now || (() => Date.now() / 1000);
    const rand = env.rand || Math.random;
    const R = D.rules;
    let uid = 0;
    const opponent = OPPONENTS.some((o) => o.key === env.opponent) ? env.opponent : R.opponent_default;
    const g = { D, T, opponent, solo: opponent === "solo", log: [], events: [], used: new Set(), over: false, winner: null,
      startedAt: (env.date || (() => new Date()))() };
    g.layout = LAYOUTS.some((l) => l.key === env.layout) ? env.layout : (R.layout_default || "hand");
    const t0 = now();
    g.now = now;
    g.elapsed = () => now() - t0;
    g.endsAt = t0 + R.win.time_limit_sec;
    g.timeLeft = () => Math.max(0, g.endsAt - now());

    const card = (c, fresh) => ({ id: ++uid, c, t: now(), fresh: !!fresh });
    function shuffle(a) {
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    }
    const fullSet = () => { const out = []; for (let i = 0; i < R.same_char_in_deck; i++) out.push(...T.N5); return out; };
    g.deck = shuffle(fullSet());
    function draw(n) {
      const out = [];
      for (let i = 0; i < n; i++) {
        if (!g.deck.length) g.deck.push(...shuffle(fullSet())); // 山が尽きたら足す
        out.push(g.deck.shift());
      }
      return out;
    }
    function player(key, name, n) {
      return { key, name, cards: draw(n).map((c) => card(c)), cd: { invert: 0, cycle: 0, homophone: 0 },
        score: 0, takes: 0, redrawAt: null, lastSpecial: null, stuck: false };
    }
    g.me = player("me", "あなた", R.start_hand);
    g.cpu = player("cpu", "CPU", g.solo ? 0 : R.start_hand); // ひとりで：CPU は出さない（山からも引かない）
    const players = () => (g.solo ? [g.me] : [g.me, g.cpu]);
    // 手札の枠と、割るときだけ増える部品の置き場（KJ-004）。札の tray が true なら置き場
    const handCount = (p) => p.cards.filter((x) => !x.tray).length;
    const trayCount = (p) => p.cards.filter((x) => x.tray).length;
    const totalMax = R.hand_max + R.split_extra;
    g.handCount = handCount;
    g.trayCount = trayCount;
    g.field = draw(R.field_size).map((c) => card(c));
    g.opp = (p) => (p === g.me ? g.cpu : g.me);
    g.byId = (p, id) => p.cards.find((x) => x.id === id);
    g.ready = (p, k) => now() >= p.cd[k];
    g.cdLeft = (p, k) => Math.max(0, p.cd[k] - now());
    g.redrawLeft = (p) => (p.redrawAt === null ? 0 : Math.max(0, p.redrawAt - now()));
    const useCd = (p, k) => { p.cd[k] = now() + R.cooldown_sec[k]; };

    const QUIET = new Set(["ためした", "終わり", "動けない", "動ける", "入れ替え", "並べ方"]);
    function addLog(who, op, from, to, pts, note) {
      g.log.push({ t: g.elapsed(), who, op, from: from || [], to: to || [], pts: pts || 0,
        meScore: g.me.score, cpuScore: g.cpu.score, me: g.me.cards.length, cpu: g.cpu.cards.length, note: note || "" });
      if (!QUIET.has(op)) checkStuck();
    }
    g.addLog = addLog;

    // ---------- 動けない（R-023 を KJ-003 に合わせた） ----------
    // 手札をそのまま並べて放てる言葉（N5 の1字か辞書の語、放っていないもの）が1つも無い状態
    g.releasableInHand = (p) => {
      const cs = p.cards.map((x) => x.c);
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
    // 放つ以外で使える手（待ち時間は残りの秒数を添える）
    g.movesInHand = (p) => {
      const cs = p.cards.map((x) => x.c);
      const out = [];
      if (cs.some((c) => canSplit(T, c)) && cs.length < totalMax) out.push("割る");
      if (p.cards.some((a) => p.cards.some((b) => a !== b && joinResults(T, a.c, b.c).length))) out.push("くっつける");
      for (const [name, k, ok] of [["反転", "invert", (c) => T.INV.has(c)], ["巡り", "cycle", (c) => T.NEXT.has(c)], ["同音", "homophone", (c) => T.HOMO.has(c)]]) {
        if (!cs.some(ok)) continue;
        const left = g.cdLeft(p, k);
        out.push(left > 0 ? `${name}（待ち ${Math.ceil(left)}秒）` : name);
      }
      out.push(p.score >= R.redraw.cost ? `引き直し（${R.redraw.cost}点）` : `引き直し（${R.redraw.free_wait_sec}秒待つ）`);
      return out;
    };
    function checkStuck() {
      if (!g.me || !g.cpu || g.over) return;
      for (const p of players()) {
        const w = g.releasableInHand(p);
        if (!w && !p.stuck) {
          p.stuck = true;
          g.log.push({ t: g.elapsed(), who: p.name, op: "動けない", from: p.cards.map((x) => x.c), to: [], pts: 0,
            meScore: g.me.score, cpuScore: g.cpu.score, me: g.me.cards.length, cpu: g.cpu.cards.length,
            note: "放てる言葉なし。使える手：" + g.movesInHand(p).join("・") });
        } else if (w && p.stuck) {
          p.stuck = false;
          g.log.push({ t: g.elapsed(), who: p.name, op: "動ける", from: p.cards.map((x) => x.c), to: [], pts: 0,
            meScore: g.me.score, cpuScore: g.cpu.score, me: g.me.cards.length, cpu: g.cpu.cards.length, note: "放てる言葉：" + w });
        }
      }
    }
    g.startLayout = g.layout;
    addLog("—", "はじめ", [], [], 0,
      `手札 ${g.me.cards.map((x) => x.c).join("")} / ${g.cpu.cards.map((x) => x.c).join("")}・場 ${g.field.map((x) => x.c).join("")}`);

    function cardsOf(p, ids) {
      if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) return null;
      const cs = ids.map((id) => g.byId(p, id));
      return cs.every(Boolean) ? cs : null;
    }
    function replaceCards(p, ids, chars) { // ids の位置に chars を入れる
      const pos = p.cards.findIndex((x) => x.id === ids[0]);
      p.cards = p.cards.filter((x) => !ids.includes(x.id));
      const nc = chars.map((c) => card(c));
      // できた札は、手札に空きがあれば手札へ。なければ部品の置き場へ（R-032）
      let room = R.hand_max - handCount(p);
      for (const x of nc) { if (room > 0) room--; else x.tray = true; }
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
      if (p.cards.length + 1 > totalMax) return fail("手札も置き場もいっぱい");
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

    // ---------- 放つ（D-017） ----------
    g.release = (p, ids) => {
      const cs = cardsOf(p, ids);
      if (!live() || !cs) return fail("札がない");
      const text = cs.map((x) => x.c).join("");
      const r = releasable(T, g.used, text);
      if (!r.ok) return fail(r.why);
      const { pts, how } = scoreOf(D, T, text);
      const n = [...text].length;
      p.cards = p.cards.filter((x) => !ids.includes(x.id));
      g.used.add(text);
      p.score += pts;
      p.takes += n * R.take_per_char;
      addLog(p.name, "放つ", [...text], [], pts, `${how}。場から${n * R.take_per_char}枚取れる`);
      // 特別な語・つながる相手（D-015）。演出だけ
      const prev = p.lastSpecial && T.SPECIAL.get(p.lastSpecial);
      if (prev && prev.next.includes(text)) g.events.push({ type: "fx", who: p.name, text: p.lastSpecial + text });
      else if (T.SPECIAL.has(text)) g.events.push({ type: "fx", who: p.name, text });
      p.lastSpecial = T.SPECIAL.has(text) ? text : null;
      g.events.push({ type: "release", who: p.name, text, pts });
      checkOver();
      return { ok: true, text, pts };
    };

    // ---------- 取る：場の札を手札へ。空いたところは同じ位置に山から出す ----------
    g.take = (p, fieldId) => {
      if (!live()) return fail("終わった");
      if (p.takes <= 0) return fail("取れる枚数がない");
      if (handCount(p) >= R.hand_max) return fail("手札がいっぱい");
      const i = g.field.findIndex((x) => x.id === fieldId);
      if (i < 0) return fail("場にない"); // 相手が先に取った
      const x = g.field[i];
      const [nc] = draw(1).map((c) => card(c, true));
      g.field[i] = nc;
      const got = card(x.c, true);
      p.cards.push(got); // 手札の枠に入る（置き場は割るときだけ）
      p.takes -= 1;
      addLog(p.name, "取る", [x.c], [x.c], 0, `場に ${nc.c} が出た。残り${p.takes}枚取れる`);
      return { ok: true, card: got, c: x.c };
    };

    // ---------- 引き直し（D-018） ----------
    function doRedraw(p, pts, note) {
      const old = p.cards.map((x) => x.c);
      g.deck.push(...old);
      shuffle(g.deck);
      p.cards = draw(R.start_hand).map((c) => card(c, true));
      p.redrawAt = null;
      addLog(p.name, "引き直し", old, p.cards.map((x) => x.c), pts, note);
    }
    g.redraw = (p) => {
      if (!live()) return fail("終わった");
      if (p.redrawAt !== null) return fail("待っている");
      if (p.score >= R.redraw.cost) {
        p.score -= R.redraw.cost;
        doRedraw(p, -R.redraw.cost, `${R.redraw.cost}点払った`);
        return { ok: true, paid: R.redraw.cost };
      }
      p.redrawAt = now() + R.redraw.free_wait_sec;
      addLog(p.name, "引き直し", [], [], 0, `${R.redraw.cost}点ないので${R.redraw.free_wait_sec}秒待つ（待つあいだも動ける）`);
      return { ok: true, waiting: R.redraw.free_wait_sec };
    };

    // はじかれた並び。画面側が「並べたのにやめた」ときに呼ぶ
    // 並べ方の切り替え（途中でもできる）。ログに残す
    g.setLayout = (key) => {
      if (!LAYOUTS.some((l) => l.key === key) || key === g.layout) return fail("同じ");
      g.layout = key;
      addLog("あなた", "並べ方", [], [], 0, `${layoutLabel(key)}に切り替え`);
      return { ok: true };
    };
    // 手札の中で2枚の位置を入れ替える（手札どうし・置き場どうし）。持っている札も数も変わらない
    g.swap = (p, idA, idB) => {
      if (!live()) return fail("終わった");
      const a = g.byId(p, idA), b = g.byId(p, idB);
      if (!a || !b || a === b) return fail("札がない");
      if (!!a.tray !== !!b.tray) return fail("手札と置き場の間は入れ替えない");
      const i = p.cards.indexOf(a), j = p.cards.indexOf(b);
      p.cards[i] = b; p.cards[j] = a;
      addLog(p.name, "入れ替え", [a.c, b.c], [b.c, a.c]);
      return { ok: true };
    };
    g.tried = (p, chars, why) => { if (live()) addLog(p.name, "ためした", chars, [], 0, why); };

    function finish(winner, why) {
      g.over = true;
      g.winner = winner;
      addLog("—", "終わり", [], [], 0, g.solo ? `ひとりで ${g.me.score}点（${why}）` : (winner ? `${winner.name}の勝ち` : "引き分け") + `（${why}）`);
      g.events.push({ type: "over", winner, solo: g.solo });
    }
    function checkOver() {
      if (g.over) return;
      const hit = [g.me, g.cpu].filter((p) => p.score >= R.win.score);
      if (g.solo) return; // ひとりでは50点で終わらない
      if (hit.length) finish(hit[0], `先に${R.win.score}点`);
    }
    // 画面が定期的に呼ぶ：0点の引き直しの待ちと、時間切れ
    g.tick = () => {
      if (!live()) return false;
      let changed = false;
      for (const p of players()) {
        if (p.redrawAt !== null && now() >= p.redrawAt) { doRedraw(p, 0, `${R.redraw.free_wait_sec}秒待った（0点）`); changed = true; }
      }
      if (now() >= g.endsAt && g.solo) {
        finish(null, `${R.win.time_limit_sec / 60}分`);
        changed = true;
      } else if (now() >= g.endsAt) {
        const a = g.me.score, b = g.cpu.score;
        finish(a === b ? null : a > b ? g.me : g.cpu, `${R.win.time_limit_sec / 60}分 ${a}対${b}`);
        changed = true;
      }
      return changed;
    };

    // ---------- CPU（1段階。8〜12秒に1回。速さで強くしない） ----------
    g.cpuDelay = () => { const [a, b] = cpuInterval(D, g.opponent); return a + rand() * (b - a); };
    const pick = (a) => a[Math.floor(rand() * a.length)];
    function pickIds(p, text) {
      const pool = p.cards.slice(), ids = [];
      for (const ch of text) { const i = pool.findIndex((x) => x.c === ch); if (i < 0) return null; ids.push(pool[i].id); pool.splice(i, 1); }
      return ids;
    }
    // 場の札で、手札と合わせて語になるものを先に取る。なければ無作為
    function cpuTakeAll(p) {
      while (p.takes > 0 && handCount(p) < R.hand_max) {
        const hand = p.cards.map((x) => x.c);
        const covers = (have, word) => {
          const left = have.slice();
          return [...word].every((ch) => { const i = left.indexOf(ch); if (i < 0) return false; left.splice(i, 1); return true; });
        };
        const useful = g.field.filter((f) => T.COMMON_WORDS.some((w) => !g.used.has(w.w) && w.w.includes(f.c) && covers([...hand, f.c], w.w)));
        const f = pick(useful.length ? useful : g.field);
        if (!g.take(p, f.id).ok) break;
      }
    }
    g.cpuTurn = () => {
      if (!live() || g.solo) return null;
      const p = g.cpu;
      if (p.takes > 0 && handCount(p) < R.hand_max) { cpuTakeAll(p); return { ok: true, op: "取る" }; }
      const ws = T.COMMON_WORDS.filter((w) => !g.used.has(w.w) && pickIds(p, w.w));
      if (ws.length) {
        const best = Math.max(...ws.map((w) => scoreOf(D, T, w.w).pts));
        const w = pick(ws.filter((x) => scoreOf(D, T, x.w).pts === best));
        const r = g.release(p, pickIds(p, w.w));
        if (r.ok) cpuTakeAll(p);
        return r;
      }
      const joins = [];
      for (const a of p.cards) for (const b of p.cards) {
        if (a !== b) for (const k of joinResults(T, a.c, b.c)) joins.push([a, b, k]);
      }
      const good = joins.filter((j) => isN5(T, j[2]));
      if (good.length) { const j = pick(good); return g.join(p, [j[0].id, j[1].id], j[2]); }
      const singles = p.cards.filter((x) => isN5(T, x.c) && !g.used.has(x.c));
      if (singles.length && rand() < R.cpu.single_release_chance) {
        const r = g.release(p, [pick(singles).id]);
        if (r.ok) cpuTakeAll(p);
        return r;
      }
      if (joins.length) { const j = pick(joins); return g.join(p, [j[0].id, j[1].id], j[2]); }
      const cyc = p.cards.filter((x) => T.NEXT.has(x.c));
      if (cyc.length && g.ready(p, "cycle") && rand() < 0.5) return g.cycle(p, [pick(cyc).id]);
      const inv = p.cards.filter((x) => T.INV.has(x.c));
      if (inv.length && g.ready(p, "invert") && rand() < 0.3) return g.invert(p, [pick(inv).id]);
      if (!singles.length && !ws.length && p.redrawAt === null) return g.redraw(p); // 放てる言葉がない
      return null;
    };

    // ---------- ログの書き出し ----------
    g.logText = () => {
      const pad = (n) => String(n).padStart(2, "0");
      const d = g.startedAt;
      const ds = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      const head = [
        "# 漢字版（仮）モック ログ（KJ-003 役づくりの競争）",
        `# はじめた時刻 ${ds}（端末の時計）`,
        `# 相手 ${opponentLabel(D, g.opponent)}`,
        `# 並べ方 ${layoutLabel(g.startLayout)}（はじめたとき。途中で切り替えると「並べ方」の行が残る）`,
        ...rulesLabel(D, g.opponent).map((x) => "# 仮置き " + x),
        "# 手 はじめ・割る・くっつける・反転・巡り・同音・放つ・取る・引き直し・入れ替え（手札の中で札の位置を替えた）・並べ方（切り替えた）・ためした（並べたのに放てず・くっつけられずにやめた並び）・動けない（放てる言葉が手札に無くなった。使った札＝その時の手札）・動ける・終わり",
        "# 点＝その手で増えた点（引き直しで払った点はマイナス）",
        "# データ " + FILES.map((f) => `${f}=${D[f].version}`).join(" "),
        `# 字 ${T.N5.size}・語 ${T.WORDS.size}`,
        "秒\tどちら\t手\t使った札\tできた札\t点\tあなたの点\tCPUの点\tあなたの手札\tCPUの手札\tメモ",
      ];
      const rows = g.log.map((e) => [e.t.toFixed(1), e.who, e.op, e.from.join(" "), e.to.join(" "), e.pts, e.meScore, e.cpuScore, e.me, e.cpu, e.note].join("\t"));
      return head.concat(rows).join("\n") + "\n";
    };
    return g;
  }

  return {
    FILES, OPPONENTS, LAYOUTS, layoutLabel, makeTables, isN5, isChar, splitOnce, canSplit, delivered, joinResults, joinReversed,
    releasable, scoreOf, homoChars, marks, rulesLabel, opponentLabel, createGame,
  };
});
