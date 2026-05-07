//
//  I18N.swift
//  DualView Share Extension (iOS)
//
//  Copyright (c) Orangesoft Inc.
//
//  Share Extension UI 用の最小 i18n。Web 拡張側 i18n.js の 11 言語のうち
//  Share UI で実際に使う 8〜10 キーだけを Swift にコピーしてある。
//  ロケール解決は ShareAppGroup（uiLang）→ 端末ロケール → "en" の順でフォールバックする。
//
//  Web Ext / macOS Share Ext と同一実装（folder reference 制約で重複）。
//

import Foundation

enum I18N {

    /// 11 言語 × Share UI 用キーの辞書。
    static let messages: [String: [String: String]] = [
        "ja": [
            "dualviewTitle": "DualView 翻訳", "original": "原文", "translated": "翻訳",
            "translating": "翻訳中…", "copyBtn": "コピー", "copied": "✓ コピー済",
            "close": "閉じる", "error": "[エラー]",
            "shareEmpty": "翻訳するテキストが見つかりませんでした", "shareCancel": "キャンセル",
        ],
        "en": [
            "dualviewTitle": "DualView Translate", "original": "Original", "translated": "Translation",
            "translating": "Translating…", "copyBtn": "Copy", "copied": "✓ Copied",
            "close": "Close", "error": "[Error]",
            "shareEmpty": "No translatable text found", "shareCancel": "Cancel",
        ],
        // 辞書キーは BCP-47 を全 lowercase に統一（"zh-cn" / "zh-tw"）。
        // currentLang() 側で正規化したロケール（lowercase + "_" → "-"）と直接ヒットさせるため。
        "zh-cn": [
            "dualviewTitle": "DualView 翻译", "original": "原文", "translated": "翻译",
            "translating": "翻译中…", "copyBtn": "复制", "copied": "✓ 已复制",
            "close": "关闭", "error": "[错误]",
            "shareEmpty": "未找到可翻译的文本", "shareCancel": "取消",
        ],
        "zh-tw": [
            "dualviewTitle": "DualView 翻譯", "original": "原文", "translated": "翻譯",
            "translating": "翻譯中…", "copyBtn": "複製", "copied": "✓ 已複製",
            "close": "關閉", "error": "[錯誤]",
            "shareEmpty": "未找到可翻譯的文字", "shareCancel": "取消",
        ],
        "ko": [
            "dualviewTitle": "DualView 번역", "original": "원문", "translated": "번역",
            "translating": "번역 중…", "copyBtn": "복사", "copied": "✓ 복사됨",
            "close": "닫기", "error": "[오류]",
            "shareEmpty": "번역할 텍스트를 찾을 수 없습니다", "shareCancel": "취소",
        ],
        "fr": [
            "dualviewTitle": "DualView Traduction", "original": "Original", "translated": "Traduction",
            "translating": "Traduction…", "copyBtn": "Copier", "copied": "✓ Copié",
            "close": "Fermer", "error": "[Erreur]",
            "shareEmpty": "Aucun texte traduisible trouvé", "shareCancel": "Annuler",
        ],
        "de": [
            "dualviewTitle": "DualView Übersetzer", "original": "Original", "translated": "Übersetzung",
            "translating": "Übersetze…", "copyBtn": "Kopieren", "copied": "✓ Kopiert",
            "close": "Schließen", "error": "[Fehler]",
            "shareEmpty": "Kein übersetzbarer Text gefunden", "shareCancel": "Abbrechen",
        ],
        "es": [
            "dualviewTitle": "DualView Traducción", "original": "Original", "translated": "Traducción",
            "translating": "Traduciendo…", "copyBtn": "Copiar", "copied": "✓ Copiado",
            "close": "Cerrar", "error": "[Error]",
            "shareEmpty": "No se encontró texto traducible", "shareCancel": "Cancelar",
        ],
        "pt": [
            "dualviewTitle": "DualView Tradução", "original": "Original", "translated": "Tradução",
            "translating": "Traduzindo…", "copyBtn": "Copiar", "copied": "✓ Copiado",
            "close": "Fechar", "error": "[Erro]",
            "shareEmpty": "Nenhum texto traduzível encontrado", "shareCancel": "Cancelar",
        ],
        "ru": [
            "dualviewTitle": "DualView Перевод", "original": "Оригинал", "translated": "Перевод",
            "translating": "Перевод…", "copyBtn": "Копировать", "copied": "✓ Скопировано",
            "close": "Закрыть", "error": "[Ошибка]",
            "shareEmpty": "Переводимый текст не найден", "shareCancel": "Отмена",
        ],
        "ar": [
            "dualviewTitle": "DualView ترجمة", "original": "الأصل", "translated": "الترجمة",
            "translating": "جارٍ الترجمة…", "copyBtn": "نسخ", "copied": "✓ تم النسخ",
            "close": "إغلاق", "error": "[خطأ]",
            "shareEmpty": "لم يتم العثور على نص قابل للترجمة", "shareCancel": "إلغاء",
        ],
    ]

    /// Web Ext がミラーした uiLang → 端末ロケール → "en" の順でフォールバックして翻訳を返す。
    /// `currentLang()` が常に正規化済み lang を返すため、ここで再正規化はしない。
    static func t(_ key: String) -> String {
        let lang = currentLang()
        if let value = messages[lang]?[key] { return value }
        if let base = lang.split(separator: "-").first.map(String.init),
           let value = messages[base]?[key] {
            return value
        }
        return messages["en"]?[key] ?? key
    }

    /// 利用する言語コードを解決する。App Group / 端末ロケール双方を `normalize` に通すため、
    /// "zh-CN" / "ZH_CN" / "zh-Hans-JP" 等の表記ゆれでも messages 辞書のキー（"zh-cn" 等）に揃う。
    static func currentLang() -> String {
        if let raw = ShareAppGroup.defaults?.string(forKey: ShareAppGroup.Keys.uiLang),
           !raw.isEmpty {
            return normalize(raw)
        }
        let preferred = Locale.preferredLanguages.first ?? "en"
        return normalize(preferred)
    }

    /// "zh-CN" / "zh_CN" / "ZH-CN" / "zh-Hans" / "zh-Hans-JP" 等の表記ゆれを
    /// messages 辞書のキー（全 lowercase："ja" / "en" / "zh-cn" / "zh-tw" / ...）に正規化する。
    private static func normalize(_ raw: String) -> String {
        let lower = raw.lowercased().replacingOccurrences(of: "_", with: "-")
        if messages[lower] != nil { return lower }
        if let base = lower.split(separator: "-").first.map(String.init), messages[base] != nil {
            return base
        }
        // zh 系の特殊処理（macOS は "zh-Hans-JP" など Hans/Hant suffix が付く）
        if lower.hasPrefix("zh") {
            return lower.contains("hant") || lower.contains("tw") ? "zh-tw" : "zh-cn"
        }
        return "en"
    }
}
