// api/nearby.js — Vercel serverless proxy for Overpass API
// Runs server-side: no CORS issues, no mobile browser blocks, no IP allowlist problems.

const https = require('https');

const OVERPASS_ENDPOINTS = [
  'overpass-api.de',
  'overpass.kumi.systems',
];

// Build the Overpass QL query for a given category and bounding box
const CATEGORY_QUERIES = {
  garage:   'node["shop"="car_repair"](B);way["shop"="car_repair"](B);node["amenity"="car_repair"](B);',
  parts:    'node["shop"="car_parts"](B);node["shop"="tyres"](B);way["shop"="car_parts"](B);',
  tyres:    'node["shop"="tyres"](B);way["shop"="tyres"](B);',
  petrol:   'node["amenity"="fuel"](B);way["amenity"="fuel"](B);',
  hardware: 'node["shop"="hardware"](B);node["shop"="doityourself"](B);way["shop"="hardware"](B);',
  vet:      'node["amenity"="veterinary"](B);way["amenity"="veterinary"](B);',
  it:       'node["shop"="computer"](B);node["shop"="mobile_phone"](B);way["shop"="electronics"](B);',
};

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
    const body = Buffer.from(query, 'utf8');
    const options = {
      hostname: host,
      path:     '/api/interpreter',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': body.length,
        'User-Agent':     'FixItApp/1.0 (https://github.com/fixit)',
        'Accept':         'application/json',
      },
      timeout: 20000,
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} from ${host}: ${data.substring(0, 200)}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Invalid JSON from ${host}: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout from ${host}`)); });
    req.write(`data=${encodeURIComponent(query)}`);
    req.end();
  });
}

async function queryWithFallback(query) {
  let lastErr;
  for (const host of OVERPASS_ENDPOINTS) {
    try {
      const data = await fetchOverpass(host, query);
      return data;
    } catch (err) {
      console.warn(`[nearby] ${host} failed: ${err.message}`);
      lastErr = err;
    }
  }
  throw lastErr;
}

module.exports = async function handler(req, res) {
  // CORS — allow the Vercel domain and any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { cat, lat, lng } = req.query;

  // Validate params
  const latN = parseFloat(lat);
  const lngN = parseFloat(lng);
  if (!cat || isNaN(latN) || isNaN(lngN)) {
    res.status(400).json({ error: 'Missing or invalid params: cat, lat, lng required' });
    return;
  }
  if (!CATEGORY_QUERIES[cat]) {
    res.status(400).json({ error: `Unknown category: ${cat}` });
    return;
  }
  if (latN < -90 || latN > 90 || lngN < -180 || lngN > 180) {
    res.status(400).json({ error: 'Coordinates out of range' });
    return;
  }

  const bbox  = `${latN - 0.03},${lngN - 0.05},${latN + 0.03},${lngN + 0.05}`;
  const qBody = CATEGORY_QUERIES[cat].replace(/B/g, bbox);
  const query = `[out:json][timeout:20];(${qBody});out body;>;out skel qt;`;

  console.log(`[nearby] cat=${cat} lat=${latN} lng=${lngN} bbox=${bbox}`);

  try {
    const data = await queryWithFallback(query);
    const elements = data.elements || [];

    const seen = {}, out = [];
    elements.forEach(el => {
      if (!el.tags?.name || seen[el.tags.name]) return;
      seen[el.tags.name] = true;

      const elLa = el.lat ?? el.center?.lat;
      const elLo = el.lon ?? el.center?.lon;
      if (!elLa || !elLo) return;

      const dist = haversine(latN, lngN, parseFloat(elLa), parseFloat(elLo));
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
        phone:   el.tags.phone    || el.tags['contact:phone']   || '',
        opening: el.tags.opening_hours || '',
        website: el.tags.website  || el.tags['contact:website'] || '',
      });
    });

    out.sort((a, b) => a.dist - b.dist);
    const results = out.slice(0, 25);

    console.log(`[nearby] returning ${results.length} results`);
    res.status(200).json({ results });

  } catch (err) {
    console.error(`[nearby] all endpoints failed: ${err.message}`);
    res.status(200).json({ results: [], error: err.message });
    // Return 200 with empty results so frontend shows fallback gracefully
  }
};
