// api/diagnose.js — v6 — 55s timeout, AbortError retry, improved logs
// DEPLOY_VERSION logged synchronously before ANY async code

const DEPLOY_VERSION = 'diagnose-v10-compact-1200';

// ── In-memory rate limit (MVP) ────────────────────────────────────────────────
const RL = new Map();
const RL_MAX  = 3;     // 3 backend calls per IP per 24h (abuse protection only)
const RL_WIN  = 86400; // Frontend localStorage handles the normal 1-free-per-device limit

function checkRateLimit(ip) {
  const now   = Math.floor(Date.now() / 1000);
  const entry = RL.get(ip) || { count: 0, reset: now + RL_WIN };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + RL_WIN; }
  entry.count++;
  RL.set(ip, entry);
  return { ok: entry.count <= RL_MAX, remaining: Math.max(0, RL_MAX - entry.count) };
}

// ── MIME detection (module top level — NOT inside any block) ──────────────────
function detectMime(b64) {
  if (!b64) return null;
  if (b64.startsWith('/9j/'))   return 'image/jpeg';
  if (b64.startsWith('iVBOR'))  return 'image/png';
  if (b64.startsWith('UklGR'))  return 'image/webp';
  if (b64.startsWith('R0lGO'))  return 'image/gif';
  return null;
}
function getGlobalDisclaimer(lang) {
  const l = (lang || '').toLowerCase();

  if (l.includes('german') || l.includes('deutsch')) {
    return 'FixIt bietet nur allgemeine Hinweise. Bei Gas-, Elektro- und tragenden Arbeiten immer einen Fachbetrieb kontaktieren.';
  }

  return 'FixIt provides guidance only. For gas, electrical, and structural work, always use a licensed professional.';
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data',  chunk => { d += chunk.toString('utf8'); });
    req.on('end',   () => resolve(d));
    req.on('error', reject);
  });
}

