// api/nearby.js — Vercel serverless Overpass proxy
// Tyres: broadened query with name-based filtering + larger search radius

const https = require('https');

const OVERPASS_ENDPOINTS = [
  'overpass-api.de',
  'overpass.kumi.systems',
];

// Standard bbox for all categories (≈7km × 7km at 50°N)
const BBOX_NS = 0.03;
const BBOX_EW = 0.05;

// Tyres uses a larger bbox (≈10km radius) because tyre shops are sparse
const TYRES_BBOX_NS = 0.09;
const TYRES_BBOX_EW = 0.12;

// Name filter regex for Overpass — catches tyre shops tagged as generic car_repair
// This is an Overpass regex, not JS regex — uses ERE syntax
const TYRE_NAME_REGEX = 'Reifen|Tyre|Tire|Vulkan|Felgen|Rader|Wheels|Wheel';

function buildQuery(cat, latN, lngN) {
  // Tyres gets a larger search area
  const ns = cat === 'tyres' ? TYRES_BBOX_NS : BBOX_NS;
  const ew = cat === 'tyres' ? TYRES_BBOX_EW : BBOX_EW;

  const south = (latN - ns).toFixed(6);
  const north = (latN + ns).toFixed(6);
  const west  = (lngN - ew).toFixed(6);
  const east  = (lngN + ew).toFixed(6);
  const b     = `${south},${west},${north},${east}`;

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

    // ── TYRES — two-pass strategy ─────────────────────────────────────────────
    // Pass A: exact tyre-specific tags → keep ALL results, no name filter needed
    // Pass B: broad categories (car_repair, auto_parts) → Overpass filters by name
    //         Only keeps shops whose name/brand/operator contains tyre keywords
    // This avoids returning every generic mechanic while catching tyre specialists
    // that happen to be tagged as car_repair.
    tyres: [
      // Pass A: exact tyre tags — keep everything
      `node["shop"="tyres"](${b})`,
      `way["shop"="tyres"](${b})`,
      `relation["shop"="tyres"](${b})`,
      `node["shop"="vulcanizer"](${b})`,
      `way["shop"="vulcanizer"](${b})`,
      `node["craft"="tyre_fitting"](${b})`,
      `way["craft"="tyre_fitting"](${b})`,
      // Pass A: explicit service tags
      `node["service:vehicle:tyres"="yes"](${b})`,
      `way["service:vehicle:tyres"="yes"](${b})`,
      `node["service:vehicle:tires"="yes"](${b})`,
      `way["service:vehicle:tires"="yes"](${b})`,
      `node["service:vehicle:wheels"="yes"](${b})`,
      `way["service:vehicle:wheels"="yes"](${b})`,
      `node["service:tyres"="yes"](${b})`,
      `way["service:tyres"="yes"](${b})`,
      // Pass B: car_repair with tyre-related name (Overpass regex filter)
      // Catches shops like "Reifenservice Müller" tagged as shop=car_repair
      `node["shop"="car_repair"]["name"~"${TYRE_NAME_REGEX}",i](${b})`,
      `way["shop"="car_repair"]["name"~"${TYRE_NAME_REGEX}",i](${b})`,
      // Pass B: auto_parts with tyre name
      `node["shop"="auto_parts"]["name"~"${TYRE_NAME_REGEX}",i](${b})`,
      `way["shop"="auto_parts"]["name"~"${TYRE_NAME_REGEX}",i](${b})`,
      // Pass B: amenity=car_repair (older tagging scheme) with tyre name
      `node["amenity"="car_repair"]["name"~"${TYRE_NAME_REGEX}",i](${b})`,
      `way["amenity"="car_repair"]["name"~"${TYRE_NAME_REGEX}",i](${b})`,
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
  return { query: `[out:json][timeout:25];\n(\n  ${lines};\n);\nout center tags;`, south, west, north, east };
}

// Server-side tyre keyword filter for results that came from broad (Pass B) queries
// Only needed as a safety net — Overpass name~ filter should already handle it
const TYRE_KEYWORDS = /reifen|tyre|tire|vulkan|felgen|räder|rader|wheel/i;

function isTyreRelevant(el) {
  const tags = el.tags || {};
  const shop = tags.shop || '';
  const craft = tags.craft || '';
  // Exact tyre tags → always relevant (Pass A results)
  if (['tyres', 'vulcanizer'].includes(shop)) return true;
  if (craft === 'tyre_fitting') return true;
  if (tags['service:vehicle:tyres'] === 'yes') return true;
  if (tags['service:vehicle:tires'] === 'yes') return true;
  if (tags['service:vehicle:wheels'] === 'yes') return true;
  if (tags['service:tyres'] === 'yes') return true;
  // Broad tags — only relevant if name/brand/operator mentions tyres
  const searchFields = [
    tags.name, tags.brand, tags.operator, tags.description,
  ].filter(Boolean).join(' ');
  return TYRE_KEYWORDS.test(searchFields);
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
      timeout: 9000,  // 9s per host × 2 hosts = 18s max, safely under Vercel 25s limit
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
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

  const { query, south, west, north, east } = buildQuery(cat, latN, lngN);
  const radiusKm = cat === 'tyres' ? `${(TYRES_BBOX_NS * 111).toFixed(0)}km` : `${(BBOX_NS * 111).toFixed(0)}km`;

  console.log(`[nearby] cat=${cat} lat=${latN.toFixed(4)} lng=${lngN.toFixed(4)} radius=${radiusKm}`);
  console.log(`[nearby] bbox: S=${south} W=${west} N=${north} E=${east}`);

  let lastErr;
  let data = null;

  for (const host of OVERPASS_ENDPOINTS) {
    try {
      data = await fetchOverpass(host, query);
      console.log(`[nearby] ${host} OK — ${(data.elements||[]).length} raw elements`);
      break;
    } catch (err) {
      console.warn(`[nearby] ${host} failed: ${err.message}`);
      lastErr = err;
    }
  }

  if (!data) {
    console.error(`[nearby] all endpoints failed: ${lastErr?.message}`);
    if (cat === 'tyres') {
      console.warn('[nearby] TYRES_FALLBACK reason=endpoint_failure');
    }
    res.status(200).json({ results: [], error: lastErr?.message || 'All endpoints failed', cat });
    return;
  }

  const elements   = data.elements || [];
  const rawCount   = elements.length;
  const seen       = {};
  const out        = [];
  let   filteredOut = 0;

  // Max distance: tyres uses larger radius, so cap at 12km; others at 15km
  const maxDist = cat === 'tyres' ? 12 : 15;

  elements.forEach(el => {
    if (!el.tags?.name) return;

    // Server-side tyre relevance filter (belt-and-suspenders after Overpass name~ filter)
    if (cat === 'tyres' && !isTyreRelevant(el)) {
      filteredOut++;
      return;
    }

    if (seen[el.tags.name]) return;
    seen[el.tags.name] = true;

    const elLat = el.lat ?? el.center?.lat;
    const elLon = el.lon ?? el.center?.lon;
    if (!elLat || !elLon) return;

    const dist = haversine(latN, lngN, parseFloat(elLat), parseFloat(elLon));
    if (dist > maxDist) return;

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

  // Tyre-specific debug log
  if (cat === 'tyres') {
    const fallbackUsed = results.length === 0;
    console.log(
      `[nearby] TYRES_DEBUG radius=${radiusKm} rawElements=${rawCount} ` +
      `filteredOut=${filteredOut} finalResults=${results.length} fallbackUsed=${fallbackUsed}`
    );
    if (fallbackUsed) {
      console.warn('[nearby] TYRES_ZERO_RESULTS — frontend will show Google Maps fallback');
    }
  }

  console.log(`[nearby] returning ${results.length} results to client`);
  res.status(200).json({ results, cat });
};
