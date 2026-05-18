---
name: PRレビュー未対応チェック
description: オープンなPRの overview レビューとインラインコメントを一括フェッチし、未対応のものをサマリ表示する
user_invocable: true
---

# PRレビュー未対応チェック

オープンなPRにCopilotや他のレビュアーからレビューが来ていないか／残っているコメントに未返信のスレッドがないかを、一括で確認する。作業再開時やリリース前の定型チェックに使う。

返信フローそのものの詳細は `.claude/rules/pr-review.md` を参照。

## 手順

### 1. open な PR を一覧

```bash
gh pr list --state open --repo hirokatsuhibino/dualview-translator \
  --json number,title,headRefName,updatedAt,author
```

1件も無ければ「未対応のPRはありません」と表示して終了。

### 2. 各PRのレビュー・コメントをフェッチ

各PR番号 N について以下を並行実行:

```bash
# 概要レビュー（Copilot overview 等）
gh pr view N --repo hirokatsuhibino/dualview-translator \
  --json reviews,comments

# インラインコメント（ファイル・行への指摘と各返信）— --paginate で全件取得
gh api "repos/hirokatsuhibino/dualview-translator/pulls/N/comments?per_page=100" \
  --paginate \
  --jq '.[] | {id, path, line: (.line // .original_line), user: .user.login, in_reply_to_id, created_at, body}'
```

### 3. 未対応の判定

インラインコメントを `in_reply_to_id` でスレッド化し、以下を「**未対応**」と判定する:

- スレッドの**先頭**がレビュアー（`user.login` が PR 作成者以外、例: `Copilot` / `copilot-pull-request-reviewer`）で
- スレッドの**末尾**コメントが PR 作成者ではない

PR 作成者の `user.login` は手順 1 の `author.login` フィールドから動的に取得する（固定値に依存しない）。

また、overview レビュー（`pr view --json reviews`）についても、以下を追加で確認:

- 各 review submission に紐付くインライン指摘が全件返信済みかを確認すれば、その review への ack は実質完了とみなす（インライン返信がスレッドに残り、レビュアーから見落とされにくい）
- **インライン指摘 0 件**の overview review（純粋な要約のみ）がある場合のみ、PR トップレベルに短い ack コメントが存在するかをチェック
- レビュー対象の `commit.oid` が現在のHEADより古い場合は「レビュー後に修正が push されたが再レビュー待ちかも」として注釈

### 4. サマリ表示

以下の形式で出力する:

```
オープン PR: N 件 / 未対応レビュー: M 件

#<番号>: <タイトル>
  未対応 X 件
    - [<path>:<line>] <本文先頭80字>... （by <user>, <created_at>）
    - ...
  最新コミット: <sha7> / レビュー対象コミット: <sha7> （ズレがあれば注記）

#<番号>: <タイトル>
  全て対応済み ✓
```

未対応が無ければ「✓ 全PR対応済み」とだけ表示して終了。

### 5. 次アクションの案内

未対応が見つかった場合は `.claude/rules/pr-review.md` に従って対応:

- インライン: `gh api .../pulls/<n>/comments -X POST -F in_reply_to=<id>` で個別返信（これが overview review への実質 ack を兼ねる）
- インライン 0 件の overview review がある場合のみ: `gh pr comment <n>` で短い ack を 1 件投稿
- 修正が必要なら追加コミットして push
- 最後に PR 全体サマリコメントを 1 件投稿（対応コミット hash + 対応一覧）

ただし**自動では返信・修正しない**。どれに対応するかはユーザーに確認してから進める。

## 注意

- 対象リポジトリが違う場合は `--repo` 引数を差し替える
- Copilot のレビューは `authorAssociation: "CONTRIBUTOR"` / `user.login: "Copilot"` で識別できる
- マージ済みPRは対象外（`--state open`）
- 判断に迷うケース（「既に別コミットで対応済みだが返信していない」等）は `[ask]` / `[fyi]` 等の prefix を使って軽く返信しておくと後から見返しやすい