// ── Vehicle context extraction (regex-first, zero cost) ──────────────────────
// Parses common vehicle references from free-text problem descriptions.
// Returns null if no vehicle detected — AI will then use generic parts.
function extractVehicleFromText(text) {
  if (!text) return null;
  const t = text.toUpperCase();

  // Make/brand patterns — covers major European, US, Korean, Japanese markets
  const MAKES = {
    VW:         ['VW','VOLKSWAGEN','VOLKS WAGEN'],
    BMW:        ['BMW'],
    MERCEDES:   ['MERCEDES','MERCEDES-BENZ','MERCEDES BENZ','MERC','MB'],
    AUDI:       ['AUDI'],
    FORD:       ['FORD'],
    OPEL:       ['OPEL','VAUXHALL'],
    RENAULT:    ['RENAULT','DACIA'],
    PEUGEOT:    ['PEUGEOT'],
    CITROEN:    ['CITROËN','CITROEN'],
    FIAT:       ['FIAT'],
    TOYOTA:     ['TOYOTA'],
    HONDA:      ['HONDA'],
    SKODA:      ['SKODA','ŠKODA'],
    SEAT:       ['SEAT'],
    HYUNDAI:    ['HYUNDAI'],
    KIA:        ['KIA'],
    MAZDA:      ['MAZDA'],
    NISSAN:     ['NISSAN'],
    VOLVO:      ['VOLVO'],
    SUBARU:     ['SUBARU'],
    SUZUKI:     ['SUZUKI'],
    MITSUBISHI: ['MITSUBISHI'],
  };

  let make = null;
  for (const [key, aliases] of Object.entries(MAKES)) {
    if (aliases.some(a => t.includes(a))) { make = key; break; }
  }
  if (!make) return null; // no vehicle detected

  // Model extraction — common models per make
  const MODEL_PATTERNS = {
    VW:       [/GOLF\s*([1-9]|I{1,3}V?|PLUS|GTI|R|VARIANT|ALLTRACK)?/,/PASSAT\s*(B[3-9]|CC)?/,/POLO\s*([1-9])?/,/TIGUAN\s*([12])?/,/TOUAREG/,/T-ROC/,/CADDY/,/TRANSPORTER\s*(T[4-7])?/,/SHARAN/,/PHAETON/,/ARTEON/,/ID\.?[3-9]/],
    BMW:      [/([1-9])ER\s*(?:SERIE)?/,/X([1-9])/,/([1-9][0-9]{2}[IDMS]?)\s*(?:E|F|G|I)\d{1,2}/,/M([2-9])/,/([3-9]20|[1-9][0-9]{2})[IDS]/],
    MERCEDES: [/\b([ABCEGLS])-?(?:KLASSE|CLASS)?\s*(?:W\d{3})?/,/\b([ABCEGLS])[0-9]{3}/,/GLC|GLE|GLA|GLB|CLA|CLK|SLK|AMG/,/SPRINTER/,/VITO/],
    AUDI:     [/A([1-9])/,/Q([1-9])/,/TT/,/R8/,/E-TRON/,/RS\s*[1-9]/,/S[1-9]/,/([A-Z][1-9])\s*(?:B[4-9]|C[5-9])?/],
    FORD:     [/FIESTA/,/FOCUS/,/MONDEO/,/PUMA/,/KUGA/,/MUSTANG/,/TRANSIT/,/RANGER/,/GALAXY/,/S-MAX/,/C-MAX/],
    OPEL:     [/ASTRA\s*([A-J])?/,/CORSA\s*([A-F])?/,/INSIGNIA\s*([AB])?/,/MOKKA/,/ZAFIRA/,/VECTRA/,/MERIVA/],
    TOYOTA:   [/COROLLA/,/YARIS/,/AURIS/,/RAV4/,/PRIUS/,/AYGO/,/C-HR/,/HILUX/,/LAND CRUISER/,/CAMRY/],
    HONDA:    [/CIVIC/,/JAZZ/,/CR-V/,/HR-V/,/ACCORD/],
    SKODA:    [/OCTAVIA\s*([123])?/,/FABIA/,/SUPERB/,/KAROQ/,/KODIAQ/,/SCALA/],
    SEAT:     [/IBIZA/,/LEON/,/ARONA/,/ATECA/,/TARRACO/,/TOLEDO/],
    RENAULT:  [/CLIO/,/MEGANE/,/LAGUNA/,/SCENIC/,/CAPTUR/,/KADJAR/,/KOLEOS/,/ZOE/,/KANGOO/],
    PEUGEOT:  [/[0-9]{3}[0-9]?/,/PARTNER/,/EXPERT/,/BOXER/],
    CITROEN:  [/C[1-9]/,/BERLINGO/,/JUMPY/,/DS[1-9]/],
    HYUNDAI:  [/I[1-9]0/,/TUCSON/,/SANTA FE/,/IONIQ/,/KONA/,/I20|I30|I40/],
    KIA:      [/RIO/,/CEE'?D/,/SPORTAGE/,/SORENTO/,/STINGER/,/PICANTO/,/NIRO/],
  };

  let model = null;
  if (MODEL_PATTERNS[make]) {
    for (const pat of MODEL_PATTERNS[make]) {
      const m = t.match(pat);
      if (m) { model = m[0].trim().replace(/\s+/g,' '); break; }
    }
  }

  // Generation/chassis codes (e.g. F30, B8, Mk7)
  const genMatch = text.match(/(Mk\.?\s*[1-9]|[ABCDEFG][0-9]{1,2}|[EFG]\d{2}|B[5-9]|W\d{3})/i);
  const generation = genMatch ? genMatch[1].toUpperCase() : null;

  // Engine (e.g. 2.0 TDI, 1.6 HDi, 320d, dCi 130)
  const engMatch = text.match(/\b(\d\.\d\s*(?:TDI|TSI|TFSI|GTI|CDI|HDi|dCi|TDCi|CDTI|CRDi|EcoBoost|BlueHDi|Turbo)|[0-9]{2,3}\s*(?:TDI|TSI|TFSI|CDI|HDi|dCi|d)|[1-9][0-9]{2}d)\b/i);
  const engine = engMatch ? engMatch[1].replace(/\s+/g,' ').trim().toUpperCase() : null;

  // Year (4-digit year 1970–2030)
  const yearMatch = text.match(/(19[7-9]\d|20[0-2]\d)/);
  const year = yearMatch ? yearMatch[1] : null;

  if (!model && !engine && !generation) return null; // make detected but too vague

  return { make, model, generation, engine, year };
}

// ── Intelligent vehicle-aware part suggestion engine ─────────────────────────
// Given a detected vehicle and the diagnosed part type, returns 3-4 specific
// purchasable search queries that are far more useful than generic part names.
// This runs BEFORE the AI's partsNeeded — if it returns results, they replace
// the AI's generic suggestions for automotive category repairs.

function detectPartType(probText) {
  const t = (probText || '').toLowerCase();
  if (/batter|batterie|akku|accumul|12v|springt nicht an|démarre pas|no arranca|doesn.?t start|won.?t start|dead battery|batteria/.test(t)) return 'battery';
  if (/bremse|brake|brems|frein|freio|freno|schleif|grind|squeal|quietsch|pad|scheib|disc|rotor/.test(t)) return 'brakes';
  if (/zündkerz|spark plug|bougie|bujía|candela|misfire|zündu|fehlzündung/.test(t)) return 'sparkplugs';
  if (/ölfilter|oil filter|filtre huile|filtro aceite|filtro olio|ölwechsel|oil change/.test(t)) return 'oilfilter';
  if (/scheibenwischer|wiper|essuie-glace|limpiaparabrisas|tergicristallo|wisch/.test(t)) return 'wipers';
  if (/kupplung|clutch|embrayage|embrague|frizione|slip|durchdreh|rutscht/.test(t)) return 'clutch';
  if (/luftfilter|air filter|filtre air|filtro aire|filtro aria/.test(t)) return 'airfilter';
  if (/glühkerz|glow plug|bougie prechauffage|calentador|candeletta/.test(t)) return 'glowplugs';
  if (/stoßdämpfer|shock absorber|amortisseur|amortiguador|ammortizzatore|feather|feder/.test(t)) return 'shocks';
  if (/riemen|belt|courroie|correa|cinghia|timing|zahnriemen/.test(t)) return 'belt';
  return null; // unknown — let AI handle it
}

function isDiesel(engine) {
  if (!engine) return null; // unknown
  return /TDI|CDI|HDi|dCi|TDCi|CDTI|CRDi|BlueHDi|CDTI|diesel|dsel|\bd\b/i.test(engine);
}

function isLargeSUVorExecutive(make, model) {
  if (!model) return false;
  const m = model.toUpperCase();
  // SUVs, estates, vans, executive sedans — tend to need larger batteries
  return /X[3-7]|GLC|GLE|GLS|Q[5-8]|A[6-8]|TOUAREG|TIGUAN|PHAETON|PASSAT|MONDEO|INSIGNIA|SUPERB|OCTAVIA.*[23]|KODIAQ|KAROQ|TUCSON|SANTA|KUGA|GALAXY|S-MAX|TRANSIT|TRANSPORTER|T[5-7]|SPRINTER|VITO|RAV4|LAND CRUISER|DISCOVERY|RANGE ROVER/.test(m);
}

function isCompact(make, model) {
  if (!model) return false;
  const m = model.toUpperCase();
  return /POLO|FIESTA|CORSA|CLIO|YARIS|AYGO|MICRA|PICANTO|RIO|FABIA|IBIZA|UP|TWINGO|C1|107|108|208/.test(m);
}

function isMidSize(make, model) {
  if (!model) return false;
  const m = model.toUpperCase();
  // C/D-segment hatchbacks and sedans — Golf, Focus, Astra, etc.
  return /GOLF|FOCUS|ASTRA|MEGANE|LEON|OCTAVIA|C-CLASS|A4|A3|3ER|3[0-9]{2}[DI]|C[12][0-9]{2}|CIVIC|COROLLA|AURIS/.test(m);
}

function hasStartStop(engine, year) {
  // Most vehicles from 2012+ have start-stop → need AGM/EFB
  const y = parseInt(year || '0');
  if (y >= 2012) return true;
  // TDI, TSI, CDI from 2010+ very likely have start-stop
  if (y >= 2010 && /TDI|TSI|CDI|HDi/i.test(engine || '')) return true;
  // Modern engine codes with NO year: TDI/TSI/CDI/BlueHDi all imply start-stop era
  // (these designations weren't used on pre-start-stop vehicles)
  if (!year && /TDI|TSI|TFSI|CDI|HDi|dCi|BlueHDi|EcoBoost/i.test(engine || '')) return true;
  return false; // older or unknown — default to standard battery
}

function vehicleBatteryAh(make, model, engine, year) {
  const large  = isLargeSUVorExecutive(make, model);
  const small  = isCompact(make, model);
  const mid    = isMidSize(make, model);
  const diesel = isDiesel(engine);
  // Large SUVs and executive cars
  if (large && diesel)  return '95Ah';
  if (large)            return '80Ah';
  // Small compacts (Polo, Fiesta, etc.)
  if (small && !diesel) return '60Ah';
  if (small)            return '70Ah';
  // Mid-size (Golf, Focus, A4, etc.)
  if (mid && diesel)    return '70Ah';
  if (mid)              return '60Ah';
  // Unknown / default
  return diesel ? '80Ah' : '70Ah';
}

function vehiclePartSuggestions(vehicleCtx, partType, rawProbText) {
  if (!vehicleCtx || !partType) return null;

  const { make, model, generation, engine, year } = vehicleCtx;
  const M = (model || '').toUpperCase();
  const G = (generation || '').toUpperCase();
  // Short vehicle label for query prefix (keep under 12 chars for good search results)
  const vShort = [model || make, G || ''].filter(Boolean).join(' ').trim().slice(0, 20);
  const vFull  = [make, model, G].filter(Boolean).join(' ').trim();

  // ── BATTERY ────────────────────────────────────────────────────────────────
  if (partType === 'battery') {
    // Diesel/AGM check: use engine field OR fallback to raw problem text keywords
    const rawUpper   = (rawProbText || '').toUpperCase();
    const dieselInText = /CDI|TDI|HDi|DIESEL|DIESELMOTOR/i.test(rawUpper);
    const ah      = vehicleBatteryAh(make, model, engine || (dieselInText ? 'CDI' : null), year);
    const ss      = hasStartStop(engine || (dieselInText ? 'CDI' : null), year);
    const diesel  = isDiesel(engine) || dieselInText || null;
    const batType = ss ? 'AGM' : 'EFB';
    const altType = ss ? 'EFB' : 'Standard';

    if (ss) {
      return [
        `${vShort} AGM Batterie ${ah}`,
        `Varta AGM ${ah} ${vShort}`,
        `Bosch AGM Start Stop ${ah} ${make}`,
        `Exide AGM ${ah} ${vShort}`,
      ];
    } else {
      return [
        `${vShort} Batterie ${ah}`,
        `Varta Silver Dynamic ${ah} ${make}`,
        `Bosch S4 ${ah} ${make}`,
        `Banner Running Bull ${ah} ${vShort}`,
      ];
    }
  }

  // ── BRAKES ─────────────────────────────────────────────────────────────────
  if (partType === 'brakes') {
    const gen = G || model || make;
    return [
      `${vShort} Bremsbeläge vorne`,
      `Brembo ${vShort} Bremsscheiben vorne`,
      `TRW ${vShort} Bremsbeläge`,
      `${vShort} Bremsscheibe ${gen}`,
    ];
  }

  // ── SPARK PLUGS ────────────────────────────────────────────────────────────
  if (partType === 'sparkplugs') {
    const diesel = isDiesel(engine);
    if (diesel) {
      // Diesel → glow plugs, not spark plugs
      return [
        `${vShort} Glühkerzen`,
        `Bosch Glühkerze ${vShort}`,
        `NGK Glühkerze ${vShort}`,
        `Beru Glühkerze ${make} ${model || ''}`,
      ];
    }
    return [
      `${vShort} Zündkerzen`,
      `NGK Zündkerze ${vShort}`,
      `Bosch Zündkerze ${vShort}`,
      `Champion Zündkerze ${vShort}`,
    ];
  }

  // ── OIL FILTER ─────────────────────────────────────────────────────────────
  if (partType === 'oilfilter') {
    return [
      `${vShort} Ölfilter`,
      `Mann Filter ${vShort}`,
      `Bosch Ölfilter ${vShort}`,
      `Mahle Ölfilter ${make} ${model || ''}`,
    ];
  }

  // ── WIPERS ─────────────────────────────────────────────────────────────────
  if (partType === 'wipers') {
    return [
      `${vShort} Scheibenwischer`,
      `Bosch Aerotwin ${vShort}`,
      `Valeo Wischer ${vShort}`,
      `${vShort} Wischblatt vorne`,
    ];
  }

  // ── CLUTCH ─────────────────────────────────────────────────────────────────
  if (partType === 'clutch') {
    return [
      `${vShort} Kupplungssatz`,
      `Sachs Kupplung ${vShort}`,
      `LuK Kupplungskit ${vShort}`,
      `Valeo Kupplung ${make} ${model || ''}`,
    ];
  }

  // ── AIR FILTER ─────────────────────────────────────────────────────────────
  if (partType === 'airfilter') {
    return [
      `${vShort} Luftfilter`,
      `Mann Filter Luft ${vShort}`,
      `Bosch Luftfilter ${vShort}`,
      `Mahle LX Luftfilter ${vShort}`,
    ];
  }

  // ── GLOW PLUGS ─────────────────────────────────────────────────────────────
  if (partType === 'glowplugs') {
    return [
      `${vShort} Glühkerzen`,
      `Bosch Glühkerze ${vShort}`,
      `NGK Glühkerze ${vShort}`,
      `Beru Glühkerze ${vShort}`,
    ];
  }

  // ── SHOCKS ─────────────────────────────────────────────────────────────────
  if (partType === 'shocks') {
    return [
      `${vShort} Stoßdämpfer vorne`,
      `Bilstein ${vShort} Stoßdämpfer`,
      `Sachs Stoßdämpfer ${vShort}`,
      `KYB Excel-G ${make} ${model || ''}`,
    ];
  }

  // ── TIMING/DRIVE BELT ──────────────────────────────────────────────────────
  if (partType === 'belt') {
    return [
      `${vShort} Zahnriemen Satz`,
      `Contitech ${vShort} Zahnriemenkit`,
      `Gates ${vShort} Zahnriemen`,
      `INA Steuerkettenkit ${vShort}`,
    ];
  }

  return null; // partType not in table — fall through to AI
}


// ── Single Anthropic call with its own 55s AbortController ──────────────────
async function callAnthropic(apiKey, content, attemptNum) {
  const TIMEOUT_MS = 55000; // 55s — Vercel Pro allows 60s, give 5s buffer
  const controller = new AbortController();
  const timer = setTimeout(() => {
    console.warn('[FixIt] ABORT_TRIGGERED attempt=%d timeout=%dms', attemptNum, TIMEOUT_MS);
    controller.abort();
  }, TIMEOUT_MS);

  const t0 = Date.now();
  console.log('[FixIt] → Anthropic START attempt=%d timeout=%ds', attemptNum, TIMEOUT_MS / 1000);

  try {
    const aRes = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:       'claude-sonnet-4-6',
        max_tokens:  1200,
        temperature: 0,
        messages:    [{ role: 'user', content }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    console.log('[FixIt] ← Anthropic attempt=%d HTTP=%d dur=%dms', attemptNum, aRes.status, Date.now() - t0);
    return { ok: true, aRes };
  } catch (e) {
    clearTimeout(timer);
    const isAbort = e.name === 'AbortError';
    console.error('[FixIt] ANTHROPIC_FETCH_ERROR attempt=%d type=%s msg=%s dur=%dms',
      attemptNum, e.name, e.message, Date.now() - t0);
    return { ok: false, isAbort, error: e };
  }
}

module.exports = async function handler(req, res) {
  // Log version synchronously first
  console.log('[FixIt] DEPLOY_VERSION =', DEPLOY_VERSION);

  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-FixIt-Version', DEPLOY_VERSION);

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')    return res.status(405).json({ error: 'method_not_allowed', version: DEPLOY_VERSION });

  // ── Rate limit — checked here but NOT charged yet ─────────────────────────
  // We only CONSUME a token when Anthropic actually responds (below).
  // Failed JSON parses, timeouts, and server errors do NOT count against quota.
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  // Peek-only check (read current count without incrementing)
  const rlPeek = (() => {
    const now   = Math.floor(Date.now() / 1000);
    const entry = RL.get(clientIp) || { count: 0, reset: now + RL_WIN };
    if (now > entry.reset) return { ok: true, remaining: RL_MAX };
    return { ok: entry.count < RL_MAX, remaining: Math.max(0, RL_MAX - entry.count) };
  })();
  res.setHeader('X-RateLimit-Remaining', rlPeek.remaining);
  if (!rlPeek.ok) {
    console.warn('[FixIt] RATE_LIMITED ip=%s remaining=%d', clientIp, rlPeek.remaining);
    return res.status(429).json({ error: 'rate_limited', message: 'Too many requests. Please wait before trying again.', version: DEPLOY_VERSION });
  }

  // ── 1. Read body ────────────────────────────────────────────────────────────
  let rawBody;
  try   { rawBody = await readBody(req); }
  catch (e) { console.error('[FixIt] STAGE_FAILED: readBody —', e.message); return res.status(400).json({ error: 'read_body_failed', version: DEPLOY_VERSION }); }

  // ── 2. Parse body ───────────────────────────────────────────────────────────
  let body;
  try   { body = JSON.parse(rawBody); }
  catch (e) { console.error('[FixIt] STAGE_FAILED: parseBody —', e.message); return res.status(400).json({ error: 'invalid_json_body', version: DEPLOY_VERSION }); }

  const { problem, photoB64, category, langName, countryName, userProfile } = body;
  const cat    = String(category   || 'home');
  const lang2  = String(langName   || 'English');
  const prob   = String(problem    || '').trim().slice(0, 500); // hard cap
  const hasText  = prob.length > 0;
  const hasImage = typeof photoB64 === 'string' && photoB64.length > 100;

  // Extract vehicle context from problem text (regex-first, instant)
  const vehicleCtx = cat === 'car' ? extractVehicleFromText(prob) : null;

  // Intelligent part suggestion — detect what part is needed and generate
  // vehicle-specific search queries from the knowledge table (no AI, no paid API)
  const partType          = cat === 'car' ? detectPartType(prob) : null;
  const intelligentParts  = vehicleCtx && partType
    ? vehiclePartSuggestions(vehicleCtx, partType, prob)
    : null;

  const photoKB = hasImage ? Math.round(photoB64.length * 3 / 4 / 1024) : 0;
  console.log('[FixIt] REQUEST cat=%s lang=%s hasText=%s hasImage=%s photoKB=%d vehicle=%s partType=%s intelligentParts=%s prob=%s',
    cat, lang2, hasText, hasImage, photoKB,
    vehicleCtx ? JSON.stringify(vehicleCtx) : 'none',
    partType || 'none',
    intelligentParts ? JSON.stringify(intelligentParts) : 'none',
    prob.slice(0, 60));

  if (!hasText && !hasImage) {
    return res.status(400).json({ error: 'no_input', version: DEPLOY_VERSION });
  }

  // ── 3. API key ──────────────────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !apiKey.startsWith('sk-')) {
    console.error('[FixIt] STAGE_FAILED: apiKey — missing or wrong format (NOT logging key)');
    return res.status(500).json({ error: 'missing_api_key', version: DEPLOY_VERSION });
  }

  // ── 4. Safety hard-stop detection ──────────────────────────────────────────
  const probLower = prob.toLowerCase();
  const HARD_STOP_PATTERNS = [
    /gas (line|pipe|leak|appliance|boiler|furnace|heater|oven|stove|cooker)/i,
    /naturalgas|natural gas|gasleitung|gasrohr|gasherd|gasheizung|erdgas|flüssiggas|propangas/i,
    /live (wire|mains|current|cable|electrical)/i,
    /mains (electric|power|voltage|wiring|cable)/i,
    /230v|240v|400v|high.?voltage|hochspannung|netzspannung/i,
    /fuse.?box|breaker.?box|electrical.?panel|sicherungskasten|verteilerkasten/i,
    /load.?bearing|tragende (wand|mauer)|structural (wall|beam|column|joist)/i,
    /asbestos|asbest|lead.?pipe|bleiröhr|lead water|lead (pipe|plumbing|tube)|bleirohr|blei.?rohr|bleileitun/i,
  ];
  const isHardStop = HARD_STOP_PATTERNS.some(p => p.test(probLower));
  console.log('[FixIt] SAFETY hardStop=%s', isHardStop);

  // ── 5. Build prompt content ─────────────────────────────────────────────────
  const content = [];
  if (hasImage) {
    const mime = detectMime(photoB64);
    if (mime) {
      content.push({ type: 'image', source: { type: 'base64', media_type: mime, data: photoB64 } });
      console.log('[FixIt] IMAGE_BLOCK_ADDED mime=%s photoKB=%d', mime, photoKB);
    } else {
      console.warn('[FixIt] Image MIME unknown — photoB64 starts with: %s', photoB64.slice(0, 20));
    }
  }

  content.push({
    type: 'text',
    text: [
      `You are FixIt AI. Respond with ONE valid JSON object only — no markdown, no text outside the braces. First char: { Last char: }.`,

      `SAFETY RULES — these override everything else:`,
      `1. If the problem involves: GAS lines, gas appliances, gas leaks → set callPro:true, warningLevel:"danger", safetyWarning in ${lang2}: explain gas work requires a licensed gas engineer, provide NO repair steps (steps:[]), tools:[], partsNeeded:[].`,
      `2. If the problem involves: LIVE MAINS ELECTRICITY (230V/240V/400V), consumer unit, fuse box, electrical panel, fixed wiring → set callPro:true, warningLevel:"danger", safetyWarning in ${lang2}: explain mains electrical work requires a licensed electrician, provide NO steps, tools:[], partsNeeded:[].`,
      `3. If the problem involves: STRUCTURAL elements (load-bearing walls, roof beams, foundations) → set callPro:true, warningLevel:"danger".`,
      `4. If the problem involves: ASBESTOS or LEAD pipes → set callPro:true, warningLevel:"danger". Never provide DIY guidance.`,
      `Low-voltage (12V, batteries, USB, EV home charging) is SAFE to guide. Mains wiring is NOT.`,

      `Write ALL visible text in ${lang2}. Exception: imageQuery must be English keywords only (for image search).`,

      `Be specific and expert, but concise. Name the exact component and real tool names. Diagnosis max 2 short sentences. Max 4 causes. Max 4 steps. Each step description max 2 short sentences. Each tip max 1 short sentence. Avoid advanced technician-only explanations unless absolutely necessary. Keep JSON compact and valid.`,
      `LOCATION UNCERTAINTY RULE: For components whose location varies by model year, engine, trim, or market (cabin filter, fuse box, relays, battery, sensors, access panels, hidden compartments): do NOT state one definitive location as absolute fact. Instead: give the most likely location first, then mention alternative positions briefly, use hedging language (usually / typically / often / depending on variant / check first). If the user has not provided year/engine/trim and the location genuinely varies, acknowledge this. Never invent certainty you do not have.`,

      // ── VISION ANALYSIS RULES — only active when user uploads a photo ──────
      ...(hasImage ? [
        `PHOTO PROVIDED — you MUST visually analyse this specific image before answering. Do not give generic advice.`,
        `Lead your diagnosis with what you actually SEE: location, size, severity, surface condition.`,
        `Your steps must describe repair actions for the VISIBLE damage in this photo — not hypothetical general advice.`,
        `Visual inspection checklist (address each that is relevant):`,
        `— Location: where exactly is the damage on the part/panel?`,
        `— Severity: shallow surface scratch, crease, deep dent, crack, deformation?`,
        `— Paint: intact and uncracked, or chipped/cracked/showing metal?`,
        `— Panel access: can you reach behind it, or is it a closed section?`,
        `— For dents: is the dent close to a crease, edge, or flat panel centre?`,
        `For car body dents specifically: state explicitly whether PDR (Paintless Dent Repair) is realistic for THIS dent. State whether suction cup or glue pull tabs would work, or if a dent rod/body hammer is needed. State whether a repaint is likely required.`,
        `Tone: you are a skilled repair technician — confident, direct, practical. No hedging. No "damage can happen from impacts". No generic safety boilerplate unless genuinely needed.`,
        `DIY assessment: give an honest "can the user do this alone?" answer based on the actual visible damage — not a generic disclaimer.`,
      ] : []),

      // Build vehicle-aware partsNeeded instruction
      // When intelligentParts exist: force the AI to use them exactly (pre-computed from knowledge table)
      // When vehicle known but no table match: instruct AI to generate vehicle-specific queries
      // When no vehicle: use generic short-query rules
      ...(intelligentParts ? [
        `DETECTED VEHICLE: ${[vehicleCtx.year, vehicleCtx.make, vehicleCtx.model, vehicleCtx.generation, vehicleCtx.engine].filter(Boolean).join(' ')}.`,
        `partsNeeded REQUIRED: You MUST use EXACTLY this pre-computed list as your partsNeeded array (no changes, no additions, no OEM/part number codes): ${JSON.stringify(intelligentParts)}. These are vehicle-specific search suggestions generated from a fitment knowledge base. Copy them exactly into the partsNeeded field.`,
      ] : vehicleCtx ? [
        `DETECTED VEHICLE: ${[vehicleCtx.year, vehicleCtx.make, vehicleCtx.model, vehicleCtx.generation, vehicleCtx.engine].filter(Boolean).join(' ')}. Use this for vehicle-specific part search queries.`,
        `partsNeeded: 2–4 SHORT vehicle-specific search terms. Include model/generation in each for model-specific parts (brake pads, spark plug, battery, chain kit, filters). For universal consumables (chain spray, chain cleaner, brake cleaner, oil, tools, brushes, care products): use SHORT generic product names WITHOUT prepending the model — e.g. "Motorrad Kettenspray", "S100 Kettenreiniger", not "Suzuki GSXR Kettenspray 2006". Include 1 brand name. NEVER invent OEM part numbers. No sentences.`,
      ] : [
        `partsNeeded: 2–4 SHORT buyable search terms, 2–5 words each. GOOD: ["Geberit Spülkasten Dichtung","Universal WC Flapper 63mm"]. BAD: ["Ablaufventil passend zum Modell","Bosch OEM 0250202132"]. NEVER invent OEM/OE part numbers or codes. No sentences. No "passend für".`,
      ]),

      `estimatedCost: realistic DIY parts cost only, in the currency of ${countryName}. Format: "€5–15". timeEstimate: realistic hands-on time.`,

      `Category: ${cat}. Problem: ${prob || 'analyse the image and diagnose the issue'}`,
      ...(userProfile ? [
        userProfile.vehicles?.length ? `User vehicles: ${userProfile.vehicles.map(v => [v.year, v.make, v.model, v.engine].filter(Boolean).join(' ')).join(', ')}` : '',
        userProfile.home            ? `Home: ${[userProfile.home.type, userProfile.home.age, userProfile.home.country || countryName].filter(Boolean).join(', ')}` : '',
        userProfile.appliances?.length ? `Appliances: ${userProfile.appliances.map(a => [a.brand, a.type, a.model].filter(Boolean).join(' ')).join(', ')}` : '',
      ].filter(Boolean) : []),
      isHardStop ? `NOTE: This matches a HARD STOP safety category. Set callPro:true and warningLevel:"danger" regardless.` : '',

      `Output ONLY the JSON object below, nothing else:`,
      `{"confidence":85,"status":"","difficulty":"","timeEstimate":"","estimatedCost":"","warningLevel":"low","diagnosis":"","causes":[],"safetyWarning":"","callPro":false,"proReason":"","steps":[{"title":"","description":"","imageQuery":"","emoji":"🔧","tip":""}],"tools":[],"partsNeeded":[],"proTip":"","proSearchQuery":""}`,
    ].filter(Boolean).join('\n'),
  });

  // ── 6. Call Anthropic — up to 2 attempts for AbortError/timeout ─────────────
  const t0 = Date.now();
  let rawText = null;
  let lastAbortError = false;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await callAnthropic(apiKey, content, attempt);

    if (!result.ok) {
      lastAbortError = result.isAbort;
      if (result.isAbort && attempt < 2) {
        // AbortError on first attempt → retry once
        console.warn('[FixIt] ABORT_RETRY attempt=%d → retrying', attempt);
        continue;
      }
      // Non-abort error, or second attempt also failed
      const errCode = result.isAbort ? 'timeout' : 'fetch_failed';
      console.error('[FixIt] FINAL_FETCH_FAILURE code=%s attempts=%d', errCode, attempt);
      return res.status(500).json({
        error:   errCode,
        stage:   'anthropicFetch',
        debug:   result.error.message,
        version: DEPLOY_VERSION,
      });
    }

    // Got a response — check HTTP status
    const aRes = result.aRes;
    if (!aRes.ok) {
      let errText = '';
      try { errText = await aRes.text(); } catch (_) {}
      console.error('[FixIt] STAGE_FAILED: anthropicHTTP %d — %s', aRes.status, errText.slice(0, 200));
      return res.status(500).json({ error: 'anthropic_http_error', status: aRes.status, debug: errText.slice(0, 200), version: DEPLOY_VERSION });
    }

    // Parse envelope
    let envelope;
    try   { envelope = await aRes.json(); }
    catch (e) { console.error('[FixIt] STAGE_FAILED: envelopeParse —', e.message); return res.status(500).json({ error: 'envelope_parse_failed', debug: e.message, version: DEPLOY_VERSION }); }

    if (envelope.error) {
      console.error('[FixIt] STAGE_FAILED: anthropicApiError —', envelope.error.message);
      return res.status(500).json({ error: 'anthropic_api_error', debug: envelope.error.message, version: DEPLOY_VERSION });
    }

    rawText = envelope?.content?.[0]?.text;
    if (typeof rawText !== 'string' || rawText.length === 0) {
      console.error('[FixIt] STAGE_FAILED: noText — envelope:', JSON.stringify(envelope).slice(0, 300));
      return res.status(500).json({ error: 'no_text', debug: JSON.stringify(envelope).slice(0, 300), version: DEPLOY_VERSION });
    }

    const rawLen = rawText.length;
    console.log('[FixIt] RAW_FIRST_500 (len=%d):', rawLen, rawText.slice(0, 500));

    // ── Charge rate limit token NOW (only on real Anthropic success) ──────────
    const rlResult = checkRateLimit(clientIp);
    console.log('[FixIt] RATE_LIMIT_CHARGED ip=%s remaining=%d', clientIp, rlResult.remaining);
    res.setHeader('X-RateLimit-Remaining', rlResult.remaining);
    break; // success
  }

  // ── 7. Clean + parse JSON ───────────────────────────────────────────────────
  let s = rawText;
  s = s.replace(/```json/gi, '').replace(/```/g, '').trim();
  const first = s.indexOf('{'), last = s.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) {
    // Claude returned text with no JSON object (apology, explanation, etc.)
    // Log the raw text and return a 200 fallback — never 500 for this case.
    console.error('[FixIt] NO_BRACES_FALLBACK — raw has no JSON object. First300: %s', s.slice(0, 300));
    console.error('[FixIt] RAW_NO_BRACES_PREVIEW:', rawText.slice(0, 600));
    const fb = makeFallback('no_braces');
    console.log('[FixIt] JSON_PARSE_UNRECOVERABLE_FALLBACK_RETURNED HTTP_STATUS=200 fallback=true reason=no_braces');
    if (intelligentParts) fb.partsNeeded = intelligentParts;
    fb._version = DEPLOY_VERSION;
    if (vehicleCtx) fb._vehicleCtx = vehicleCtx;
    return res.status(200).json(fb);
  }
  s = s.slice(first, last + 1);
  s = s.replace(/[\u201c\u201d\u201e\u201f]/g, '"').replace(/[\u2018\u2019]/g, "'");
  s = s.replace(/,\s*([\]}])/g, '$1');

  // Escape bare control chars inside string values
  let out = '', inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc)        { out += c; esc = false; continue; }
    if (c === '\\') { out += c; esc = true;  continue; }
    if (c === '"')  { inStr = !inStr; out += c; continue; }
    if (inStr && c === '\n') { out += '\\n'; continue; }
    if (inStr && c === '\r') { out += '\\r'; continue; }
    if (inStr && c === '\t') { out += '\\t'; continue; }
    out += c;
  }
  s = out;

  console.log('[FixIt] CLEANED_FIRST_500:', s.slice(0, 500));

  // ── 8. JSON.parse — with repair pass and safe fallback ──────────────────────
  // Strategy:
  //   Attempt 1: parse cleaned string directly
  //   Attempt 2: truncate at error position
  //   Attempt 3: AI repair pass (2nd Anthropic call with the broken text)
  //   Fallback:  return structured 200 JSON — never crash with 500 on parse failure

  // Safe fallback object — 200 response so frontend can show retry UI, not crash
  function makeFallback(reason) {
    console.error('[FixIt] FALLBACK_JSON reason=%s', reason);
    return {
      confidence:    50,
      status:        lang2.includes('Deutsch') || lang2.includes('German')
        ? 'Analyse konnte nicht vollständig verarbeitet werden'
        : 'Analysis could not be fully processed',
      difficulty:    'Unknown',
      timeEstimate:  '',
      estimatedCost: '',
      warningLevel:  'low',
      diagnosis:     lang2.includes('Deutsch') || lang2.includes('German')
        ? 'Die Analyse konnte nicht korrekt verarbeitet werden. Bitte erneut versuchen.'
        : 'The analysis could not be processed correctly. Please try again.',
      causes:       [],
      safetyWarning:'',
      callPro:       false,
      proReason:     '',
      steps:        [],
      tools:        [],
      partsNeeded:  [],
      proTip:       '',
      proSearchQuery: '',
      _fallback:     true,
      _fallbackReason: reason,
    };
  }

  let parsed;
  const parseStarted = Date.now();

  // Attempt 1: direct parse
  try {
    parsed = JSON.parse(s);
    console.log('[FixIt] JSON_PARSE_SUCCESS attempt=1 dur=%dms', Date.now()-parseStarted);
  } catch (e1) {
    const posMatch = e1.message.match(/position (\d+)/);
    const pos = posMatch ? parseInt(posMatch[1]) : -1;
    console.error('[FixIt] JSON_PARSE_FAIL attempt=1 msg=%s pos=%d rawLen=%d', e1.message, pos, s.length);
    if (pos >= 0) console.error('[FixIt] JSON_ERROR_CONTEXT:', JSON.stringify(s.slice(Math.max(0, pos-40), pos+40)));
    console.error('[FixIt] RAW_PREVIEW_FOR_DEBUG:', rawText.slice(0, 800));

    // Attempt 2: truncate at error position
    let recovered = false;
    if (pos > 50) {
      try {
        const truncated = s.slice(0, pos).replace(/,\s*$/, '') + '}}';
        parsed = JSON.parse(truncated);
        console.warn('[FixIt] JSON_PARSE_RECOVERED attempt=2 truncation pos=%d', pos);
        recovered = true;
      } catch (_) {
        console.warn('[FixIt] JSON_TRUNCATION_FAILED pos=%d', pos);
      }
    }

    // Attempt 3: AI repair pass — ask Claude to fix its own malformed JSON
    if (!recovered) {
      console.warn('[FixIt] JSON_REPAIR_PASS_TRIGGERED rawLen=%d', rawText.length);
      try {
        const repairPayload = {
          model:       'claude-sonnet-4-6',
          max_tokens:  1200,
          temperature: 0,
          messages: [{
            role: 'user',
            content: `The following text was supposed to be valid JSON but has a parse error at position ${pos}. Fix it and return ONLY the corrected valid JSON object, nothing else:\n\n${rawText.slice(0, 3000)}`,
          }],
        };
        const repairController = new AbortController();
        const repairTimer = setTimeout(() => repairController.abort(), 20000);
        const repairRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify(repairPayload),
          signal: repairController.signal,
        });
        clearTimeout(repairTimer);
        if (repairRes.ok) {
          const repairEnv  = await repairRes.json();
          const repairText = repairEnv?.content?.[0]?.text || '';
          const rf = repairText.indexOf('{'), rl = repairText.lastIndexOf('}');
          if (rf !== -1 && rl > rf) {
            let repairS = repairText.slice(rf, rl+1);
            repairS = repairS.replace(/[\u201c\u201d\u201e\u201f]/g,'"').replace(/[\u2018\u2019]/g,"'");
            repairS = repairS.replace(/,\s*([\]}])/g,'$1');
            parsed = JSON.parse(repairS);
            console.warn('[FixIt] JSON_REPAIR_SUCCESS attempt=3');
            recovered = true;
          }
        }
      } catch (repairErr) {
        console.error('[FixIt] JSON_REPAIR_FAILED:', repairErr.message);
      }
    }

    // Fallback: return 200 with structured fallback — NEVER 500 for parse failure
    if (!recovered) {
      const fb = makeFallback('json_parse_failed');
      console.error('[FixIt] JSON_PARSE_UNRECOVERABLE_FALLBACK_RETURNED HTTP_STATUS=200 fallback=true reason=json_parse_failed');
      if (intelligentParts) fb.partsNeeded = intelligentParts;
      fb._version = DEPLOY_VERSION;
      if (vehicleCtx) fb._vehicleCtx = vehicleCtx;
      return res.status(200).json(fb);
    }
  }

 // ── 9. Return ───────────────────────────────────────────────────────────────
