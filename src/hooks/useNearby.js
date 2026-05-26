import { useState, useCallback, useRef } from 'react';

export const MAP_CATS = {
  garage:   { icon:'🔧' },
  parts:    { icon:'🔩' },
  tyres:    { icon:'🛞' },
  petrol:   { icon:'⛽' },
  hardware: { icon:'🏗️' },
  vet:      { icon:'🐾' },
  it:       { icon:'💻' },
};

// Module-level cache — persists across re-renders, resets on full page reload
// Key: "cat:lat2dp:lng2dp"  Value: { results, ts }
const CACHE = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function cacheKey(cat, lat, lng) {
  // Round to 2 decimal places ≈ 1km precision — same area = same cache entry
  return `${cat}:${lat.toFixed(2)}:${lng.toFixed(2)}`;
}

function getCached(cat, lat, lng) {
  const entry = CACHE.get(cacheKey(cat, lat, lng));
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { CACHE.delete(cacheKey(cat, lat, lng)); return null; }
  return entry.results;
}

function setCache(cat, lat, lng, results) {
  CACHE.set(cacheKey(cat, lat, lng), { results, ts: Date.now(), stale: false });
}

export function useNearby() {
  const [bizs, setBizs]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null); // null | 'loc' | 'empty' | 'error'
  const [stale, setStale]       = useState(false); // true = showing cached results while refreshing
  const [fallback, setFallback] = useState(false); // true = Overpass failed, Maps fallback shown
  const reqId = useRef(0);

  const fetchBiz = useCallback(async (cat, lat, lng) => {
    if (!lat || !lng) { setError('loc'); setFallback(false); return; }

    // ── Cache hit: show instantly, refresh in background ──────────────────
    const cached = getCached(cat, lat, lng);
    if (cached) {
      setBizs(cached);
      setStale(true);    // mark as stale so UI can show "Letzte Ergebnisse"
      setFallback(false);
      setError(cached.length === 0 ? 'empty' : null);
      // Revalidate in background without showing spinner
    }

    const thisReq = ++reqId.current;
    if (!cached) {
      setLoading(true);
      setStale(false);
      setFallback(false);
      setError(null);
      setBizs([]);
    }

    try {
      const url = `/api/nearby?cat=${encodeURIComponent(cat)}&lat=${lat}&lng=${lng}`;
      // 6s client-side timeout: show Maps fallback fast if Overpass is cold/slow
      // The server request continues; if it resolves later, we update silently.
      const controller = new AbortController();
      const fetchTimer = setTimeout(() => controller.abort(), 6000);
      let res;
      try {
        res = await fetch(url, { signal: controller.signal });
        clearTimeout(fetchTimer);
      } catch (abortErr) {
        clearTimeout(fetchTimer);
        // Timed out on client side — show fallback immediately
        if (thisReq !== reqId.current) return;
        setFallback(true);
        if (!cached) setError('empty'); // triggers Maps fallback card
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error(`API HTTP ${res.status}`);
      const data = await res.json();
      if (thisReq !== reqId.current) return;

      const results = data.results || [];

      if (data.fallbackUsed) {
        // Overpass failed — show cached if available, otherwise show Maps fallback card
        setFallback(true);
        if (cached && cached.length > 0) {
          setBizs(cached);  // keep showing last known results
          setStale(true);
          setError(null);
        } else {
          setBizs([]);
          setError('empty'); // triggers Maps fallback in UI
        }
      } else {
        setCache(cat, lat, lng, results);
        setBizs(results);
        setStale(false);
        setFallback(false);
        setError(results.length === 0 ? 'empty' : null);
      }

    } catch (err) {
      if (thisReq !== reqId.current) return;
      console.error('[useNearby] fetch failed:', err.message);
      setFallback(true);
      if (!cached) setError('error');
      // If we had cached data, it remains displayed — don't overwrite with error
    } finally {
      if (thisReq === reqId.current) setLoading(false);
    }
  }, []);

  return { bizs, loading, error, stale, fallback, fetchBiz };
}
