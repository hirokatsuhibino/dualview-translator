// Copyright (c) Orangesoft Inc.
// DualView Translator — Container App の Safari 拡張案内画面（Main.html）の i18n + 状態切替

// ─── i18n 辞書 ────────────────────────────────────────────────────────
// 拡張本体の i18n.js と同じ 11 言語。キー名は Container App 専用なので別管理。
// キーを追加・変更したら Main.html の data-i18n 属性も同期して更新する。
const I18N_MESSAGES = {
    "ja": {
        iosEnable:               "Safari の設定から DualView Translator 拡張を有効にしてください。",
        macUnknown:              "Safari の機能拡張設定から DualView Translator 拡張を有効にしてください。",
        macUnknownSettings:      "Safari の設定 → 機能拡張から DualView Translator 拡張を有効にしてください。",
        macOn:                   "DualView Translator 拡張は現在オンです。Safari の機能拡張設定からオフにできます。",
        macOnSettings:           "DualView Translator 拡張は現在オンです。Safari の設定 → 機能拡張からオフにできます。",
        macOff:                  "DualView Translator 拡張は現在オフです。Safari の機能拡張設定からオンにできます。",
        macOffSettings:          "DualView Translator 拡張は現在オフです。Safari の設定 → 機能拡張からオンにできます。",
        openPreferencesBtn:      "終了して Safari の機能拡張設定を開く…",
        openPreferencesBtnSettings: "終了して Safari の設定を開く…",
    },
    "en": {
        iosEnable:               "You can turn on DualView Translator’s Safari extension in Settings.",
        macUnknown:              "You can turn on DualView Translator’s extension in Safari Extensions preferences.",
        macUnknownSettings:      "You can turn on DualView Translator’s extension in the Extensions section of Safari Settings.",
        macOn:                   "DualView Translator’s extension is currently on. You can turn it off in Safari Extensions preferences.",
        macOnSettings:           "DualView Translator’s extension is currently on. You can turn it off in the Extensions section of Safari Settings.",
        macOff:                  "DualView Translator’s extension is currently off. You can turn it on in Safari Extensions preferences.",
        macOffSettings:          "DualView Translator’s extension is currently off. You can turn it on in the Extensions section of Safari Settings.",
        openPreferencesBtn:      "Quit and Open Safari Extensions Preferences…",
        openPreferencesBtnSettings: "Quit and Open Safari Settings…",
    },
    "zh-CN": {
        iosEnable:               "请在 Safari 设置中启用 DualView Translator 扩展。",
        macUnknown:              "请在 Safari 扩展设置中启用 DualView Translator 扩展。",
        macUnknownSettings:      "请在 Safari 设置 → 扩展中启用 DualView Translator 扩展。",
        macOn:                   "DualView Translator 扩展当前已启用。可在 Safari 扩展设置中关闭。",
        macOnSettings:           "DualView Translator 扩展当前已启用。可在 Safari 设置 → 扩展中关闭。",
        macOff:                  "DualView Translator 扩展当前已关闭。可在 Safari 扩展设置中启用。",
        macOffSettings:          "DualView Translator 扩展当前已关闭。可在 Safari 设置 → 扩展中启用。",
        openPreferencesBtn:      "退出并打开 Safari 扩展设置…",
        openPreferencesBtnSettings: "退出并打开 Safari 设置…",
    },
    "zh-TW": {
        iosEnable:               "請在 Safari 設定中啟用 DualView Translator 擴充功能。",
        macUnknown:              "請在 Safari 擴充功能設定中啟用 DualView Translator 擴充功能。",
        macUnknownSettings:      "請在 Safari 設定 → 擴充功能中啟用 DualView Translator 擴充功能。",
        macOn:                   "DualView Translator 擴充功能目前已啟用。可在 Safari 擴充功能設定中關閉。",
        macOnSettings:           "DualView Translator 擴充功能目前已啟用。可在 Safari 設定 → 擴充功能中關閉。",
        macOff:                  "DualView Translator 擴充功能目前已關閉。可在 Safari 擴充功能設定中啟用。",
        macOffSettings:          "DualView Translator 擴充功能目前已關閉。可在 Safari 設定 → 擴充功能中啟用。",
        openPreferencesBtn:      "結束並開啟 Safari 擴充功能設定…",
        openPreferencesBtnSettings: "結束並開啟 Safari 設定…",
    },
    "ko": {
        iosEnable:               "Safari 설정에서 DualView Translator 확장 프로그램을 켤 수 있습니다.",
        macUnknown:              "Safari 확장 프로그램 환경설정에서 DualView Translator 확장 프로그램을 켤 수 있습니다.",
        macUnknownSettings:      "Safari 설정의 확장 프로그램 섹션에서 DualView Translator 확장 프로그램을 켤 수 있습니다.",
        macOn:                   "DualView Translator 확장 프로그램이 현재 켜져 있습니다. Safari 확장 프로그램 환경설정에서 끌 수 있습니다.",
        macOnSettings:           "DualView Translator 확장 프로그램이 현재 켜져 있습니다. Safari 설정의 확장 프로그램 섹션에서 끌 수 있습니다.",
        macOff:                  "DualView Translator 확장 프로그램이 현재 꺼져 있습니다. Safari 확장 프로그램 환경설정에서 켤 수 있습니다.",
        macOffSettings:          "DualView Translator 확장 프로그램이 현재 꺼져 있습니다. Safari 설정의 확장 프로그램 섹션에서 켤 수 있습니다.",
        openPreferencesBtn:      "종료하고 Safari 확장 프로그램 환경설정 열기…",
        openPreferencesBtnSettings: "종료하고 Safari 설정 열기…",
    },
    "fr": {
        iosEnable:               "Vous pouvez activer l’extension Safari DualView Translator dans Réglages.",
        macUnknown:              "Vous pouvez activer l’extension DualView Translator dans les préférences des extensions Safari.",
        macUnknownSettings:      "Vous pouvez activer l’extension DualView Translator dans la section Extensions des Réglages de Safari.",
        macOn:                   "L’extension DualView Translator est actuellement activée. Vous pouvez la désactiver dans les préférences des extensions Safari.",
        macOnSettings:           "L’extension DualView Translator est actuellement activée. Vous pouvez la désactiver dans la section Extensions des Réglages de Safari.",
        macOff:                  "L’extension DualView Translator est actuellement désactivée. Vous pouvez l’activer dans les préférences des extensions Safari.",
        macOffSettings:          "L’extension DualView Translator est actuellement désactivée. Vous pouvez l’activer dans la section Extensions des Réglages de Safari.",
        openPreferencesBtn:      "Quitter et ouvrir les préférences des extensions Safari…",
        openPreferencesBtnSettings: "Quitter et ouvrir les Réglages de Safari…",
    },
    "de": {
        iosEnable:               "Sie können die Safari-Erweiterung von DualView Translator in den Einstellungen aktivieren.",
        macUnknown:              "Sie können die DualView Translator-Erweiterung in den Safari-Erweiterungseinstellungen aktivieren.",
        macUnknownSettings:      "Sie können die DualView Translator-Erweiterung im Bereich „Erweiterungen“ der Safari-Einstellungen aktivieren.",
        macOn:                   "Die DualView Translator-Erweiterung ist derzeit aktiviert. Sie können sie in den Safari-Erweiterungseinstellungen deaktivieren.",
        macOnSettings:           "Die DualView Translator-Erweiterung ist derzeit aktiviert. Sie können sie im Bereich „Erweiterungen“ der Safari-Einstellungen deaktivieren.",
        macOff:                  "Die DualView Translator-Erweiterung ist derzeit deaktiviert. Sie können sie in den Safari-Erweiterungseinstellungen aktivieren.",
        macOffSettings:          "Die DualView Translator-Erweiterung ist derzeit deaktiviert. Sie können sie im Bereich „Erweiterungen“ der Safari-Einstellungen aktivieren.",
        openPreferencesBtn:      "Beenden und Safari-Erweiterungseinstellungen öffnen…",
        openPreferencesBtnSettings: "Beenden und Safari-Einstellungen öffnen…",
    },
    "es": {
        iosEnable:               "Puedes activar la extensión de Safari DualView Translator en Ajustes.",
        macUnknown:              "Puedes activar la extensión DualView Translator en las preferencias de extensiones de Safari.",
        macUnknownSettings:      "Puedes activar la extensión DualView Translator en la sección Extensiones de los Ajustes de Safari.",
        macOn:                   "La extensión DualView Translator está activada. Puedes desactivarla en las preferencias de extensiones de Safari.",
        macOnSettings:           "La extensión DualView Translator está activada. Puedes desactivarla en la sección Extensiones de los Ajustes de Safari.",
        macOff:                  "La extensión DualView Translator está desactivada. Puedes activarla en las preferencias de extensiones de Safari.",
        macOffSettings:          "La extensión DualView Translator está desactivada. Puedes activarla en la sección Extensiones de los Ajustes de Safari.",
        openPreferencesBtn:      "Salir y abrir las preferencias de extensiones de Safari…",
        openPreferencesBtnSettings: "Salir y abrir los Ajustes de Safari…",
    },
    "pt": {
        iosEnable:               "Você pode ativar a extensão Safari do DualView Translator em Ajustes.",
        macUnknown:              "Você pode ativar a extensão do DualView Translator nas preferências de extensões do Safari.",
        macUnknownSettings:      "Você pode ativar a extensão do DualView Translator na seção Extensões dos Ajustes do Safari.",
        macOn:                   "A extensão do DualView Translator está ativada. Você pode desativá-la nas preferências de extensões do Safari.",
        macOnSettings:           "A extensão do DualView Translator está ativada. Você pode desativá-la na seção Extensões dos Ajustes do Safari.",
        macOff:                  "A extensão do DualView Translator está desativada. Você pode ativá-la nas preferências de extensões do Safari.",
        macOffSettings:          "A extensão do DualView Translator está desativada. Você pode ativá-la na seção Extensões dos Ajustes do Safari.",
        openPreferencesBtn:      "Encerrar e abrir as preferências de extensões do Safari…",
        openPreferencesBtnSettings: "Encerrar e abrir os Ajustes do Safari…",
    },
    "ru": {
        iosEnable:               "Вы можете включить расширение Safari DualView Translator в Настройках.",
        macUnknown:              "Вы можете включить расширение DualView Translator в настройках расширений Safari.",
        macUnknownSettings:      "Вы можете включить расширение DualView Translator в разделе «Расширения» Настроек Safari.",
        macOn:                   "Расширение DualView Translator сейчас включено. Его можно отключить в настройках расширений Safari.",
        macOnSettings:           "Расширение DualView Translator сейчас включено. Его можно отключить в разделе «Расширения» Настроек Safari.",
        macOff:                  "Расширение DualView Translator сейчас выключено. Его можно включить в настройках расширений Safari.",
        macOffSettings:          "Расширение DualView Translator сейчас выключено. Его можно включить в разделе «Расширения» Настроек Safari.",
        openPreferencesBtn:      "Выйти и открыть настройки расширений Safari…",
        openPreferencesBtnSettings: "Выйти и открыть Настройки Safari…",
    },
    "ar": {
        iosEnable:               "يمكنك تفعيل امتداد Safari الخاص بـ DualView Translator من الإعدادات.",
        macUnknown:              "يمكنك تفعيل امتداد DualView Translator من تفضيلات امتدادات Safari.",
        macUnknownSettings:      "يمكنك تفعيل امتداد DualView Translator من قسم الامتدادات في إعدادات Safari.",
        macOn:                   "امتداد DualView Translator مفعَّل حاليًا. يمكنك إيقافه من تفضيلات امتدادات Safari.",
        macOnSettings:           "امتداد DualView Translator مفعَّل حاليًا. يمكنك إيقافه من قسم الامتدادات في إعدادات Safari.",
        macOff:                  "امتداد DualView Translator متوقف حاليًا. يمكنك تفعيله من تفضيلات امتدادات Safari.",
        macOffSettings:          "امتداد DualView Translator متوقف حاليًا. يمكنك تفعيله من قسم الامتدادات في إعدادات Safari.",
        openPreferencesBtn:      "إنهاء وفتح تفضيلات امتدادات Safari…",
        openPreferencesBtnSettings: "إنهاء وفتح إعدادات Safari…",
    },
};

