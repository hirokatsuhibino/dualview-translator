---
description: PRレビュー対応・返信時の必須ルール
---

# PRレビュー対応ルール

## レビュー取得

`gh pr view` だけではインラインコメントが取れないので、**必ず両方取得する**:

```bash
# 概要レビュー（Copilot等の overview コメント）
gh pr view <番号> --repo hirokatsuhibino/dualview-translator --json reviews,comments

# インラインコメント（ファイル・行への個別指摘）
gh api repos/hirokatsuhibino/dualview-translator/pulls/<番号>/comments \
  --jq '.[] | {id, path, line: (.line // .original_line), user: .user.login, body}'
```

2回目以降のレビューを取りこぼさないよう、毎回最新状態を全件フェッチして確認すること。

## 指摘の分類

各指摘を以下に仕分ける:

| 分類 | 対応 |
|------|------|
| `[must]` 致命的・バグ | 必ず修正 |
| `[imo]` / `[nits]` 改善提案 | 原則対応。PRスコープを超えるなら follow-up Issue にする |
| `[ask]` 質問 | 回答のみ。必要に応じて修正 |
| `[fyi]` 参考情報 | 返信で acknowledge |

substantive な変更（元の文意や仕様を変える提案）は安易に受け入れない。**理由を添えて `[skip]`** するか、迷うなら `[ask]` で逆質問してから決める。

## 修正の適用

- 同じブランチに**追加コミット**する（`--amend` は禁止）
- コミットメッセージは `fix: PR #<番号> レビュー指摘の修正 ...` のように何に対応したかを明記
- push 前に**必ずビルドとテストを通す**
  - Vitest: `npm test`
  - Safari/Xcode: `xcodebuild ... build` で macOS ターゲットが `BUILD SUCCEEDED` になること

## 返信

### インラインコメントへ個別に返信

各指摘に1件ずつ返信する。PR全体コメントだけで済ませない:

```bash
gh api repos/hirokatsuhibino/dualview-translator/pulls/<番号>/comments \
  -X POST \
  -f body="[done] ..." \
  -F in_reply_to=<comment_id>
```

prefix 規約（`.github/pr-guidelines.md` と揃える）:

| prefix | 用途 |
|--------|------|
| `[done]` | 指摘通り修正した |
| `[skip]` | 意図的に見送る（**必ず理由を添える**） |
| `[ask]` | 逆質問 |
| `[fyi]` | 参考情報を追記 |

### PR全体サマリコメント

インライン返信に加え、PRに**サマリを1件**投稿:

```bash
gh pr comment <番号> --repo hirokatsuhibino/dualview-translator --body "..."
```

サマリ記載項目:

- 対応 commit hash
- 各指摘への対応状況（表形式）
- ビルド・テスト結果

## PR が既にマージ済みだった場合

マージ後に未対応コメントが残っている場合:

1. follow-up の Issue を作成（既存マージ済みPRは触らない）
2. 別ブランチ・別PRで修正
3. 元PRのインラインコメントに `[done] PR #<番号> で対応しました。` と返信してリンク

ユーザーが GitHub UI で Copilot suggestion を accept してマージした場合、受け入れ済みの指摘には返信不要。未対応の残り分のみ上記フローで処理する。

## マージ後の定型処理

PR マージ後は必ず `/skill pr-cleanup` を実行してブランチを片付ける（`.claude/CLAUDE.md` の gitブランチルール参照）。
