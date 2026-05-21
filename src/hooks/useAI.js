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

  const diagnose = useCallback(async ({ problem, photoB64, photoMime, category, lang, countryName, userProfile }) => {
    setLoading(true);
    setError(null);
    setResult(null); // clear stale result so no old language leaks

    const langEntry  = LANGS[lang] || LANGS.en;
    const langName   = langEntry.n || 'English';
    // Every language gets an explicit "respond ENTIRELY in X" instruction
    // This prevents the AI from defaulting to German or English
    const langFull =
      lang === 'mk' ? `Macedonian (Македонски) — respond ENTIRELY in Macedonian, use Cyrillic script` :
      lang === 'sr' ? `Serbian (Srpski) — respond ENTIRELY in Serbian, use Latin script` :
      lang === 'hr' ? `Croatian (Hrvatski) — respond ENTIRELY in Croatian, use Latin script` :
      lang === 'bg' ? `Bulgarian (Български) — respond ENTIRELY in Bulgarian, use Cyrillic script` :
      lang === 'ru' ? `Russian (Русский) — respond ENTIRELY in Russian, use Cyrillic script` :
      lang === 'uk' ? `Ukrainian (Українська) — respond ENTIRELY in Ukrainian, use Cyrillic script` :
      lang === 'tr' ? `Turkish (Türkçe) — respond ENTIRELY in Turkish, do NOT use German or English` :
      lang === 'de' ? `German (Deutsch) — respond ENTIRELY in German` :
      lang === 'fr' ? `French (Français) — respond ENTIRELY in French` :
      lang === 'es' ? `Spanish (Español) — respond ENTIRELY in Spanish` :
      lang === 'it' ? `Italian (Italiano) — respond ENTIRELY in Italian` :
      lang === 'pl' ? `Polish (Polski) — respond ENTIRELY in Polish` :
      lang === 'en' ? `English — respond ENTIRELY in English` :
      `${langName} — respond ENTIRELY in ${langName}, do NOT use German or English`;

    const payload = {
      problem:      (problem || '').trim(),
      photoB64:     photoB64 || null,
      photoMime:    photoMime || null,
      category:     category || 'home',
      lang:         lang || 'en',
      langName:     langFull,
      countryName:  countryName || 'Unknown',
      userProfile:  userProfile || null,
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
    const DELAYS = [1500, 3000]; // two retries with backoff
    let lastErr = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
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

        if (attempt < 3) {
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