// 端末ロケールを 11 言語のいずれかに正規化する。
// macOS は "zh-Hans-JP" のように Hans/Hant suffix を付けるので、その分解にも対応。
function resolveLang() {
    const raw = (navigator.language || "en").toLowerCase().replace(/_/g, "-");
    if (I18N_MESSAGES[raw]) return raw;
    const base = raw.split("-")[0];
    if (I18N_MESSAGES[base]) return base;
    if (raw.startsWith("zh")) {
        return raw.includes("hant") || raw.includes("tw") ? "zh-TW" : "zh-CN";
    }
    return "en";
}

// data-i18n 属性に対応するメッセージを反映する。
// settings 表記用キー（macUnknownSettings 等）は useSettingsInsteadOfPreferences のときに上書きする。
function applyI18n(useSettingsInsteadOfPreferences) {
    const lang = resolveLang();
    const fallback = I18N_MESSAGES["en"];
    const table = I18N_MESSAGES[lang] || fallback;

    // RTL 切替（アラビア語）
    if (lang === "ar") {
        document.documentElement.dir = "rtl";
        document.documentElement.lang = "ar";
    } else {
        document.documentElement.dir = "ltr";
        document.documentElement.lang = lang;
    }

    document.querySelectorAll("[data-i18n]").forEach((el) => {
        const baseKey = el.getAttribute("data-i18n");
        // useSettingsInsteadOfPreferences が true のときは "<baseKey>Settings" 版を優先
        const settingsKey = baseKey + "Settings";
        let key = baseKey;
        if (useSettingsInsteadOfPreferences && (table[settingsKey] || fallback[settingsKey])) {
            key = settingsKey;
        }
        const text = table[key] || fallback[key];
        if (text) el.textContent = text;
    });
}

// SafariWebExtensionHandler / ViewController から呼ばれるエントリーポイント
function show(platform, enabled, useSettingsInsteadOfPreferences) {
    document.body.classList.add(`platform-${platform}`);

    // 言語に応じてテキストを差し替え（既存の useSettingsInsteadOfPreferences 切替も統合）
    applyI18n(useSettingsInsteadOfPreferences);

    if (typeof enabled === "boolean") {
        document.body.classList.toggle(`state-on`, enabled);
        document.body.classList.toggle(`state-off`, !enabled);
    } else {
        document.body.classList.remove(`state-on`);
        document.body.classList.remove(`state-off`);
    }
}

function openPreferences() {
    webkit.messageHandlers.controller.postMessage("open-preferences");
}

document.querySelector("button.open-preferences").addEventListener("click", openPreferences);

// show() 経由で applyI18n が呼ばれるが、Native 側から show() がまだ呼ばれていない初期描画時にも
// 端末ロケールでテキストを表示しておきたいので、DOMContentLoaded で 1 回適用する。
// （show() がその後呼ばれた時に再度同じ言語で書き換えるが冪等）
document.addEventListener("DOMContentLoaded", () => applyI18n(false));
