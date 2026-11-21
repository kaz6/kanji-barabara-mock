# CLAUDE.md（kanji-barabara-mock）

漢字版（仮）のモック。index.html 1枚＋js/core.js＋data/*.json。依存パッケージなし。

## まず読むもの

- docs/DECISION_LOG.md（R-番号。「却下」とある案は再提案しない）。正本は Notion の DECISION_LOG（漢字版）41da8a5d-fd45-8184-b0e9-c164462b1808
- docs/SESSION_STATE.md（進捗・次にやること・未確定）
- ひらがな分解（仮）のリポジトリには触らない

## 中身の分け方

- `js/core.js`：遊びの決まり（表引き・割る・くっつける・放つ・点数・場から取る・引き直し・待ち時間・勝ち・CPU・ログ）。DOM に触らない。ブラウザでは `window.KJ`、Node では `require`
- `index.html`：画面だけ。決まりは core.js を呼ぶ
- `data/kanji.json`・`words.json`：字と語に `lv`（N5／N4）。遊ぶときは `makeTables(D, level)` でレベルに絞る。作り直しは `python3 tools/build_data.py`（`pip install jamdict-data`。`--level N5` で N5 だけ）。手作りの表（parts など）はこのスクリプトでは作らない。N4 で足した割り方の一覧は docs/N4_TABLES.md
- `data/rules.json`：数値（場・手札・点数・引き直し・勝ち・待ち時間・CPU）。数値を変えるときはここだけ。変えたら `version` を上げる
- `tests/`：テスト

## テストの回し方

```bash
npm test
```

- 中身は `node --test "tests/*.test.js" "tests/*.test.mjs"`（Node 22 以上）
- `tests/data.test.js`：データの整合（レベル・部品表〔輪がない〕・対義・巡り・偏の形・同じ読み・語・特別な語・決まり）
- `tests/game.test.js`：割る・くっつける・待ち時間・放つ・点数・使用済み・取る・引き直し・勝ち・CPU・ログ。時計と乱数は差し替えている（`tests/helpers.js`）
- `tests/browser.test.mjs`：画面（台に札を置いても手札と場が動かない・並べる順が逆・放つ→取る・引き直し・ログをコピー・手札で選ぶ・並べ方の切り替え・入れ替え）。Playwright の Chromium がないと skip になる。skip は「通った」ではない
- 変えたら必ず `npm test` を回し、件数と結果を PR に書く

## ローカルで開く

```bash
python3 -m http.server 8000
```

file:// では data/ を読めない。

## PR の決まり

- main に直接 push しない。ブランチを切って PR（下書き）にする。main に入ると Pages（公開 URL）に出る
- PR の説明に必ず書く
  - **確かめ方**：何を回して何を見たか（`npm test` の件数と結果、画面で見たこと）。確かめていないことも書く
  - **危ない所**：壊れうる所・遊びの決まりが変わる所・データを変えた所
  - **戻し方**：どのコミットを revert すればよいか、データや設定（localStorage など）に残るものがあるか
- 設計の判断をしたら docs/DECISION_LOG.md に R-番号で残し、docs/SESSION_STATE.md を更新する
- 「音」の印のふるい（R-004）は作者の判断待ち。勝手に変えない
