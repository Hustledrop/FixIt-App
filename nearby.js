// api/nearby.js — Vercel serverless Overpass proxy
// Fixes: float precision in bbox, safe "out center tags;" output, correct OSM tags

const https = require('https');

const OVERPASS_ENDPOINTS = [
  'overpass-api.de',
  'overpass.kumi.systems',
];

// Safe Overpass tag sets per category (verified working OSM tags)
// Using "out center tags;" — works for both nodes (direct lat/lon) and ways (center)
function buildQuery(cat, south, west, north, east) {
  const b = `${south},${west},${north},${east}`;

  const parts = {
    garage: [
      `node["shop"="car_repair"](${b})`,
      `way["shop"="car_repair"](${b})`,
      `relation["shop"="car_repair"](${b})`,
      `node["craft"="car_repair"](${b})`,
      `way["craft"="car_repair"](${b})`,
    ],
    parts: [
      `node["shop"="car_parts"](${b})`,
      `way["shop"="car_parts"](${b})`,
      `node["shop"="auto_parts"](${b})`,
      `way["shop"="auto_parts"](${b})`,
    ],
    tyres: [
      `node["shop"="tyres"](${b})`,
      `way["shop"="tyres"](${b})`,
      `node["shop"="car_repair"]["service:tyres"="yes"](${b})`,
    ],
    petrol: [
      `node["amenity"="fuel"](${b})`,
      `way["amenity"="fuel"](${b})`,
    ],
    hardware: [
      `node["shop"="hardware"](${b})`,
      `way["shop"="hardware"](${b})`,
      `node["shop"="doityourself"](${b})`,
      `way["shop"="doityourself"](${b})`,
    ],
    vet: [
      `node["amenity"="veterinary"](${b})`,
      `way["amenity"="veterinary"](${b})`,
    ],
    it: [
      `node["shop"="computer"](${b})`,
      `way["shop"="computer"](${b})`,
      `node["craft"="electronics_repair"](${b})`,
      `way["craft"="electronics_repair"](${b})`,
      `node["shop"="mobile_phone"](${b})`,
    ],
  };

  const lines = (parts[cat] || parts.garage).join(';\n  ');
  // "out center tags;" is the safe output for mixed node/way results:
  // - nodes: get lat/lon directly
  // - ways:  get center lat/lon + all tags
  // No >;out skel which caused the 400
  return `[out:json][timeout:25];\n(\n  ${lines};\n);\nout center tags;`;
}

function haversine(la1, lo1, la2, lo2) {
  const R = 6371;
  const dLa = (la2 - la1) * Math.PI / 180;
  const dLo = (lo2 - lo1) * Math.PI / 180;
  const a = Math.sin(dLa / 2) ** 2 +
    Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fetchOverpass(host, query) {
  return new Promise((resolve, reject) => {
    const encoded = 'data=' + encodeURIComponent(query);
    const body    = Buffer.from(encoded, 'utf8');
    const options = {
      hostname: host,
      path:     '/api/interpreter',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': body.length,
        'User-Agent':     'FixItApp/1.0 Vercel-Proxy',
        'Accept':         'application/json',
      },
      timeout: 22000,
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          // Log full error body so we can debug further
          console.error(`[nearby] ${host} HTTP ${res.statusCode} body: ${data.substring(0, 500)}`);
          reject(new Error(`HTTP ${res.statusCode} from ${host}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          console.error(`[nearby] ${host} invalid JSON: ${data.substring(0, 200)}`);
          reject(new Error(`Invalid JSON from ${host}`));
        }
      });
    });

    req.on('error',   err => reject(new Error(`${host} network error: ${err.message}`)));
    req.on('timeout', ()  => { req.destroy(); reject(new Error(`${host} timeout`)); });
    req.write(body);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'GET')     { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { cat, lat, lng } = req.query;
  const latN = parseFloat(lat);
  const lngN = parseFloat(lng);

  if (!cat || isNaN(latN) || isNaN(lngN)) {
    res.status(400).json({ error: 'Missing params: cat, lat, lng required' });
    return;
  }
  if (latN < -90 || latN > 90 || lngN < -180 || lngN > 180) {
    res.status(400).json({ error: 'Coordinates out of range' });
    return;
  }

  // CRITICAL: use toFixed(6) to avoid JS float garbage like 7.4254430000000005
  const south = (latN - 0.03).toFixed(6);
  const north = (latN + 0.03).toFixed(6);
  const west  = (lngN - 0.05).toFixed(6);
  const east  = (lngN + 0.05).toFixed(6);

  const query = buildQuery(cat, south, west, north, east);
  console.log(`[nearby] cat=${cat} lat=${latN} lng=${lngN}`);
  console.log(`[nearby] bbox: S=${south} W=${west} N=${north} E=${east}`);
  console.log(`[nearby] query:\n${query}`);

  let lastErr;
  let data = null;

  for (const host of OVERPASS_ENDPOINTS) {
    try {
      data = await fetchOverpass(host, query);
      console.log(`[nearby] ${host} OK — ${(data.elements||[]).length} elements`);
      break;
    } catch (err) {
      console.warn(`[nearby] ${host} failed: ${err.message}`);
      lastErr = err;
    }
  }

  if (!data) {
    console.error(`[nearby] all endpoints failed: ${lastErr?.message}`);
    // Return 200 with empty results — frontend shows Maps fallback
    res.status(200).json({ results: [], error: lastErr?.message || 'All endpoints failed' });
    return;
  }

  const elements = data.elements || [];
  const seen = {}, out = [];

  elements.forEach(el => {
    if (!el.tags?.name || seen[el.tags.name]) return;
    seen[el.tags.name] = true;

    // "out center tags" gives:
    // nodes: el.lat + el.lon
    // ways:  el.center.lat + el.center.lon
    const elLat = el.lat ?? el.center?.lat;
    const elLon = el.lon ?? el.center?.lon;
    if (!elLat || !elLon) return;

    const dist = haversine(latN, lngN, parseFloat(elLat), parseFloat(elLon));
    if (dist > 15) return;

    const street = el.tags['addr:street']
      ? el.tags['addr:street'] + (el.tags['addr:housenumber'] ? ' ' + el.tags['addr:housenumber'] : '')
      : null;

    out.push({
      name:    el.tags.name,
      lat:     parseFloat(elLat),
      lng:     parseFloat(elLon),
      dist:    Math.round(dist * 1000) / 1000,
      addr:    [street, el.tags['addr:city'], el.tags['addr:postcode']].filter(Boolean).join(', ') || '',
      phone:   el.tags.phone    || el.tags['contact:phone']   || '',
      opening: el.tags.opening_hours || '',
      website: el.tags.website  || el.tags['contact:website'] || '',
    });
  });

  out.sort((a, b) => a.dist - b.dist);
  const results = out.slice(0, 25);
  console.log(`[nearby] returning ${results.length} results to client`);
  res.status(200).json({ results });
};
