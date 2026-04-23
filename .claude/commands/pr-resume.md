---
description: 指定した PR のレビュー対応フローを手動で実行する
argument-hint: <PR番号>
allowed-tools: Bash, Read, Grep, Edit, Write, Task
---

# /pr-resume {{PR_NUMBER}}

PR #{{PR_NUMBER}} のレビュー対応を、GitHub Actions のイベントを待たずに手元で走らせる。

## 実行ステップ

1. PR を fetch して該当ブランチに移動
   ```
   gh pr checkout {{PR_NUMBER}}
   ```

2. サブエージェント `pr-review-responder` を起動して未対応コメントを列挙

3. 対応可能なものがあれば `implementer` に委譲して修正

4. `verifier` を起動してテスト/lint/ビルドを実行

5. 全部 OK なら push し、各レビューコメントに返信

6. NG があれば push せずに要点を PR にコメントして終了

## ルール

- `CLAUDE.md` の絶対ルールをすべて守る
- マージは行わない（`gh pr merge` 禁止）
- 禁止パスに触れない
