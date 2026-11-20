# CLAUDE.md（kanji-barabara-mock）

漢字版（仮）のモック。index.html 1枚＋js/core.js＋data/*.json。依存パッケージなし。

## まず読むもの

- docs/DECISION_LOG.md（R-番号。「却下」とある案は再提案しない）。正本は Notion の DECISION_LOG（漢字版）41da8a5d-fd45-8184-b0e9-c164462b1808
- docs/SESSION_STATE.md（進捗・次にやること・未確定）
- ひらがな分解（仮）のリポジトリには触らない

## 中身の分け方

- `js/core.js`：遊びの決まり（表引き・割る・くっつける・投げる・待ち時間・切り替え・CPU・ログ）。DOM に触らない。ブラウザでは `window.KJ`、Node では `require`
- `index.html`：画面だけ。決まりは core.js を呼ぶ
- `data/rules.json`：数値（カゴ・待ち時間・CPU・落ちてくる間隔）。数値を変えるときはここだけ。変えたら `version` を上げる
- `tests/`：テスト
- `tools/build_data.py`：辞書から作る3ファイル（kanji・words・readings）を作り直す

## テストの回し方

```bash
npm test
```

- 中身は `node --test "tests/*.test.js" "tests/*.test.mjs"`（Node 22 以上）
- `tests/data.test.js`：データの整合（部品表・対義・巡り・偏の形・同じ読み・語・特別な語・決まり）
- `tests/game.test.js`：割る・くっつける・届き方・投げ済み・待ち時間・あふれ・切り替え・CPU・ログ。時計と乱数は差し替えている（`tests/helpers.js`）
- `tests/ops.test.js`：表の全部の字で見る操作（部品表に輪がない・割る⇔くっつけるの往復・反転の往復・巡りの一周・同音の行き先・部品だけは投げられない・待ち時間は操作ごとに別）
- `tests/browser.test.mjs`：画面（台に札を置いてもカゴが動かない・並べる順が逆・設定・ログをコピー）。Playwright の Chromium がないと skip になる。skip は「通った」ではない
- かかる時間：1回 2 秒ほど（画面のテストこみ。画面なしなら 0.3 秒ほど。2026-11-20、コンテナで 50 件）
- PR を出すと GitHub Actions（.github/workflows/test.yml）が同じ `npm test` を回す。Actions では Playwright と Chromium を入れるので、画面のテストも skip にならない
- 変えたら必ず `npm test` を回し、件数と結果を PR に書く

## データを作り直す（tools/build_data.py）

作り直すのは kanji.json・words.json・readings.json の3つだけ。手作りの表（parts・antonyms・cycles・radical_forms・special・rules）は手で直す。

```bash
python3 -m venv .venv
```

```bash
.venv/bin/pip install --upgrade pip setuptools wheel
```

```bash
.venv/bin/pip install jamdict-data
```

```bash
.venv/bin/python tools/build_data.py
```

- N5 の字の表を差し替える：`.venv/bin/python tools/build_data.py --kanji-list path/to/n5.txt`（1行1字か空白区切り）
- jamdict-data が入らないとき：`--db /path/to/jamdict.db`（R-002）
- 作り直したら `npm test` を回す。字が変わると、部品表・対義・巡り・同じ読みの字が kanji.json から外れていないかを data.test.js が見る。テストが数を決め打ちしている所（例：一日中 の届き方）が落ちたら、データの変化かテストの直し漏れかを見分けて PR に書く
- `version` を上げる（build_data.py の `VERSION`）

## ローカルで開く

```bash
python3 -m http.server 8000
```

file:// では data/ を読めない。

## PR の決まり

- main に直接 push しない。作業用のブランチを切って、そこから PR を出す（下書きでよい）。main に入ると Pages（公開 URL）に出る
- PR の説明に、次の3つの欄を必ず書く
  - **確かめ方**：何を回して何を見たか（`npm test` の件数と結果、画面で見たこと）。確かめていないことも書く
  - **危ない所**：壊れうる所・遊びの決まりが変わる所・データを変えた所
  - **戻し方**：どのコミットを revert すればよいか、データや設定（localStorage など）に残るものがあるか
- Actions のテストが落ちている PR は出しっぱなしにしない
- 設計の判断をしたら docs/DECISION_LOG.md に R-番号で残し、docs/SESSION_STATE.md を更新する
- 「音」の印のふるい（R-004）は作者の判断待ち。勝手に変えない
