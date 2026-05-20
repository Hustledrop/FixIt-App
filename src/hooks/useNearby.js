import { useState, useCallback, useRef } from 'react';

export const MAP_CATS = {
  garage:   { icon:'🔧', q:'node["shop"="car_repair"](B);way["shop"="car_repair"](B);node["amenity"="car_repair"](B);' },
  parts:    { icon:'🔩', q:'node["shop"="car_parts"](B);way["shop"="car_parts"](B);node["shop"="tyres"](B);' },
  tyres:    { icon:'🛞', q:'node["shop"="tyres"](B);way["shop"="tyres"](B);' },
  petrol:   { icon:'⛽', q:'node["amenity"="fuel"](B);way["amenity"="fuel"](B);' },
  hardware: { icon:'🏗️', q:'node["shop"="hardware"](B);node["shop"="doityourself"](B);way["shop"="hardware"](B);' },
  vet:      { icon:'🐾', q:'node["amenity"="veterinary"](B);way["amenity"="veterinary"](B);' },
  it:       { icon:'💻', q:'node["shop"="computer"](B);node["shop"="mobile_phone"](B);way["shop"="electronics"](B);' },
};

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

function haversine(la1, lo1, la2, lo2) {
  const R=6371, dL=(la2-la1)*Math.PI/180, dG=(lo2-lo1)*Math.PI/180;
  const a=Math.sin(dL/2)**2+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dG/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

// Race all endpoints — whichever responds first wins.
// Uses a manual Promise.race + per-request abort so it works in all browsers including Safari.
async function queryOverpassRace(query, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const controllers = ENDPOINTS.map(() => new AbortController());
    let settled = false;

    const finish = (ok, val) => {
      if (settled) return;
      settled = true;
      // Cancel remaining requests
      controllers.forEach(c => { try { c.abort(); } catch (_) {} });
      if (ok) resolve(val); else reject(val);
    };

    // Hard timeout
    const timer = setTimeout(() => finish(false, new Error('timeout')), timeoutMs);

    let failures = 0;
    ENDPOINTS.forEach((ep, i) => {
      fetch(ep, {
        method: 'POST',
        body: query,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: controllers[i].signal,
      })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => { clearTimeout(timer); finish(true, data); })
      .catch(() => {
        failures++;
        if (failures === ENDPOINTS.length) {
          clearTimeout(timer);
          finish(false, new Error('all failed'));
        }
      });
    });
  });
}

function parseResults(data, lat, lng) {
  const seen = {}, out = [];
  (data.elements || []).forEach(el => {
    if (!el.tags?.name || seen[el.tags.name]) return;
    seen[el.tags.name] = true;
    const elLa = el.lat ?? el.center?.lat;
    const elLo = el.lon ?? el.center?.lon;
    if (!elLa || !elLo) return;
    const dist = haversine(lat, lng, parseFloat(elLa), parseFloat(elLo));
    if (dist > 20) return;
    const street = el.tags['addr:street']
      ? el.tags['addr:street'] + (el.tags['addr:housenumber'] ? ' ' + el.tags['addr:housenumber'] : '')
      : null;
    out.push({
      name: el.tags.name,
      lat: parseFloat(elLa), lng: parseFloat(elLo), dist,
      addr: [street, el.tags['addr:city'], el.tags['addr:postcode']].filter(Boolean).join(', ') || '',
      phone:   el.tags.phone || el.tags['contact:phone'] || '',
      opening: el.tags.opening_hours || '',
      website: el.tags.website || el.tags['contact:website'] || '',
    });
  });
  out.sort((a, b) => a.dist - b.dist);
  return out.slice(0, 25);
}

export function useNearby() {
  const [bizs, setBizs]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const reqId = useRef(0);

  const fetchBiz = useCallback(async (cat, lat, lng) => {
    if (!lat || !lng) { setError('loc'); return; }
    const thisReq = ++reqId.current;

    // Reset all state atomically for this request
    setLoading(true);
    setError(null);
    setBizs([]);
    // Note: reqId already incremented above — stale responses are ignored

    const def   = MAP_CATS[cat] || MAP_CATS.garage;
    const d     = 0.025;
    const bbox  = `${lat - d},${lng - d * 1.2},${lat + d},${lng + d * 1.2}`;
    const query = `[out:json][timeout:8];(${def.q.replace(/B/g, bbox)});out body;>;out skel qt;`;

    try {
      const data    = await queryOverpassRace(query, 6000); // 6s max
      const results = parseResults(data, lat, lng);
      if (thisReq !== reqId.current) return;
      setBizs(results);
      setError(results.length === 0 ? 'empty' : null);
    } catch (e) {
      if (thisReq !== reqId.current) return;
      // Only set error state once loading is cleared (prevents brief overlap)
      setLoading(false);
      setError('error');
      return; // skip finally setLoading
    } finally {
      if (thisReq === reqId.current) setLoading(false);
    }
  }, []);

  return { bizs, loading, error, fetchBiz };
}
