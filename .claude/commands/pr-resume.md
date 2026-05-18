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

5. 全部 OK なら push し、**返信は以下 3 段構えで行う**:
   1. **インライン全件への個別返信**: `gh api .../comments --paginate` で全件取得し、各コメントに `in_reply_to` で 1:1 返信（[done] / [skip] / [ask] / [fyi]）
   2. **各 overview review への個別 ack**: `gh pr view --json reviews` で取得した各 review submission（body 付きのもの）ごとに `gh pr comment` で 1 件ずつ個別の ack を投稿（commit hash で対象を明示）
   3. **全体サマリコメント**: 対応の全体俯瞰として `gh pr comment` で 1 件投稿
   - **3 つを混ぜないこと**。まとめコメント 1 件で複数 review をカバーするのは NG（詳細: `.claude/rules/pr-review.md`）

6. NG があれば push せずに要点を PR にコメントして終了

## ルール

- `CLAUDE.md` の絶対ルールをすべて守る
- マージは行わない（`gh pr merge` 禁止）
- 禁止パスに触れない
- 返信ポリシーの詳細は `.claude/rules/pr-review.md` を参照（個別 ack + サマリ両方必須）
