# 知識台帳 — 最小構成

**機能:** メモ全文の表示／学習ノート・台帳の記事一覧・個別表示／Pages CMSによるWeb編集。
知識グラフ・全文検索・ログインフォーム等は未実装です。

## 設置

1. このフォルダーの中身（`.pages.yml` と `.github/` を含む）を、公開したいGitHubリポジトリのルートに置いてコミットする。
2. GitHubの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にする。
3. `main` ブランチでGitHub Actionsの「Publish knowledge ledger」が成功すれば公開される。
4. **https://app.pagescms.org/** にGitHubアカウントでログインし、Pages CMSのGitHub Appを対象リポジトリに許可する。既存の `.pages.yml` を編集・上書きする必要はない。
5. Pages CMSから **メモ**、**学習ノート**、**台帳** を編集する。保存するとリポジトリが更新され、GitHub Actionsが再実行される。

**注意:** 公開リポジトリ内の `content/` は誰でも閲覧できます。ブラウザの公開ページから隠しても非公開にはなりません。

## Pages CMSの使い方

- **メモ:** Pages CMSの「メモ」を選び、1つの `content/memo.txt` を編集・保存する。複数記事には分かれません。
- **学習ノート:** 「学習ノート」で新規記事を作成し、題名と本文を入力して保存する。
- **台帳:** 「台帳」で同様に記事を作成する。
- 公開サイトの「新規作成」ボタンはPages CMSを新しいタブで開きます。**直接、該当する記事の編集画面へ遷移する仕組みはありません**。Pages CMSで対象の区分・記事を選択してください。
- 公開サイトの反映はActionsのデプロイ完了後です。CMSでの保存直後には、まだ旧内容が表示される場合があります。

## ローカル表示

PythonとPyYAMLをインストールした環境で:

```bash
python -m pip install -r requirements.txt
python scripts/build.py
cd dist
python -m http.server 8000
```

ブラウザで http://localhost:8000/ を開きます。`index.html` をダブルクリックして開くだけでは、JSONへのfetchがブラウザに拒否される場合があります。

## データ形式

- `content/memo.txt` : メモ全文をプレーンテキストで保存。タイトルやメタデータなし。
- `content/notes/*.md` : 学習ノートの記事。Markdown＋YAML frontmatter。
- `content/ledger/*.md` : 台帳の記事。Markdown＋YAML frontmatter。
- `dist/` : 公開サイト一式（ビルド生成物）。編集不要、Gitで追跡不要。

記事の例（Pages CMSなら自動生成されます）:

```md
---
title: "縁起について"
---

本文を書きます。**Markdown**も使えます。
```

記事の題名を書き換えてもファイル名は自動で変わらない設定です。これにより既存の記事URLを壊しにくくしています。

## Markdownについて

表示には `marked` と `DOMPurify` のCDNを使用します。外部CDNが使えない場合は自動的にプレーンテキスト表示となります。
**LaTeXの数式レンダリングは未実装**です（今後追加できます）。

## 仕様上の注意

- 初期表示は「台帳」。URLは `#/ledger` のようなハッシュ形式で、GitHub Pagesのプロジェクト用URLでも動作します。
- 一覧はファイル名の降順です。Pages CMSが作成する日時入りファイル名により、原則として新しい記事が先に並びます。
- 記事はフォルダー内の `.md` のみ取り込みます。
- GitHubのデフォルトブランチが `main` 以外なら `.github/workflows/deploy.yml` を変更してください。
- メモも記事もGitHub上に履歴が残ります。ページ内編集は現在Pages CMSへの外部リンク方式です。
