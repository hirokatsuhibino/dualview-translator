---
description: GitHub Issue対応時の必須ルール
---

# GitHub Issue対応ルール

## 実装前

- 対応するIssueがない場合は、必ずIssueを発行してから着手する
- Issueには内容に応じて適切なラベルを設定する
  - `bug`: バグ修正
  - `enhancement`: 新機能・改善
  - `documentation`: ドキュメントのみの変更
- 実装方針が決まったらIssueにコメントして記録する

## 実装後

実装が完了したら、**必ず**対応するIssueに操作方法と実装詳細をコメントとして投稿する。

```bash
gh issue comment <番号> --repo hirokatsuhibino/dualview-translator --body "..."
```

コメントのフォーマットは `/skill issue-comment` を参照。

## PR作成

- 実装が完了したらPRを作成する（mainへの直接pushは禁止）
- PRのbodyに `closes #<番号>` を含め、マージ時にIssueが自動クローズされるようにする
- 対応するIssueがない場合は、PRの前にIssueを作成する

```bash
gh pr create --title "<type>: <説明>" --body "$(cat <<'EOF'
## Summary
...

closes #<番号>
EOF
)"
```

## コミット

- コミットメッセージのフォーマットは `.claude/rules/git.md` に従う
- 多言語対応が必要な変更は全11言語（ja/en/zh-CN/zh-TW/ko/fr/de/es/pt/ru/ar）に追加する
  - キー追加には `/skill i18n-add-key` を使う
