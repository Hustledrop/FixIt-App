import { useState, useCallback } from 'react';
import { LANGS } from '../data/lang.js';

const API_URL = '/api/diagnose';

async function callAPI(payload) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  let data;
  try { data = await res.json(); }
  catch (_) {
    throw { code: 'function_not_found', status: res.status,
      debug: `HTTP ${res.status} — non-JSON response. Route not found or not deployed.` };
  }

  if (!res.ok) {
    throw { code: data.error || 'server_error', status: res.status,
      debug: data.debug || data.message || `HTTP ${res.status}` };
  }
  return data;
}

export function useAI() {
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const diagnose = useCallback(async ({ problem, photoB64, photoMime, category, lang, countryName }) => {
    setLoading(true);
    setError(null);
    // Do NOT reset result — keeps previous result visible during retry

    const langEntry  = LANGS[lang] || LANGS.en;
    const langName   = langEntry.n || 'English';
    // Explicit script direction for Cyrillic/Latin disambiguation
    const langFull =
      lang === 'mk' ? `Macedonian (Македонски — respond using Cyrillic script)` :
      lang === 'sr' ? `Serbian (Srpski — respond using Latin script)` :
      lang === 'hr' ? `Croatian (Hrvatski — respond using Latin script)` :
      lang === 'bg' ? `Bulgarian (Български — respond using Cyrillic script)` :
      lang === 'ru' ? `Russian (Русский — respond using Cyrillic script)` :
      lang === 'uk' ? `Ukrainian (Українська — respond using Cyrillic script)` :
      langName;

    const payload = {
      problem:      (problem || '').trim(),
      photoB64:     photoB64 || null,
      photoMime:    photoMime || null,
      category:     category || 'home',
      lang:         lang || 'en',
      langName:     langFull,
      countryName:  countryName || 'Unknown',
    };

    const _t0 = Date.now();
    console.log('[FixIt] → POST /api/diagnose', {
      category:      payload.category,
      hasText:       !!payload.problem,
      hasImage:      !!payload.photoB64,
      problemLength: payload.problem.length,
      lang:          payload.lang,
      langFull:      payload.langName,
    });

    // Retry with exponential backoff: 1.5s → 3s
    const DELAYS = [2000]; // one retry after 2s for cold-start recovery
    let lastErr = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const data = await callAPI(payload);
        console.log(`[FixIt] ✓ Success (attempt ${attempt}) in ${Date.now()-_t0}ms, confidence:`, data.confidence, 'category:', payload.category);
        setResult(data);
        setLoading(false);
        return data;
      } catch (err) {
        lastErr = err;
        const code  = err.code  || 'unknown';
        const debug = err.debug || err.message || String(err);
        console.warn(`[FixIt] ✗ Attempt ${attempt} failed — category: ${payload.category}, code: ${code}, debug: ${debug}`);

        // Don't retry permanent errors (key issues, bad request)
        // Abort/timeout = deliberate, don't retry. Cold-start (function_not_found) = do retry.
        const isPermanent = ['missing_api_key', 'invalid_api_key', 'invalid_api_key_format',
                             'invalid_json', 'empty_body', 'no_input', 'method_not_allowed',
                             'timeout', 'timeout_26s'].includes(code);
        if (isPermanent) {
          console.error('[FixIt] Permanent error — not retrying:', code);
          break;
        }

        if (attempt < 2) {
          const delay = DELAYS[Math.min(attempt - 1, DELAYS.length - 1)];
          console.log(`[FixIt] Waiting ${delay}ms before retry ${attempt + 1}…`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    // All attempts failed
    const code  = lastErr?.code  || 'network';
    const debug = lastErr?.debug || lastErr?.message || 'Unknown error';
    console.error('[FixIt] All attempts failed — category:', payload.category, '| code:', code, '| debug:', debug);
    setError({ code, debug });
    setLoading(false);
    return null;
  }, []);

  const reset = useCallback(() => {
    setResult(null); setError(null); setLoading(false);
  }, []);

  return { result, loading, error, diagnose, reset };
}
