# CLAUDE.md（kanji-barabara-mock）

漢字版（仮）のモック。index.html 1枚＋js/core.js＋data/*.json。依存パッケージなし。

## まず読むもの

- docs/DECISION_LOG.md（R-番号。「却下」とある案は再提案しない）。正本は Notion の DECISION_LOG（漢字版）41da8a5d-fd45-8184-b0e9-c164462b1808
- docs/SESSION_STATE.md（進捗・次にやること・未確定）
- ひらがな分解（仮）のリポジトリには触らない

## 中身の分け方

- `js/core.js`：遊びの決まり（表引き・割る・くっつける・放つ・点数・場から取る・引き直し・待ち時間・勝ち・CPU・ログ）。DOM に触らない。ブラウザでは `window.KJ`、Node では `require`。合言葉の部屋（人と対戦。KJ-033）の先着は `createMatchClient`、部屋を作る／入るは `hostRoom`・`findRoom`・`joinRoom`・`roomWaiter`（つなぎは差し替え。テストは `memoryClaims`。本物のつなぎ〔kj_claims の REST と Realtime〕は index.html）
- `index.html`：画面だけ。決まりは core.js を呼ぶ
- `data/kanji.json`・`words.json`：字と語に `lv`（N5／N4）と、小1（KJ-044。小学1年の80字）の印 `g1`（N5・N4 のどちらにも無い小1 の字は `lv`＝G1）。遊ぶときは `makeTables(D, level)` でレベルに絞る。作り直しは `python3 tools/build_data.py`（`pip install jamdict-data`。`--level N5` で N5 だけ）。手作りの表（parts など）はこのスクリプトでは作らない。N4 で足した割り方の一覧は docs/N4_TABLES.md、小1 の字と割り方は docs/G1_TABLES.md
- `fonts/kj-glyphs.otf`・`fonts/kj-glyphs.css`・`data/glyphs.json`・`docs/GLYPHS.md`：端末の字体に無い字（JIS X 0208 の外。部首補助・簡体字の形・拡張B など）の字形を同梱したもの。部品表・偏・巡りに新しい字を足したら `python3 tools/build_glyphs.py`（要 fontTools と Noto Serif CJK JP）で作り直す。テスト（tests/data.test.js）が、札の字が全部この一覧にあるかを見る
- `fonts/kj-fx.woff`・`fonts/kj-fx.css`・`fonts/OFL-YujiSyuku.txt`：特別な語の演出（`#fx .c`）だけの筆文字（Yuji Syuku。KJ-063）。字は `data/special.json` の語（`special`）と演出だけ特別の語（`fx_words`。金玉。KJ-064：点は変えず、2字を金色で同時に出す）に絞る。特別な語・演出だけの語を足したら `python3 tools/build_fx_font.py`（元の字体は `npm pack @fontsource/yuji-syuku` で取る。使い方は先頭の説明）で作り直す。テスト：tests/fxfont.test.js・tests/fxfont.browser.test.mjs
- `js/strings.js`：操作のボタンの文字（英語）と、印の SVG（Flip の i・Cycle の C・Same reading の S に組み込む。札の角の印も同じ形。KJ-048）。操作のボタンの文字は英語。js/strings.js に置き、index.html に直書きしない。ボタン以外の画面の文言とログは日本語のまま（KJ-024。一覧は docs/STRINGS.md）
- `data/tutorial.json`：チュートリアル（KJ-043）の手札・ストック・場・段・文・ボタンの文字。文は全部仮で、ここ1か所で直す。段の進め方と押せる手の制限は `js/core.js` の `createTutorial`（DOM に触らない）
- `data/parts.json` の `kana_parts`：部品の札をかなに読む表（KJ-053。ノ→の・儿→る・ナ→な）。語の表のかなの語（天の川・見る）は `tools/build_data.py` がこれで作る（印 `kana_at`）。札の並びを言葉の書き方にするのは `K.kanaText`。一覧は docs/KANA_WORDS.md（作り直すと上書き）
- `data/proper_names.json`：言葉として通す地名・名字（KJ-032。都道府県・県庁所在地と政令指定都市・名字上位100）。`tools/build_data.py` が words に入れ、印 `pn`（台の行に〔地名〕〔名字〕）を付ける。一覧は docs/PROPER_NAMES.md
- `data/blocked_words.json`：全レベルで放てない語（D-048。買春・売春）。`tools/build_data.py` が words から外す
- `data/blocked_words_g1.json`：小1 のときだけ放てない語の一覧（KJ-044 追記。語の表から外す。N5・N4 には効かない。中身は作者が決める）
- `data/radical_meanings.json`：部品の札（字として見せない札。全レベルの合計78）が何と同じ意味かの表（KJ-021。name 呼び名・same 同じ意味の字・mean 短い意味・q ？・forms は radical_forms の左の形）。台の行の1行目に出す（`K.radicalNote`。index.html の render）。一覧は docs/RADICAL_MEANINGS.md（手で合わせる。tests/radical.test.js が部品の漏れを見る）
- `data/rules.json` の `vibrate`：スマホの振動の形（KJ-074。ms。手ごとに rules の1か所。選び方は `K.vibratePattern`。振動は index.html の `buzz`。入り切りは localStorage `kj-vibe`。`navigator.vibrate` が無い端末では入り切りを出さず何もしない。金玉は special_words で振動だけ特別）
- `data/rules.json`：数値（場・手札・点数・引き直し・勝ち・待ち時間・CPU）。数値を変えるときはここだけ。変えたら `version` を上げる
- `tests/`：テスト

## テストの回し方

```bash
npm test
```

- 中身は `node --test "tests/*.test.js" "tests/*.test.mjs"`（Node 22 以上）
- 落ちたときは、落ちたテストのファイル・名前・失敗の文が、標準出力の最後と `test-results/failures.txt`（git に入れない）にまとまって出る（`tests/failures-reporter.mjs`。KJ-062）。回し直す前にこれを控える
- `tests/data.test.js`：データの整合（レベル・部品表〔輪がない〕・対義・巡り・偏の形・同じ読み・語・特別な語・決まり）
- `tests/game.test.js`：割る・くっつける・待ち時間・放つ・点数・使用済み・取る・引き直し・勝ち・CPU・ログ。時計と乱数は差し替えている（`tests/helpers.js`）
- `tests/match.test.js`：合言葉の部屋の先着（場の札・言葉・勝ちの点・時間切れ・相手が抜けた）と、部屋を作る／入る・届いた行の確かめ・insert の時間切れ。つなぎは偽物（`KJ.memoryClaims`）。本物の Supabase には出さない
- `tests/vibrate.test.js`・`tests/vibrate.browser.test.mjs`：スマホの振動（KJ-074。形の選び方・手ごとの形・切なら震えない・相手の手で震えない・`navigator.vibrate` が無い端末で落ちない。`navigator.vibrate` は差し替え）
- `tests/radical.test.js`・`tests/radical.browser.test.mjs`：部品の札の意味（KJ-021。部品すべてに行がある・radical_forms と食い違わない・一行の形・一覧にそろっている／画面：部品の札を選ぶと台の行に出る・字の札では出ない・外すと消える）
- `tests/proper_names.test.js`：地名・名字（KJ-032。一覧の数・手に持てるときだけ語に入る・印と読み・点数は普通と同じ・下の名前は通らない）と、全レベルで外す語（買春・売春）
- `tests/kana.test.js`：かなに読む部品（KJ-053。天の川 3字9点・見る 2字3点・かなだけは放てない・ひらがなで残る・CPU とヒント・外す語）
- `tests/tutorial.test.js`・`tests/tutorial.browser.test.mjs`：チュートリアル（8段を通せる・その手だけ通す・時間なし CPU なし・ログ／画面で通し・とばす・ボタンから・合言葉では出ない）
- `tests/browser.test.mjs`：画面（合言葉の部屋を2つのページで1試合〔kj_claims は page.route で偽物に回し、Realtime は差し替え〕・台に札を置いても手札と場が動かない・並べる順が逆・放つ→取る・引き直し・ログをコピー・選ぶと札はマスに残り台に写しが並ぶ・入れ替え）。Playwright の Chromium がないと skip になる。skip は「通った」ではない
- 変えたら必ず `npm test` を回し、件数と結果を PR に書く

## ログの自動送信（KJ-020）

- 試合の終わり・途中で捨てたときに、ログを Supabase の `play_logs` に1行送る（`index.html` の `sendLog`、中身は `js/core.js` の `playLogRow`）。手元（localhost）とテスト（webdriver）では送らない。テストで送る処理を見るときだけ `window.__KJ_LOG_FORCE` を立て、通信は `page.route` で受ける（本物の送り先に出さない）
- 鍵は publishable（`sb_publishable_…`。公開してよい）だけ。secret・service_role は書かない

## ローカルで開く

```bash
python3 -m http.server 8000
```

file:// では data/ を読めない。

## PR の決まり

- main に直接 push しない。ブランチ（名前は `kj-` で始める）を切って PR（下書き）にする。main に入ると Pages（公開 URL）に出る
- PR は下書きで出す。テストと Actions が通ったら、下書きを外す（REST の POST /repos/kaz6/kanji-barabara-mock/pulls/{番号}/ccr/ready_for_review）。マージは `.github/workflows/automerge.yml` がする（test が success・下書きでない・base が main・同じリポジトリの `kj-` ブランチ・mergeable の PR を、30分ごと／test のあと／下書きを外したときにマージする。マージのあと Pages のビルドも頼む）。係はマージの API を呼ばない
- PR の説明に必ず書く
  - **確かめ方**：何を回して何を見たか（`npm test` の件数と結果、画面で見たこと）。確かめていないことも書く
  - **危ない所**：壊れうる所・遊びの決まりが変わる所・データを変えた所
  - **戻し方**：どのコミットを revert すればよいか、データや設定（localStorage など）に残るものがあるか
- 設計の判断をしたら docs/DECISION_LOG.md に R-番号で残し、docs/SESSION_STATE.md を更新する
- 「音」の印のふるい（R-004）は作者の判断待ち。勝手に変えない
