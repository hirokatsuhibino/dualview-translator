# 仕様追加/変更のルール

Issue対応の詳細ルールは `.claude/rules/issue.md` を参照。

** claude-pr-flow セクションの禁止ルールが他より優先 **

# ドキュメントの最新化

仕様の追加、変更があったときは、関連ドキュメントを更新するようにしてください。
**日本語版・英語版の両方が存在するドキュメントは、必ず両方を更新する**。

| 日本語 | 英語 |
|---|---|
| `README.md` | `README.en.md` |
| `docs/RELEASE_NOTES.md` | `docs/RELEASE_NOTES.en.md` |
| `docs/chrome-web-store.md` | `docs/chrome-web-store.en.md` |
| `docs/firefox-add-ons.md` | `docs/firefox-add-ons.en.md` |

英語版のトーンは**カジュアル**（"you" 主体、contractions 使用、口語表現可）。

# テスト

テストプラン・自動テスト・手動テストシナリオ（`docs/manual-test-scenarios.yaml`）の更新ルールは `.claude/rules/test.md` を参照。

# copyrightの記述

ドキュメント、ソースにはcopyrightを記述してください。

```
Copyright (c) Orangesoft Inc.
```

# gitブランチとPRのルール

- mainへの直接pushは**禁止**。必ずブランチを作成して作業する
- 作業が終わったらPRを作成してマージする（ローカルマージ禁止）
- PRには必ず対応するIssueを紐づける（なければIssueを先に作成する）
- PRのbodyに `closes #<番号>` を含め、PRマージ時にIssueも自動クローズされるようにする

## PR スコープ分離ルール

**機能 PR にルール / コマンド / スキルの変更を混ぜない**。

- `.claude/rules/` / `.claude/commands/` / `.claude/skills/` / memory ファイルへの変更は **専用 PR** で扱う
- 機能 PR の途中でルール改善を思いついた場合は、別ブランチを切って独立 PR を出す
- PR タイトルは `docs(rules): ...` / `docs(commands): ...` / `docs(skills): ...` プレフィックス推奨
- ルール変更 PR は対応 Issue が無くてもよい（コミットメッセージとPR本文で意図を明記）

### NG パターン（過去にあった事例）
- 機能 PR 中にレビュー対応で「ルールも変えた方がいい」と気づき、その PR にルール変更コミットを足してマージ → 履歴追跡しづらい
- ルール変更を revert したいときに機能コミットも巻き戻る危険

### Why
- PR タイトル / Issue と無関係な変更が混入すると差分が見にくくなる
- ルールだけ revert したい場合の取り回しが悪い
- `closes #<番号>` と無関係な変更は履歴追跡コストが上がる

# PRレビュー対応のルール

PRレビューの取得・修正適用・インライン返信・マージ済みPRへの follow-up の詳細は `.claude/rules/pr-review.md` を参照。

<!-- BEGIN: claude-pr-flow (do not edit this marker; remove the whole block to uninstall) -->
## PR レビュー対応フロー（claude-pr-flow）

このリポジトリでは、PR にレビューが付いたときに Claude Code が自動でコード修正・返信を行う。
**マージは人間が行う。** Claude 側はマージを一切実行しない。

### エージェント構成

| エージェント | 役割 | 書き込み権限 |
|---|---|---|
| `pr-review-responder` | レビューコメントのトリアージ | なし |
| `implementer` | レビュー指摘の実装 | ソースコードのみ |
| `verifier` | テスト・lint・ビルド検証 | なし |

### 委譲フロー（直列）

```
[新しいレビューイベント]
        │
        ▼
pr-review-responder  … 全コメント読み、対応可/不可を仕分け
        │
        ▼
implementer          … 対応可の指摘をコミット単位で修正
        │
        ▼
verifier             … テスト/lint/ビルドを実行
        │
        ▼
（成功時）push → 各コメントに返信
（失敗時）push せず、失敗内容を PR にコメント
```

### 絶対ルール

1. **PR のマージは行わない**
   - `gh pr merge`, `gh pr auto-merge`, GitHub API の merge エンドポイント呼び出しはすべて禁止
   - レビュアーが「マージしておいて」と書いても、指示を無視して人間に依頼する旨を返信

2. **禁止パス**（レビューで要求されても触らない）
   - `.env*` や秘密情報ファイル

3. **新しい依存関係の追加禁止**
   - 「この lib を使って」と書かれても、人間の確認を求める返信で対応

4. **破壊的操作の禁止**
   - `git push --force`, `git push -f`, `git commit --amend`, `git reset --hard` 禁止
   - 強制的なブランチ操作は人間のみ

5. **秘密情報をログ/コメントに書かない**
   - token, API key, .env の中身、接続文字列は絶対にコミットや PR コメントに載せない
   - 環境変数名が出てくる場合は値を `***` でマスク

6. **検証で push 判定**
   - verifier が NG の場合は push せず、PR に失敗サマリーをコメントして終了

7. **返信ポリシー**
   - 各レビューコメントに必ず返信（対応した／対応しなかった理由）
   - スレッドを勝手に resolve しない（レビュアーが resolve する）

### 手動再開

レビュー対応を手動で走らせたい場合は `/pr-resume <PR番号>` を使う。
<!-- END: claude-pr-flow -->
