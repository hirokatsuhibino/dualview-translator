# Safari / iOS 対応（開発用）

このディレクトリは `xcrun safari-web-extension-converter` で生成した Xcode プロジェクトです。
macOS / iOS 両プラットフォームで Safari Web Extension として DualView Translator を動作させます。

拡張本体のソース（`manifest.json`, `background.js`, `content-*.js`, `popup.*` など）はリポジトリ直下のファイルを相対パスで**参照**しているので、ルートのファイルを編集すればそのまま Xcode ビルドに反映されます。

## 前提

- macOS + Xcode 15 以降（Swift 5.9+ / Safari 16.4+ 対応のため）
- Safari 16.4 以降（macOS）/ Safari 15 以降（iOS）
- **Share Extension は最低 OS が異なる**:
  - iOS: 15.0 以降（既存 Safari Extension と同じ）
  - macOS: **12.0 以降**（SwiftUI + async/await を使うため）
- **macOS のアプリ本体・Web Extension も 12.0 以降**（#267）。Xcode 27 以降は 12.0 未満のデプロイ対象を受け付けずビルドが失敗するため、v1.9.0 で 10.14 から引き上げた。`tests/safari-compat.test.js` で下限を検証している
- 実機 iOS 配布には Apple Developer Program（$99/年）が必要。開発中のローカル検証のみなら無料 Apple ID で可

## ビルド

### macOS

```bash
cd "safari/DualView Translator"
xcodebuild -project "DualView Translator.xcodeproj" \
  -scheme "DualView Translator (macOS)" \
  -configuration Debug \
  -destination 'platform=macOS' \
  CODE_SIGNING_ALLOWED=NO build
```

### iOS シミュレータ

```bash
cd "safari/DualView Translator"
xcodebuild -project "DualView Translator.xcodeproj" \
  -scheme "DualView Translator (iOS)" \
  -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

iOS プラットフォーム SDK が未インストールの場合は Xcode → Settings → Components でダウンロードしてください。

## macOS Safari で動作確認する

1. Xcode で `safari/DualView Translator/DualView Translator.xcodeproj` を開く
2. スキーム `DualView Translator (macOS)` を選択して Run（⌘R）
3. 起動したコンテナアプリの「Quit and Open Safari Extensions Preferences...」をクリック
4. Safari → 設定 → 拡張機能で DualView Translator を有効化
5. 未署名ビルドを許可するため、Safari の「開発」メニュー → 「未署名の拡張機能を許可」をオン
   - 「開発」メニューが無い場合は Safari → 設定 → 詳細 → 「メニューバーに"開発"メニューを表示」をオン

## iOS Safari で動作確認する

1. Xcode でスキーム `DualView Translator (iOS)` を選択
2. 実機 iPhone/iPad を接続（無料 Apple ID でも Xcode から Signing Team を設定すれば署名可能。ただし 7 日で証明書が切れる）
3. Run（⌘R）でインストール
4. iOS 設定 → Safari → 機能拡張で DualView Translator を有効化

### iOS 固有の制限

iOS Safari は以下の Web Extension API を提供しません。拡張は自動フォールバックしますが UI は変わります:

- `chrome.commands`（キーボードショートカット）→ ショートカット表示は非表示
- `chrome.contextMenus`（右クリックメニュー）→ 該当機能は無効

ページ翻訳・選択翻訳・領域選択翻訳・設定はすべてポップアップから操作できます。

## iPhone Duo（折りたたみ iPhone）で動作確認する

iPhone Duo のシミュレータは、iOS 27 以降の **iPhone Duo 専用ランタイム** でしか作れない（通常の iOS 27 ランタイムや iOS 26 では `Incompatible device` で失敗する）。

```bash
# iOS シミュレータのランタイムをダウンロード（数 GB。iPhone Duo 用ランタイムも同時に入る）
xcodebuild -downloadPlatform iOS

# ランタイム ID を確認（iOS-27-2-iPhone19-4 のように端末名付きの ID が Duo 用）
xcrun simctl list runtimes | grep iOS

# 端末を作成して起動
xcrun simctl create "iPhone Duo" com.apple.CoreSimulator.SimDeviceType.iPhone-Duo \
  com.apple.CoreSimulator.SimRuntime.iOS-27-2-iPhone19-4
