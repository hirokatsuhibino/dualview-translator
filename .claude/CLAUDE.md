# 仕様追加/変更のルール

Issue対応の詳細ルールは `.claude/rules/issue.md` を参照。

# ドキュメントの最新化

仕様の追加、変更があったときは、readme.md、リリースノートなどの関連ドキュメントを更新するようにしてください。

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

# PRレビュー対応のルール

PRレビューの取得・修正適用・インライン返信・マージ済みPRへの follow-up の詳細は `.claude/rules/pr-review.md` を参照。
