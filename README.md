# kanji-barabara-mock（漢字版（仮）の最初のモック）

漢字の札を割る・くっつける・反転・巡り・同音で組み替え、字や語にして相手に投げる対 CPU のモック。字は JLPT N5 相当だけ。

- 遊ぶ：https://kaz6.github.io/kanji-barabara-mock/
- 設計の記録：[docs/DECISION_LOG.md](docs/DECISION_LOG.md)・[docs/SESSION_STATE.md](docs/SESSION_STATE.md)

## 中身

- `index.html`：画面・札の状態・CPU（外のサーバーとは通信しない）
- `js/core.js`：操作の計算（割る・くっつける・反転・巡り・同音・届き方・投げられるか・待ち時間）
- `tests/`：テスト。`npm test`（Node 22 以上、入れるものはない）
- `data/`：表。どれも `version` を持つ
  - 辞書から生成：`kanji.json`・`words.json`・`readings.json`
  - 手作り：`parts.json`・`antonyms.json`・`cycles.json`・`radical_forms.json`・`special.json`・`rules.json`
- `tools/build_data.py`：生成する3ファイルを作り直す

## データの作り直し

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

N5 の字の表を差し替えるとき（1行1字、または空白区切り）：

```bash
.venv/bin/python tools/build_data.py --kanji-list path/to/n5.txt
```

## ローカルで開く

`file://` ではデータを読めないので、サーバーを立てて開く。

```bash
python3 -m http.server 8000
```

## クレジット

`data/kanji.json`・`data/words.json`・`data/readings.json` は JMdict と KANJIDIC2 から作った。
© Electronic Dictionary Research and Development Group（EDRDG）。CC BY-SA 3.0。<https://www.edrdg.org/edrdg/licence.html>
この3ファイルは同じ CC BY-SA 3.0 で配る。
