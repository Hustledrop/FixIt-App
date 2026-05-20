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

function haversine(la1, lo1, la2, lo2) {
  const R=6371, dL=(la2-la1)*Math.PI/180, dG=(lo2-lo1)*Math.PI/180;
  const a=Math.sin(dL/2)**2+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dG/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

export function useNearby() {
  const [bizs, setBizs]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const reqId = useRef(0);

  const fetchBiz = useCallback(async (cat, lat, lng) => {
    if (!lat || !lng) { setError('loc'); return; }

    const thisReq = ++reqId.current;
    setLoading(true);
    setError(null);
    setBizs([]);

    const def  = MAP_CATS[cat] || MAP_CATS.garage;
    // Old working bbox — larger area, more results
    const bbox = `${lat - 0.03},${lng - 0.05},${lat + 0.03},${lng + 0.05}`;
    // Old working approach: single endpoint, timeout:25 in the query itself
    const query = `[out:json][timeout:25];(${def.q.replace(/B/g, bbox)});out body;>;out skel qt;`;

    try {
      // Single endpoint — same as the version that worked reliably on 17.05
      const res  = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body:   query,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (thisReq !== reqId.current) return; // stale response guard

      const seen = {}, out = [];
      (data.elements || []).forEach(el => {
        if (!el.tags?.name || seen[el.tags.name]) return;
        seen[el.tags.name] = true;
        const elLa = el.lat ?? el.center?.lat;
        const elLo = el.lon ?? el.center?.lon;
        if (!elLa || !elLo) return;
        const dist = haversine(lat, lng, parseFloat(elLa), parseFloat(elLo));
        if (dist > 15) return;
        const street = el.tags['addr:street']
          ? el.tags['addr:street'] + (el.tags['addr:housenumber'] ? ' ' + el.tags['addr:housenumber'] : '')
          : null;
        out.push({
          name:    el.tags.name,
          lat:     parseFloat(elLa),
          lng:     parseFloat(elLo),
          dist,
          addr:    [street, el.tags['addr:city'], el.tags['addr:postcode']].filter(Boolean).join(', ') || '',
          phone:   el.tags.phone || el.tags['contact:phone'] || '',
          opening: el.tags.opening_hours || '',
          website: el.tags.website || el.tags['contact:website'] || '',
        });
      });
      out.sort((a, b) => a.dist - b.dist);

      if (thisReq !== reqId.current) return;
      setBizs(out.slice(0, 25));
      setError(out.length === 0 ? 'empty' : null);
    } catch (_) {
      if (thisReq !== reqId.current) return;
      setError('error');
    } finally {
      if (thisReq === reqId.current) setLoading(false);
    }
  }, []);

  return { bizs, loading, error, fetchBiz };
}
