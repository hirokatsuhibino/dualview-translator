---
description: テスト実行・テストプラン更新の必須ルール
---

# テスト

機能の追加・更新・バグ修正をした時は、**必ず以下3つを同一PR内で揃える**:

1. **テストプランの作成/更新** — 新しい挙動・変更点を言語化する
2. **自動テストの追加/更新** — `tests/` 配下に Vitest で実装し `npm test` が全件パスすること
3. **手動テストシナリオの追加/更新** — 自動テストで拾えない領域を `docs/manual-test-scenarios.yaml` に記述

## 手動テストシナリオ（YAML）の更新タイミング

`docs/manual-test-scenarios.yaml` には、自動テストで検証できない以下の領域を記述する:

- 実ブラウザ UX（クリック・ホバー・キーボード操作・タップ）
- アクセシビリティ（VoiceOver / NVDA、tabindex、aria-*）
- ストレージ永続化・複数タブ競合
- ブラウザ固有挙動（Chrome / Firefox / Edge / Safari macOS / iOS）
- エラー UX（ネットワーク断・API 5xx・レート制限）
- パフォーマンス（大量データ・長時間セッション・メモリリーク）
- セキュリティ（XSS・APIキー漏洩・ログ漏洩）

### 何を書くか

直近 PR で**追加した機能 / 修正したバグ** に対応するシナリオを必ず追加する。

特にバグ修正時は「過去に存在したバグ」として `description` に記述し、
回帰防止のための項目として明示する（例: `RE-005` / `RE-009` / `RE-010` / `PK-001`）。

### スキーマ

```yaml
suites:
  - id: <suite-id>       # kebab-case
    title: <日本語タイトル>
    description: <補足>
    related_prs: [<PR番号>]
    scenarios:
      - id: <PREFIX-NNN>  # 大文字2-4字 + 連番3桁
        title: <日本語タイトル>
        priority: p0 | p1 | p2
        environment: <オプション: chrome / safari-mac / safari-ios-sim 等>
        preconditions:
          - <前提条件>
        steps:
          - <操作手順>
        expected:
          - <期待結果>
        description: <オプション: 過去バグの説明など>
        known_issue: true   # オプション: 既知問題として扱う場合
        known_limitations:  # オプション: スコープ外の制約
          - <制約>
```

### 優先度

- `p0`: リリース前に必ず実施（致命的リグレッション検知）
- `p1`: リリーステストで実施（重要なUX・機能の回帰検知）
- `p2`: 可能なら実施（パフォーマンス・エッジケース・長時間運用）

### スキップ判断

変更がドキュメントのみ、または既存自動テストで十分カバーされる純粋関数の内部実装変更の場合はスキップ可能。**ただしその判断根拠をコミットメッセージまたは PR 本文に明記する**。

## 参考

- 既存の test-plan.md（`docs/test-plan.md`）は Markdown 表形式で 74項目（ポップアップ・翻訳モード・エンジン・テーマ等を網羅）。手動シナリオ YAML はその補完として、直近PR や a11y / ブラウザ差異 / エラーUX 等を重点的にカバーする。