// If intelligent parts were computed, ALWAYS use them — overrides AI output.
// This is the guarantee that vehicle-specific suggestions are actually returned,
// regardless of whether the AI followed the prompt instruction.
if (intelligentParts) {
  parsed.partsNeeded = intelligentParts;
  console.log('[FixIt] PARTS_OVERRIDE: using intelligent parts for partType=%s vehicle=%s',
    partType, vehicleCtx ? vehicleCtx.make + ' ' + (vehicleCtx.model || '') : 'none');
}

// Compact parsed output to reduce oversized responses and improve stability
if (Array.isArray(parsed.causes)) {
  parsed.causes = parsed.causes.slice(0, 4);
}

if (Array.isArray(parsed.steps)) {
  parsed.steps = parsed.steps.slice(0, 4).map(step => ({
    ...step,
    title: typeof step.title === 'string'
      ? step.title.slice(0, 80)
      : step.title,

    description: typeof step.description === 'string'
      ? step.description.slice(0, 300)
      : step.description,

    tip: typeof step.tip === 'string'
      ? step.tip.slice(0, 140)
      : step.tip,
  }));
}

if (typeof parsed.diagnosis === 'string') {
  parsed.diagnosis = parsed.diagnosis.slice(0, 420);
}

if (typeof parsed.proTip === 'string') {
  parsed.proTip = parsed.proTip.slice(0, 220);
}

