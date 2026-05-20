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

export function useNearby() {
  const [bizs, setBizs]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null); // null | 'loc' | 'empty' | 'error'
  const reqId = useRef(0);

  const fetchBiz = useCallback(async (cat, lat, lng) => {
    if (!lat || !lng) { setError('loc'); return; }

    const thisReq = ++reqId.current;
    setLoading(true);
    setError(null);
    setBizs([]);

    try {
      // Call our Vercel serverless proxy — avoids CORS, mobile browser blocks,
      // and Overpass IP allowlist issues. Server fetches Overpass on our behalf.
      const url = `/api/nearby?cat=${encodeURIComponent(cat)}&lat=${lat}&lng=${lng}`;
      const res = await fetch(url);

      if (!res.ok) throw new Error(`API HTTP ${res.status}`);
      const data = await res.json();

      if (thisReq !== reqId.current) return; // stale response guard

      const results = data.results || [];
      setBizs(results);
      setError(results.length === 0 ? 'empty' : null);

    } catch (err) {
      if (thisReq !== reqId.current) return;
      console.error('[useNearby] fetch failed:', err.message);
      setError('error');
    } finally {
      if (thisReq === reqId.current) setLoading(false);
    }
  }, []);

  return { bizs, loading, error, fetchBiz };
}
