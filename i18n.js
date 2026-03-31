// DualView Translator — UI多言語対応モジュール
// content.js / popup.js の両方から利用される

// eslint-disable-next-line no-var
var DVT_I18N = (function () {
  'use strict';

  // ─── 翻訳辞書 ──────────────────────────────────────────────────────────
  const MESSAGES = {
    ja: {
      // popup
      uiLangLabel: '表示言語',
      targetLangLabel: '翻訳先の言語',
      targetLangTo: '→ 翻訳先',
      translateMode: '翻訳モード',
      translateFullPage: 'ページ全体を翻訳',
      translateRegion: '領域を選択して翻訳',
      translateReset: '翻訳をリセット',
      translatingClick: '翻訳中（クリックで解除）',
      statusDefault: 'テキストを選択して翻訳、またはモードを選択',
      statusTranslating: 'ページを翻訳中…',
      statusPageActive: 'ページ翻訳中（リセットで元に戻す）',
      statusUnavailable: 'このページでは利用できません',
      statusSelectRegion: '領域を選択してください…',
      selectionTip: '<strong>選択翻訳：</strong>ページ上でテキストを選択すると、自動的に翻訳パネルが表示されます。',
      engineInfo: '<strong>翻訳エンジン：</strong>Google 翻訳（無料）',
      brandSub: '原文と翻訳を並べて表示',
      // content — 選択パネル
      dualviewTitle: 'DualView 翻訳',
      original: '原文',
      translated: '翻訳',
      translateBtn: '翻訳する',
      retranslateBtn: '再翻訳',
      translating: '翻訳中…',
      copyBtn: 'コピー',
      copied: '✓ コピー済',
      sameLang: '原文と翻訳先の言語が同じです（{lang}）',
      error: '[エラー]',
      translateFailed: '[翻訳失敗]',
      close: '閉じる',
      // content — 翻訳バー
      translateBarMsg: 'このページは <strong>{lang}</strong> で書かれています。翻訳しますか？',
      translateBarAccept: '翻訳する',
      // content — トースト
      toastTranslating: '{done} / {total} 翻訳中…',
      toastDone: '✓ {count} 件翻訳完了',
      toastReset: '翻訳をリセットしました',
      toastNoText: '翻訳対象のテキストが見つかりませんでした',
      // content — 範囲選択
      regionHint: '翻訳したい領域をドラッグして選択してください  [Esc でキャンセル]',
      // エンジン設定
      engineLabel: '翻訳エンジン',
      engineGoogle: 'Google 翻訳（無料）',
      engineDeepL: 'DeepL（APIキー必要）',
      deeplApiKeyLabel: 'DeepL APIキー',
      deeplApiKeyPlaceholder: 'APIキーを入力',
      // ショートカット
      shortcutInfo: '<strong>ショートカット：</strong>Alt+T（ページ翻訳）/ Alt+S（選択翻訳）/ Alt+R（領域選択）',
    },
    en: {
      uiLangLabel: 'Display Language',
      targetLangLabel: 'Target Language',
      targetLangTo: '→ Target',
      translateMode: 'Translation Mode',
      translateFullPage: 'Translate Entire Page',
      translateRegion: 'Select Region to Translate',
      translateReset: 'Reset Translation',
      translatingClick: 'Translating (click to cancel)',
      statusDefault: 'Select text to translate, or choose a mode',
      statusTranslating: 'Translating page…',
      statusPageActive: 'Page translated (reset to restore)',
      statusUnavailable: 'Not available on this page',
      statusSelectRegion: 'Select a region…',
      selectionTip: '<strong>Selection:</strong> Select text on the page to automatically show the translation panel.',
      engineInfo: '<strong>Engine:</strong> Google Translate (free)',
      brandSub: 'Side-by-side original & translation',
      dualviewTitle: 'DualView Translate',
      original: 'Original',
      translated: 'Translation',
      translateBtn: 'Translate',
      retranslateBtn: 'Re-translate',
      translating: 'Translating…',
      copyBtn: 'Copy',
      copied: '✓ Copied',
      sameLang: 'Source and target language are the same ({lang})',
      error: '[Error]',
      translateFailed: '[Translation failed]',
      close: 'Close',
      translateBarMsg: 'This page is written in <strong>{lang}</strong>. Translate it?',
      translateBarAccept: 'Translate',
      toastTranslating: '{done} / {total} translating…',
      toastDone: '✓ {count} translated',
      toastReset: 'Translation reset',
      toastNoText: 'No translatable text found',
      regionHint: 'Drag to select a region to translate  [Esc to cancel]',
      engineLabel: 'Translation Engine',
      engineGoogle: 'Google Translate (free)',
      engineDeepL: 'DeepL (API key required)',
      deeplApiKeyLabel: 'DeepL API Key',
      deeplApiKeyPlaceholder: 'Enter API key',
      shortcutInfo: '<strong>Shortcuts:</strong> Alt+T (page translate) / Alt+S (selection) / Alt+R (region)',
    },
    'zh-CN': {
      uiLangLabel: '显示语言',
      targetLangLabel: '目标语言',
      targetLangTo: '→ 目标',
      translateMode: '翻译模式',
      translateFullPage: '翻译整个页面',
      translateRegion: '选择区域翻译',
      translateReset: '重置翻译',
      translatingClick: '翻译中（点击取消）',
      statusDefault: '选择文本翻译，或选择模式',
      statusTranslating: '正在翻译页面…',
      statusPageActive: '页面已翻译（重置恢复）',
      statusUnavailable: '此页面不可用',
      statusSelectRegion: '请选择区域…',
      selectionTip: '<strong>选择翻译：</strong>在页面上选择文本，自动显示翻译面板。',
      engineInfo: '<strong>翻译引擎：</strong>Google 翻译（免费）',
      brandSub: '并排显示原文与翻译',
      dualviewTitle: 'DualView 翻译',
      original: '原文',
      translated: '翻译',
      translateBtn: '翻译',
      retranslateBtn: '重新翻译',
      translating: '翻译中…',
      copyBtn: '复制',
      copied: '✓ 已复制',
      sameLang: '原文与目标语言相同（{lang}）',
      error: '[错误]',
      translateFailed: '[翻译失败]',
      close: '关闭',
      translateBarMsg: '此页面使用 <strong>{lang}</strong> 编写。是否翻译？',
      translateBarAccept: '翻译',
      toastTranslating: '{done} / {total} 翻译中…',
      toastDone: '✓ 已翻译 {count} 条',
      toastReset: '翻译已重置',
      toastNoText: '未找到可翻译的文本',
      regionHint: '拖动选择要翻译的区域 [Esc 取消]',
      engineLabel: '翻译引擎',
      engineGoogle: 'Google 翻译（免费）',
      engineDeepL: 'DeepL（需要API密钥）',
      deeplApiKeyLabel: 'DeepL API密钥',
      deeplApiKeyPlaceholder: '输入API密钥',
      shortcutInfo: '<strong>快捷键：</strong>Alt+T（页面翻译）/ Alt+S（选择翻译）/ Alt+R（区域选择）',
    },
    'zh-TW': {
      uiLangLabel: '顯示語言',
      targetLangLabel: '目標語言',
      targetLangTo: '→ 目標',
      translateMode: '翻譯模式',
      translateFullPage: '翻譯整個頁面',
      translateRegion: '選擇區域翻譯',
      translateReset: '重置翻譯',
      translatingClick: '翻譯中（點擊取消）',
      statusDefault: '選擇文字翻譯，或選擇模式',
      statusTranslating: '正在翻譯頁面…',
      statusPageActive: '頁面已翻譯（重置恢復）',
      statusUnavailable: '此頁面不可用',
      statusSelectRegion: '請選擇區域…',
      selectionTip: '<strong>選擇翻譯：</strong>在頁面上選擇文字，自動顯示翻譯面板。',
      engineInfo: '<strong>翻譯引擎：</strong>Google 翻譯（免費）',
      brandSub: '並排顯示原文與翻譯',
      dualviewTitle: 'DualView 翻譯',
      original: '原文',
      translated: '翻譯',
      translateBtn: '翻譯',
      retranslateBtn: '重新翻譯',
      translating: '翻譯中…',
      copyBtn: '複製',
      copied: '✓ 已複製',
      sameLang: '原文與目標語言相同（{lang}）',
      error: '[錯誤]',
      translateFailed: '[翻譯失敗]',
      close: '關閉',
      translateBarMsg: '此頁面使用 <strong>{lang}</strong> 撰寫。是否翻譯？',
      translateBarAccept: '翻譯',
      toastTranslating: '{done} / {total} 翻譯中…',
      toastDone: '✓ 已翻譯 {count} 條',
      toastReset: '翻譯已重置',
      toastNoText: '未找到可翻譯的文字',
      regionHint: '拖動選擇要翻譯的區域 [Esc 取消]',
      engineLabel: '翻譯引擎',
      engineGoogle: 'Google 翻譯（免費）',
      engineDeepL: 'DeepL（需要API金鑰）',
      deeplApiKeyLabel: 'DeepL API金鑰',
      deeplApiKeyPlaceholder: '輸入API金鑰',
      shortcutInfo: '<strong>快捷鍵：</strong>Alt+T（頁面翻譯）/ Alt+S（選擇翻譯）/ Alt+R（區域選擇）',
    },
    ko: {
      uiLangLabel: '표시 언어',
      targetLangLabel: '번역 대상 언어',
      targetLangTo: '→ 대상',
      translateMode: '번역 모드',
      translateFullPage: '전체 페이지 번역',
      translateRegion: '영역 선택하여 번역',
      translateReset: '번역 초기화',
      translatingClick: '번역 중 (클릭하여 취소)',
      statusDefault: '텍스트를 선택하여 번역하거나 모드를 선택하세요',
      statusTranslating: '페이지 번역 중…',
      statusPageActive: '페이지 번역 완료 (초기화로 복원)',
      statusUnavailable: '이 페이지에서는 사용할 수 없습니다',
      statusSelectRegion: '영역을 선택하세요…',
      selectionTip: '<strong>선택 번역:</strong> 페이지에서 텍스트를 선택하면 번역 패널이 자동으로 표시됩니다.',
      engineInfo: '<strong>번역 엔진:</strong> Google 번역 (무료)',
      brandSub: '원문과 번역을 나란히 표시',
      dualviewTitle: 'DualView 번역',
      original: '원문',
      translated: '번역',
      translateBtn: '번역',
      retranslateBtn: '재번역',
      translating: '번역 중…',
      copyBtn: '복사',
      copied: '✓ 복사됨',
      sameLang: '원문과 대상 언어가 같습니다 ({lang})',
      error: '[오류]',
      translateFailed: '[번역 실패]',
      close: '닫기',
      translateBarMsg: '이 페이지는 <strong>{lang}</strong>로 작성되었습니다. 번역하시겠습니까?',
      translateBarAccept: '번역',
      toastTranslating: '{done} / {total} 번역 중…',
      toastDone: '✓ {count}건 번역 완료',
      toastReset: '번역이 초기화되었습니다',
      toastNoText: '번역할 텍스트를 찾을 수 없습니다',
      regionHint: '번역할 영역을 드래그하여 선택하세요 [Esc로 취소]',
      engineLabel: '번역 엔진',
      engineGoogle: 'Google 번역 (무료)',
      engineDeepL: 'DeepL (API 키 필요)',
      deeplApiKeyLabel: 'DeepL API 키',
      deeplApiKeyPlaceholder: 'API 키 입력',
      shortcutInfo: '<strong>단축키:</strong> Alt+T (페이지 번역) / Alt+S (선택 번역) / Alt+R (영역 선택)',
    },
    fr: {
      uiLangLabel: "Langue d'affichage",
      targetLangLabel: 'Langue cible',
      targetLangTo: '→ Cible',
      translateMode: 'Mode de traduction',
      translateFullPage: 'Traduire la page entière',
      translateRegion: 'Sélectionner une zone à traduire',
      translateReset: 'Réinitialiser la traduction',
      translatingClick: 'Traduction en cours (cliquez pour annuler)',
      statusDefault: 'Sélectionnez du texte ou choisissez un mode',
      statusTranslating: 'Traduction de la page…',
      statusPageActive: 'Page traduite (réinitialiser pour restaurer)',
      statusUnavailable: 'Non disponible sur cette page',
      statusSelectRegion: 'Sélectionnez une zone…',
      selectionTip: '<strong>Sélection :</strong> Sélectionnez du texte sur la page pour afficher le panneau de traduction.',
      engineInfo: '<strong>Moteur :</strong> Google Traduction (gratuit)',
      brandSub: 'Original et traduction côte à côte',
      dualviewTitle: 'DualView Traduction',
      original: 'Original',
      translated: 'Traduction',
      translateBtn: 'Traduire',
      retranslateBtn: 'Retraduire',
      translating: 'Traduction…',
      copyBtn: 'Copier',
      copied: '✓ Copié',
      sameLang: 'La langue source et cible sont identiques ({lang})',
      error: '[Erreur]',
      translateFailed: '[Échec de la traduction]',
      close: 'Fermer',
      translateBarMsg: 'Cette page est en <strong>{lang}</strong>. La traduire ?',
      translateBarAccept: 'Traduire',
      toastTranslating: '{done} / {total} en cours…',
      toastDone: '✓ {count} traduits',
      toastReset: 'Traduction réinitialisée',
      toastNoText: 'Aucun texte traduisible trouvé',
      regionHint: 'Faites glisser pour sélectionner une zone [Échap pour annuler]',
      engineLabel: 'Moteur de traduction',
      engineGoogle: 'Google Traduction (gratuit)',
      engineDeepL: 'DeepL (clé API requise)',
      deeplApiKeyLabel: 'Clé API DeepL',
      deeplApiKeyPlaceholder: 'Entrez la clé API',
      shortcutInfo: '<strong>Raccourcis :</strong> Alt+T (page) / Alt+S (sélection) / Alt+R (région)',
    },
    de: {
      uiLangLabel: 'Anzeigesprache',
      targetLangLabel: 'Zielsprache',
      targetLangTo: '→ Ziel',
      translateMode: 'Übersetzungsmodus',
      translateFullPage: 'Gesamte Seite übersetzen',
      translateRegion: 'Bereich zum Übersetzen auswählen',
      translateReset: 'Übersetzung zurücksetzen',
      translatingClick: 'Übersetzung läuft (klicken zum Abbrechen)',
      statusDefault: 'Text auswählen oder Modus wählen',
      statusTranslating: 'Seite wird übersetzt…',
      statusPageActive: 'Seite übersetzt (zurücksetzen zum Wiederherstellen)',
      statusUnavailable: 'Auf dieser Seite nicht verfügbar',
      statusSelectRegion: 'Bereich auswählen…',
      selectionTip: '<strong>Auswahl:</strong> Wählen Sie Text auf der Seite aus, um das Übersetzungspanel anzuzeigen.',
      engineInfo: '<strong>Engine:</strong> Google Übersetzer (kostenlos)',
      brandSub: 'Original und Übersetzung nebeneinander',
      dualviewTitle: 'DualView Übersetzer',
      original: 'Original',
      translated: 'Übersetzung',
      translateBtn: 'Übersetzen',
      retranslateBtn: 'Erneut übersetzen',
      translating: 'Übersetze…',
      copyBtn: 'Kopieren',
      copied: '✓ Kopiert',
      sameLang: 'Quell- und Zielsprache sind identisch ({lang})',
      error: '[Fehler]',
      translateFailed: '[Übersetzung fehlgeschlagen]',
      close: 'Schließen',
      translateBarMsg: 'Diese Seite ist auf <strong>{lang}</strong>. Übersetzen?',
      translateBarAccept: 'Übersetzen',
      toastTranslating: '{done} / {total} übersetze…',
      toastDone: '✓ {count} übersetzt',
      toastReset: 'Übersetzung zurückgesetzt',
      toastNoText: 'Kein übersetzbarer Text gefunden',
      regionHint: 'Ziehen Sie, um einen Bereich auszuwählen [Esc zum Abbrechen]',
      engineLabel: 'Übersetzungs-Engine',
      engineGoogle: 'Google Übersetzer (kostenlos)',
      engineDeepL: 'DeepL (API-Schlüssel erforderlich)',
      deeplApiKeyLabel: 'DeepL API-Schlüssel',
      deeplApiKeyPlaceholder: 'API-Schlüssel eingeben',
      shortcutInfo: '<strong>Tastenkürzel:</strong> Alt+T (Seite) / Alt+S (Auswahl) / Alt+R (Bereich)',
    },
    es: {
      uiLangLabel: 'Idioma de la interfaz',
      targetLangLabel: 'Idioma de destino',
      targetLangTo: '→ Destino',
      translateMode: 'Modo de traducción',
      translateFullPage: 'Traducir toda la página',
      translateRegion: 'Seleccionar zona para traducir',
      translateReset: 'Restablecer traducción',
      translatingClick: 'Traduciendo (clic para cancelar)',
      statusDefault: 'Seleccione texto o elija un modo',
      statusTranslating: 'Traduciendo página…',
      statusPageActive: 'Página traducida (restablecer para restaurar)',
      statusUnavailable: 'No disponible en esta página',
      statusSelectRegion: 'Seleccione una zona…',
      selectionTip: '<strong>Selección:</strong> Seleccione texto en la página para mostrar el panel de traducción.',
      engineInfo: '<strong>Motor:</strong> Google Traductor (gratuito)',
      brandSub: 'Original y traducción lado a lado',
      dualviewTitle: 'DualView Traducción',
      original: 'Original',
      translated: 'Traducción',
      translateBtn: 'Traducir',
      retranslateBtn: 'Retraducir',
      translating: 'Traduciendo…',
      copyBtn: 'Copiar',
      copied: '✓ Copiado',
      sameLang: 'El idioma de origen y destino son iguales ({lang})',
      error: '[Error]',
      translateFailed: '[Error de traducción]',
      close: 'Cerrar',
      translateBarMsg: 'Esta página está en <strong>{lang}</strong>. ¿Traducirla?',
      translateBarAccept: 'Traducir',
      toastTranslating: '{done} / {total} traduciendo…',
      toastDone: '✓ {count} traducidos',
      toastReset: 'Traducción restablecida',
      toastNoText: 'No se encontró texto traducible',
      regionHint: 'Arrastre para seleccionar una zona [Esc para cancelar]',
      engineLabel: 'Motor de traducción',
      engineGoogle: 'Google Traductor (gratuito)',
      engineDeepL: 'DeepL (clave API requerida)',
      deeplApiKeyLabel: 'Clave API de DeepL',
      deeplApiKeyPlaceholder: 'Ingrese la clave API',
      shortcutInfo: '<strong>Atajos:</strong> Alt+T (página) / Alt+S (selección) / Alt+R (región)',
    },
    pt: {
      uiLangLabel: 'Idioma da interface',
      targetLangLabel: 'Idioma de destino',
      targetLangTo: '→ Destino',
      translateMode: 'Modo de tradução',
      translateFullPage: 'Traduzir página inteira',
      translateRegion: 'Selecionar região para traduzir',
      translateReset: 'Redefinir tradução',
      translatingClick: 'Traduzindo (clique para cancelar)',
      statusDefault: 'Selecione texto ou escolha um modo',
      statusTranslating: 'Traduzindo página…',
      statusPageActive: 'Página traduzida (redefinir para restaurar)',
      statusUnavailable: 'Não disponível nesta página',
      statusSelectRegion: 'Selecione uma região…',
      selectionTip: '<strong>Seleção:</strong> Selecione texto na página para exibir o painel de tradução.',
      engineInfo: '<strong>Motor:</strong> Google Tradutor (gratuito)',
      brandSub: 'Original e tradução lado a lado',
      dualviewTitle: 'DualView Tradução',
      original: 'Original',
      translated: 'Tradução',
      translateBtn: 'Traduzir',
      retranslateBtn: 'Retraduzir',
      translating: 'Traduzindo…',
      copyBtn: 'Copiar',
      copied: '✓ Copiado',
      sameLang: 'Idioma de origem e destino são iguais ({lang})',
      error: '[Erro]',
      translateFailed: '[Falha na tradução]',
      close: 'Fechar',
      translateBarMsg: 'Esta página está em <strong>{lang}</strong>. Traduzir?',
      translateBarAccept: 'Traduzir',
      toastTranslating: '{done} / {total} traduzindo…',
      toastDone: '✓ {count} traduzidos',
      toastReset: 'Tradução redefinida',
      toastNoText: 'Nenhum texto traduzível encontrado',
      regionHint: 'Arraste para selecionar uma região [Esc para cancelar]',
      engineLabel: 'Motor de tradução',
      engineGoogle: 'Google Tradutor (gratuito)',
      engineDeepL: 'DeepL (chave API necessária)',
      deeplApiKeyLabel: 'Chave API do DeepL',
      deeplApiKeyPlaceholder: 'Insira a chave API',
      shortcutInfo: '<strong>Atalhos:</strong> Alt+T (página) / Alt+S (seleção) / Alt+R (região)',
    },
    ru: {
      uiLangLabel: 'Язык интерфейса',
      targetLangLabel: 'Язык перевода',
      targetLangTo: '→ Цель',
      translateMode: 'Режим перевода',
      translateFullPage: 'Перевести всю страницу',
      translateRegion: 'Выбрать область для перевода',
      translateReset: 'Сбросить перевод',
      translatingClick: 'Перевод (нажмите для отмены)',
      statusDefault: 'Выделите текст или выберите режим',
      statusTranslating: 'Перевод страницы…',
      statusPageActive: 'Страница переведена (сброс для восстановления)',
      statusUnavailable: 'Недоступно на этой странице',
      statusSelectRegion: 'Выберите область…',
      selectionTip: '<strong>Выделение:</strong> Выделите текст на странице, чтобы отобразить панель перевода.',
      engineInfo: '<strong>Движок:</strong> Google Переводчик (бесплатно)',
      brandSub: 'Оригинал и перевод рядом',
      dualviewTitle: 'DualView Перевод',
      original: 'Оригинал',
      translated: 'Перевод',
      translateBtn: 'Перевести',
      retranslateBtn: 'Переперевести',
      translating: 'Перевод…',
      copyBtn: 'Копировать',
      copied: '✓ Скопировано',
      sameLang: 'Исходный и целевой языки совпадают ({lang})',
      error: '[Ошибка]',
      translateFailed: '[Ошибка перевода]',
      close: 'Закрыть',
      translateBarMsg: 'Эта страница на <strong>{lang}</strong>. Перевести?',
      translateBarAccept: 'Перевести',
      toastTranslating: '{done} / {total} перевод…',
      toastDone: '✓ {count} переведено',
      toastReset: 'Перевод сброшен',
      toastNoText: 'Переводимый текст не найден',
      regionHint: 'Перетащите для выбора области [Esc для отмены]',
      engineLabel: 'Движок перевода',
      engineGoogle: 'Google Переводчик (бесплатно)',
      engineDeepL: 'DeepL (требуется API-ключ)',
      deeplApiKeyLabel: 'API-ключ DeepL',
      deeplApiKeyPlaceholder: 'Введите API-ключ',
      shortcutInfo: '<strong>Горячие клавиши:</strong> Alt+T (страница) / Alt+S (выделение) / Alt+R (область)',
    },
    ar: {
      uiLangLabel: 'لغة العرض',
      targetLangLabel: 'اللغة المستهدفة',
      targetLangTo: '← الهدف',
      translateMode: 'وضع الترجمة',
      translateFullPage: 'ترجمة الصفحة بالكامل',
      translateRegion: 'تحديد منطقة للترجمة',
      translateReset: 'إعادة تعيين الترجمة',
      translatingClick: 'جارٍ الترجمة (انقر للإلغاء)',
      statusDefault: 'حدد نصًا للترجمة أو اختر وضعًا',
      statusTranslating: 'جارٍ ترجمة الصفحة…',
      statusPageActive: 'تمت ترجمة الصفحة (إعادة تعيين للاستعادة)',
      statusUnavailable: 'غير متاح في هذه الصفحة',
      statusSelectRegion: 'حدد منطقة…',
      selectionTip: '<strong>التحديد:</strong> حدد نصًا في الصفحة لعرض لوحة الترجمة تلقائيًا.',
      engineInfo: '<strong>المحرك:</strong> ترجمة Google (مجانية)',
      brandSub: 'عرض الأصل والترجمة جنبًا إلى جنب',
      dualviewTitle: 'DualView ترجمة',
      original: 'الأصل',
      translated: 'الترجمة',
      translateBtn: 'ترجمة',
      retranslateBtn: 'إعادة الترجمة',
      translating: 'جارٍ الترجمة…',
      copyBtn: 'نسخ',
      copied: '✓ تم النسخ',
      sameLang: 'لغة المصدر والهدف متطابقتان ({lang})',
      error: '[خطأ]',
      translateFailed: '[فشل الترجمة]',
      close: 'إغلاق',
      translateBarMsg: 'هذه الصفحة مكتوبة بـ <strong>{lang}</strong>. هل تريد ترجمتها؟',
      translateBarAccept: 'ترجمة',
      toastTranslating: '{done} / {total} جارٍ الترجمة…',
      toastDone: '✓ تمت ترجمة {count}',
      toastReset: 'تمت إعادة تعيين الترجمة',
      toastNoText: 'لم يتم العثور على نص قابل للترجمة',
      regionHint: 'اسحب لتحديد منطقة للترجمة [Esc للإلغاء]',
      engineLabel: 'محرك الترجمة',
      engineGoogle: 'ترجمة Google (مجانية)',
      engineDeepL: 'DeepL (مفتاح API مطلوب)',
      deeplApiKeyLabel: 'مفتاح API لـ DeepL',
      deeplApiKeyPlaceholder: 'أدخل مفتاح API',
      shortcutInfo: '<strong>اختصارات:</strong> Alt+T (الصفحة) / Alt+S (التحديد) / Alt+R (المنطقة)',
    },
  };

  // ─── 現在のUI言語（初期値: ブラウザ言語） ──────────────────────────────
  let currentLang = resolveDefaultLang();

  // ブラウザ言語からサポート言語を解決
  function resolveDefaultLang() {
    const browserLang = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
    // 完全一致を優先
    if (MESSAGES[browserLang]) return browserLang;
    // ベース言語で一致（例: zh → zh-CN, en-US → en）
    const base = browserLang.split('-')[0];
    if (MESSAGES[base]) return base;
    // zh系の特殊処理
    if (base === 'zh') {
      if (browserLang.includes('tw') || browserLang.includes('hant')) return 'zh-TW';
      return 'zh-CN';
    }
    return 'en';
  }

  // ─── 公開API ────────────────────────────────────────────────────────────

  // メッセージ取得（プレースホルダ対応）
  function t(key, params) {
    const msgs = MESSAGES[currentLang] || MESSAGES['en'] || MESSAGES['ja'];
    let text = msgs[key] || MESSAGES['en'][key] || MESSAGES['ja'][key] || key;
    if (params) {
      Object.keys(params).forEach(k => {
        text = text.replace(new RegExp('\\{' + k + '\\}', 'g'), params[k]);
      });
    }
    return text;
  }

  // 現在のUI言語を取得
  function getLang() {
    return currentLang;
  }

  // UI言語を設定（メモリのみ。永続化はcaller側でstorage.local.setする）
  function setLang(lang) {
    if (MESSAGES[lang]) {
      currentLang = lang;
    }
  }

  // storageから保存済みUI言語をロード（非同期）
  function loadLang(callback) {
    chrome.storage.local.get('uiLang', (data) => {
      if (data.uiLang && MESSAGES[data.uiLang]) {
        currentLang = data.uiLang;
      }
      if (callback) callback(currentLang);
    });
  }

  // data-i18n属性を持つ要素を一括翻訳
  function applyToDOM(root) {
    const container = root || document;
    container.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const translated = t(key);
      // innerHTML指定（selectionTip等HTMLを含むキー用）
      if (el.hasAttribute('data-i18n-html')) {
        el.innerHTML = translated;
      } else {
        el.textContent = translated;
      }
    });
    // placeholder属性
    container.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
    // title属性
    container.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.title = t(el.getAttribute('data-i18n-title'));
    });
  }

  // サポート言語一覧
  function supportedLangs() {
    return Object.keys(MESSAGES);
  }

  return { t, getLang, setLang, loadLang, applyToDOM, supportedLangs };
})();

// content.js / popup.js から簡単にアクセスするためのショートカット
// eslint-disable-next-line no-unused-vars
var t = DVT_I18N.t;
