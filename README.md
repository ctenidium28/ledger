# 知識台帳

[公開サイト](https://ctenidium28.github.io/ledger/) — 知識・学習記録・考察を蓄積し、相互参照やグラフによって関係を可視化する静的サイトです。編集には Pages CMS と GitHub を使用します。

## 構成

| パス | 役割 |
| --- | --- |
| `content/memo.txt` | メモ（単一のプレーンテキスト） |
| `content/resources/*.md` | 資料 |
| `content/notes/*.md` | 学習ノート |
| `content/ledger/*.md` | 台帳 |
| `content/graph.json` | グラフの公開原本 |
| `prompts/` | LLM 向けの指示・運用文書 |
| `media/` | 画像・添付ファイル |
| `font/` | コードブロック用フォント |
| `.pages.yml` | Pages CMS の設定 |
| `index.html`, `app.js`, `style.css` | 記事サイト |
| `graph.html`, `graph.js`, `graph.css` | グラフ画面・編集機能 |
| `scripts/build.py` | 公開用ファイルの生成 |
| `.github/workflows/deploy.yml` | GitHub Actions による公開 |

## 記事編集

[Pages CMS](https://app.pagescms.org/) に GitHub でログインし、このリポジトリを選択します。公開サイトの「＋ 新規作成」も CMS を開きます。

資料・学習ノート・台帳は同じ Markdown + YAML frontmatter 形式です。題名、執筆・加筆タグ、本文（Markdown ソース）、任意の画像・添付ファイルを設定できます。

```md
---
title: 縁起について
attribution: human
---

本文を書きます。**Markdown**も使えます。
```

`attribution` は `human`（ユーザー執筆）、`llm`（LLM生成）、`human_llm`（ユーザー執筆・LLM加筆）、`llm_human`（LLM生成・ユーザー加筆）の4通りです。導入前の記事で未設定のものはタグを表示しません。CMS では新規・編集時に選択必須です。

公開一覧は日時入りファイル名の降順です。CMS の既定ソートは日付降順（同日の時分秒までの順序は保証されません）。記事名を変更してもファイル名は自動変更しません。

### Markdown・数式・参照

Marked と DOMPurify を使用して Markdown を表示します。KaTeX によるインライン数式 `$...$` と独立行の `$$...$$` に対応します。行列や複数行の式では `bmatrix`、`aligned` など KaTeX 対応の環境を使用してください。CMS 本文はソース編集です。

記事内の同リポジトリの Markdown へのリンク、または公開サイトの個別記事へのリンクは、クリック時にその場で折り畳み展開します。再帰参照も可能です。外部リンクは従来どおり別タブで開きます。

HTML コメントは本文の通常表示では非表示ですが、公開リポジトリや公開用 JSON から取得可能です。秘密情報を記載しないでください。

## グラフ

`graph.html` は全画面キャンバスです。左上のメニューから記事サイトへ移動し、右側の編集パネルでノード、エッジ、グループを追加・編集します。パネルは折り畳めます。

- ノードは文字のみで表示し、ラベル・説明・文字サイズ・文字色を変更できます。
- エッジは無向・有向・双方向、ラベル、経由点に対応します。
- グループは所属ノードと内部エッジをまとめて移動できます。
- Ctrl（Mac は Command）＋クリックで複数選択、ドラッグで移動、背景ドラッグでパン、ホイールで拡大縮小します。

編集中の内容はブラウザの localStorage に自動保存します。公開するには「GitHubで公開する」で JSON をコピーし、GitHub の `content/graph.json` 編集画面に貼り付けてコミットしてください。JSON の書き出し、公開版への復帰も可能です。サイト上に GitHub の認証情報を保存する機能はありません。公開原本は他の閲覧者にも表示されますが、ブラウザ内の下書きは共有されません。

## ビルド・公開

GitHub の **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定します。Pages CMS からの保存や main ブランチへの push を契機に、`Publish knowledge ledger` が実行されます。

`scripts/build.py` は記事原本から `dist/data/index.json` を生成し、グラフ原本を `dist/data/graph.json` に変換します。HTML、CSS、JS、フォント、メディアを `dist/` に配置し、Actions の成果物として GitHub Pages に公開します。`dist/` をコミットする必要はありません。

### ローカル確認

```bash
python -m pip install -r requirements.txt
python scripts/build.py
cd dist
python -m http.server 8000
```

ブラウザで http://localhost:8000/ を開きます。グラフは http://localhost:8000/graph.html です。外部 CDN が利用できないと Markdown・数式の表示に制約が生じます。

公開リポジトリに保存した資料、記事、添付ファイル、プロンプト、グラフは原則として誰でも閲覧できます。
