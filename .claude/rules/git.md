---
description: コミットメッセージのフォーマットルール
---

# コミットメッセージのフォーマット

Conventional Commits形式で日本語を使って記述する。

```
<type>: <日本語の説明>
```

## typeの種類

| type | 意味 |
|------|------|
| feat | 機能追加 |
| fix | バグ修正 |
| docs | ドキュメントのみの変更 |
| style | コードの動作に影響しない変更（フォーマット等） |
| refactor | リファクタリング |
| test | テストの追加・修正 |
| chore | ビルド・補助ツールの変更 |

## 例

```
feat: 自動翻訳ルール登録機能を追加 (closes #17)
fix: ルール削除後もObserverが残るバグを修正
test: content-bar の waitForElement テストを追加
```

## ルール

- typeは英語、説明は日本語で書く
- GitHub Issueに対応するコミットには `closes #<番号>` を末尾に含めてIssueを自動クローズする
- 複数行のコミットメッセージにはHEREDOCを使う