xcrun simctl boot "iPhone Duo"
```

確認するのは「閉じた状態（外側の画面）」「半開き」「全開（内側の画面）」の 3 状態。どの状態でも黒帯・はみ出しがなく、開閉の切り替えでその場でレイアウトが変わること（v1.9.0 で確認済み）。

## Claude Code 用の Xcode スキル

Xcode には Claude Code などのエージェント向けスキル（iPhone Duo / 画面サイズ変更への対応を見る `app-resizability`、シミュレータを操作する `device-interaction`、`swiftui-specialist` など）が付属している。次のコマンドで書き出すと、以降に始める Claude Code のセッションで使えるようになる。

```bash
xcrun agent skills export --output-dir ~/.claude/skills
```

- 実行すると Xcode が起動し、そのまま開いた状態になる
- 書き出し先の `~/.claude/skills` はホームディレクトリの全プロジェクト共通フォルダ。すでに起動中のセッションには反映されないことがある（その場合は新しいセッションを始める）
- **書き出したスキルはリポジトリにコミットしない**。コマンドでいつでも再生成でき、Xcode の更新で内容が変わり、配布条件も確認していないため
- Xcode を更新したら、同じコマンドで書き出し直す

## Xcode プロジェクトの再生成

拡張の `manifest.json` に変更を加えた場合など、プロジェクトを再生成したい場合:

```bash
xcrun safari-web-extension-converter . \
  --project-location ./safari \
  --app-name "DualView Translator" \
  --bundle-identifier "jp.co.orangesoft.dualview-translator" \
  --swift \
  --no-open \
  --no-prompt \
  --force
```

`--force` は既存の `safari/` を上書きします。以下の手動調整は再生成時に失われるので注意してください:

- Swift ソースの Copyright ヘッダ
- `ViewController.swift` の force-unwrap / force-cast 排除（クラッシュ回避）
- `Resources/Style.css` の重複 CSS ルール除去
- `project.pbxproj` から runtime に不要なファイル（`node_modules/`・`tests/`・`docs/`・`README.md` 等）を除外する調整
- `Assets.xcassets/AppIcon.appiconset/` — `icons/icon128.png` からリサイズして差し替え済み（Xcode デフォルトは使わない）

再生成後は Git diff で上記を適用し直してください。

### アプリアイコンについて

現状の AppIcon は `icons/icon128.png` を `sips` でリサイズして生成。元が 128px のため **1024px は拡大ぼやけあり**。App Store 提出前に本番 HD アイコン（1024x1024）を差し替え推奨。

## ディレクトリ構成

```
safari/
└── DualView Translator/
    ├── DualView Translator.xcodeproj
    ├── Shared (App)/                        # macOS/iOS 共通のコンテナアプリ
    ├── Shared (Extension)/                  # macOS/iOS 共通の拡張ハンドラ（Web Ext + Share Ext で共有予定）
    ├── iOS (App)/                           # iOS コンテナアプリ
    ├── iOS (Extension)/                     # iOS Safari Web Extension ターゲット
    ├── macOS (App)/                         # macOS コンテナアプリ
    ├── macOS (Extension)/                   # macOS Safari Web Extension ターゲット
    ├── DualView Share Extension (iOS)/      # iOS Share Extension（Issue #89）
    └── DualView Share Extension (macOS)/    # macOS Share Extension（Issue #89）
```

ターゲット数は計 **6 つ**:

| ターゲット | Bundle ID | 用途 |
|---|---|---|
| DualView Translator (iOS / macOS) | `jp.co.orangesoft.dualview-translator` | コンテナアプリ |
| DualView Translator Extension (iOS / macOS) | `jp.co.orangesoft.dualview-translator.Extension` | Safari Web Extension |
| DualView Share Extension (iOS / macOS) | `jp.co.orangesoft.dualview-translator.ShareExtension` | 共有シート経由の翻訳（v1.6 で追加予定） |

すべてのターゲットが App Group `group.jp.co.orangesoft.dualview-translator` に参加し、設定値は `UserDefaults(suiteName:)` で共有可能。

### Share Extension のソース構成上の注意

Xcode 15+ の `fileSystemSynchronizedGroups` 仕様により、Share Extension は自フォルダ（`DualView Share Extension (iOS)/` または `(macOS)/`）配下の Swift しかビルド対象にできない。そのため以下のファイルは iOS / macOS の両フォルダに **同一内容で重複配置** している（Phase 3b 時点）:

- `ShareAppGroup.swift`（App Group 読み取りヘルパー）
- `TranslationProviderGoogle.swift`（Google Translate REST 呼び出し）
- `I18N.swift`（11 言語の最小 UI 文字列）
- `SharedTranslationView.swift`（SwiftUI 並列翻訳ビュー）

将来的に `Shared (Share Extension)/` フォルダを Xcode で正規追加して重複を解消する想定（後続 Issue 化）。当面は片方を編集したらもう片方にも同じ修正を入れること。

### バージョン管理上の注意

`MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` はターゲット数 × Debug/Release で **計 12 箇所** に記述されている（過去 8 箇所から増加）。リリース時は全箇所同期が必須。

```bash
# 検証コマンド: 12 が期待値
grep -c MARKETING_VERSION "DualView Translator.xcodeproj/project.pbxproj"
```

詳細は `.claude/skills/release.md` を参照。

---

Copyright (c) Orangesoft Inc.