// Electrical safety disclaimer injection
const electricalText =
  `${prob} ${parsed.diagnosis || ''}`.toLowerCase();

const electricalTerms = [
  'steckdose',
  'sicherungskasten',
  '230v',
  '240v',
  '400v',
  'netzspannung',
  'offene leitung',
  'stromschlag',
  'kabelbrand',
  'live wire',
  'mains',
  'electrical panel',
  'fuse box'
];

const isElectricalSafetyIssue =
  cat !== 'car' &&
  electricalTerms.some(term => electricalText.includes(term));

if (
  isElectricalSafetyIssue &&
  !parsed.safetyWarning
) {
  parsed.safetyWarning =
    lang2.includes('Deutsch') || lang2.includes('German')
      ? 'Bei Elektroarbeiten immer zuerst die Sicherung ausschalten. Bei offenen Leitungen, Sicherungskasten oder Unsicherheit einen Elektriker kontaktieren.'
      : 'For electrical work, always turn off power first. For exposed wiring, fuse boxes, or uncertainty, contact a licensed electrician.';
}

parsed._version = DEPLOY_VERSION;
parsed.globalDisclaimer = getGlobalDisclaimer(lang2);

if (vehicleCtx) {
  parsed._vehicleCtx = vehicleCtx; // expose for UI compatibility warning
}

const dur = Date.now() - t0;

console.log(
  '[FixIt] RETURNING_RESPONSE dur=%dms conf=%s vehicle=%s',
  dur,
  parsed.confidence,
  vehicleCtx
    ? parsed._vehicleCtx.make + ' ' + (parsed._vehicleCtx.model || '')
    : 'none'
);

return res.status(200).json(parsed);
};
