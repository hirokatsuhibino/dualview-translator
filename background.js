// DualView Translator - Background Service Worker
// Handles translation API calls (avoids CORS issues in content scripts on some browsers)

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'translate') {
    fetchTranslation(msg.text, msg.tl, msg.sl || 'auto')
      .then(result => sendResponse({ ok: true, result }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg.action === 'detectLang') {
    // 言語検出のみ: 短いテキストをAPIに送り、検出言語を返す
    detectLanguage(msg.text)
      .then(lang => sendResponse({ ok: true, detectedLang: lang }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

async function fetchTranslation(text, tl, sl) {
  if (!text || !text.trim()) return { text: '', detectedLang: null };

  // Split long texts into chunks (API limit ~5000 chars)
  const chunks = splitIntoChunks(text, 4500);
  const results = [];
  let detectedLang = null;

  for (const chunk of chunks) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(chunk)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // Google returns [[["translated","original",...],...], null, detectedLang, ...]
    const translated = data[0].map(item => item[0]).filter(Boolean).join('');
    results.push(translated);
    // data[2] is the detected source language (only reliable on first chunk)
    if (!detectedLang && data[2]) detectedLang = data[2];
  }

  return { text: results.join(' '), detectedLang };
}

// テキストから言語を検出する（翻訳は不要、検出結果のみ返す）
async function detectLanguage(text) {
  if (!text || !text.trim()) return null;
  const sample = text.trim().slice(0, 200);
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(sample)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data[2] || null;
}

function splitIntoChunks(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    let end = i + maxLen;
    if (end < text.length) {
      // Try to break at sentence boundary
      const breakAt = text.lastIndexOf('. ', end);
      if (breakAt > i + maxLen / 2) end = breakAt + 1;
    }
    chunks.push(text.slice(i, end));
    i = end;
  }
  return chunks;
}
