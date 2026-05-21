// api/diagnose.js — v4 — full crash reporting
// DEPLOY_VERSION is logged synchronously before ANY async code

const DEPLOY_VERSION = 'diagnose-v5-speed';

// ── In-memory rate limit (MVP — resets on cold start, protects against abuse) ──
// Per IP: max 10 diagnoses per hour. Adjust as needed.
const RL = new Map();
const RL_MAX  = 10;   // requests per window
const RL_WIN  = 3600; // seconds (1 hour)

function checkRateLimit(ip) {
  const now   = Math.floor(Date.now() / 1000);
  const entry = RL.get(ip) || { count: 0, reset: now + RL_WIN };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + RL_WIN; }
  entry.count++;
  RL.set(ip, entry);
  return { ok: entry.count <= RL_MAX, remaining: Math.max(0, RL_MAX - entry.count), reset: entry.reset };
}

// detectMime at module top level — NOT inside any block or function
function detectMime(b64) {
  if (!b64) return null;
  if (b64.startsWith('/9j/'))   return 'image/jpeg';
  if (b64.startsWith('iVBOR'))  return 'image/png';
  if (b64.startsWith('UklGR'))  return 'image/webp';
  if (b64.startsWith('R0lGO'))  return 'image/gif';
  return null;
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data',  chunk => { d += chunk.toString('utf8'); });
    req.on('end',   () => resolve(d));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  // Synchronous — logged before ANY await, ANY try/catch
  console.log('[FixIt] DEPLOY_VERSION =', DEPLOY_VERSION);

  // Wrap everything in a top-level catch so Vercel never returns 500 silently
  try {
    return await run(req, res);
  } catch (e) {
    console.error('[FixIt] UNHANDLED_EXCEPTION');
    console.error('[FixIt] ERROR_NAME:', e.name);
    console.error('[FixIt] ERROR_MESSAGE:', e.message);
    console.error('[FixIt] ERROR_STACK:', e.stack);
    // Return JSON even on total crash — never let Vercel return HTML 500
    try {
      res.status(500).json({
        error: 'unhandled_exception',
        version: DEPLOY_VERSION,
        name: e.name,
        message: e.message,
        stack: e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : '',
      });
    } catch (_) {} // res may already be sent
  }
};

async function run(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-FixIt-Version', DEPLOY_VERSION);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'method_not_allowed', version: DEPLOY_VERSION });

  // ── Rate limit check ─────────────────────────────────────────────────────────
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  const rl = checkRateLimit(clientIp);
  res.setHeader('X-RateLimit-Remaining', rl.remaining);
  if (!rl.ok) {
    console.warn('[FixIt] RATE_LIMITED ip=' + clientIp);
    return res.status(429).json({ error: 'rate_limited', message: 'Too many requests. Please wait before trying again.', version: DEPLOY_VERSION });
  }

  // ── 1. Read + parse request body ─────────────────────────────────────────
  let rawBody;
  try {
    rawBody = await readBody(req);
  } catch (e) {
    console.error('[FixIt] STAGE_FAILED: readBody —', e.message);
    return res.status(500).json({ error: 'read_body_failed', stage: 'readBody', debug: e.message, version: DEPLOY_VERSION });
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch (e) {
    console.error('[FixIt] STAGE_FAILED: parseBody —', e.message);
    return res.status(400).json({ error: 'invalid_json', stage: 'parseBody', debug: e.message });
  }

  const { problem, photoB64, category, langName, countryName, userProfile } = body;
  const cat    = String(category   || 'home');
  const lang2  = String(langName   || 'English');
  const prob   = String(problem    || '').trim();
  const hasText  = prob.length > 0;
  const hasImage = typeof photoB64 === 'string' && photoB64.length > 10;

  console.log('[FixIt] REQUEST cat=%s hasText=%s hasImage=%s probLen=%d', cat, hasText, hasImage, prob.length);

  if (!hasText && !hasImage) {
    return res.status(400).json({ error: 'no_input', version: DEPLOY_VERSION });
  }

  // ── 2. API key ──────────────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_KEY || '';
  if (!apiKey.startsWith('sk-ant-')) {
    console.error('[FixIt] STAGE_FAILED: apiKey — key missing or wrong format');
    return res.status(500).json({ error: 'missing_api_key', version: DEPLOY_VERSION });
  }

  // ── 3. Build content array ──────────────────────────────────────────────
  const content = [];
  if (hasImage) {
    const mime = detectMime(photoB64);
    if (mime) {
      content.push({ type: 'image', source: { type: 'base64', media_type: mime, data: photoB64 } });
    } else {
      console.warn('[FixIt] Image MIME unknown — text-only');
    }
  }
  // ── SAFETY PRE-CLASSIFICATION ─────────────────────────────────────────────
  // Detect hard-stop categories BEFORE building repair content
  const probLower = (prob || '').toLowerCase();
  const HARD_STOP_PATTERNS = [
    /gas (line|pipe|leak|appliance|boiler|furnace|heater|oven|stove|cooker)/i,
    /naturalgas|natural gas|gasleitung|gasrohr|gasherd|gasheizung/i,
    /live (wire|mains|current|cable|electrical)/i,
    /mains (electric|power|voltage|wiring|cable)/i,
    /230v|240v|400v|high.?voltage|hochspannung|netzspannung/i,
    /fuse.?box|breaker.?box|electrical.?panel|sicherungskasten|verteilerkasten/i,
    /load.?bearing|tragende (wand|mauer)|structural (wall|beam|column|joist)/i,
    /asbestos|asbest|lead.?pipe|bleiröhr/i,
  ];
  const isHardStop = HARD_STOP_PATTERNS.some(p => p.test(probLower));

  content.push({
    type: 'text',
    text: [
      // ── CORE IDENTITY + OUTPUT FORMAT ──
      `You are FixIt AI, an expert repair assistant. Respond with valid JSON only. No markdown. No prose. No text outside the JSON object.`,

      // ── SAFETY HARD STOPS (NON-NEGOTIABLE) ──
      `SAFETY RULES — these override everything else:`,
      `1. If the problem involves: GAS lines, gas appliances, gas leaks → set callPro:true, warningLevel:"danger", safetyWarning in ${lang2}: explain gas work requires a licensed gas engineer, provide NO repair steps (steps:[]), tools:[], partsNeeded:[].`,
      `2. If the problem involves: LIVE MAINS ELECTRICITY (230V/240V/400V), consumer unit, fuse box, electrical panel, fixed wiring → set callPro:true, warningLevel:"danger", safetyWarning in ${lang2}: explain mains electrical work requires a licensed electrician, provide NO steps, tools:[], partsNeeded:[].`,
      `3. If the problem involves: STRUCTURAL elements (load-bearing walls, roof beams, foundations) → set callPro:true, warningLevel:"danger".`,
      `4. If the problem involves: ASBESTOS or LEAD pipes → set callPro:true, warningLevel:"danger". Never provide DIY guidance.`,
      `Low-voltage (12V, batteries, USB, EV charging at home with proper adapter) is SAFE to guide. Mains wiring is NOT.`,

      // ── LANGUAGE ──
      `Write ALL visible text in ${lang2}. Exception: imageQuery must be English keywords only (for image search). Never use English words in diagnosis, steps, causes, safetyWarning, proTip, status when the language is not English.`,

      // ── SPECIFICITY REQUIREMENT ──
      `Be specific and expert. Name the exact component, not a category. Say "pump filter cap behind the lower kick plate" not "check the filter". Use real tool names (Torx T20, 13mm socket) not generic ones. Reference model-specific quirks if known from category+problem context. Max 4 steps. Diagnosis under 90 words.`,

      // ── COST + TIME ──
      `estimatedCost: realistic DIY parts cost only (no labour), in the currency of ${countryName}. Format: "€5–15" or "£10–25". timeEstimate: realistic hands-on time.`,

      // ── CATEGORY + PROBLEM ──
      `Category: ${cat}. Problem: ${prob || 'analyse the image and diagnose the issue'}`,
      // Inject user profile context for more specific guidance
      ...(userProfile ? [
        userProfile.vehicles?.length ? `User vehicles: ${userProfile.vehicles.map(v=>[v.year,v.make,v.model,v.engine].filter(Boolean).join(' ')).join(', ')}` : '',
        userProfile.home ? `Home: ${[userProfile.home.type, userProfile.home.age, userProfile.home.country||countryName].filter(Boolean).join(', ')}` : '',
        userProfile.appliances?.length ? `Appliances: ${userProfile.appliances.map(a=>[a.brand,a.type,a.model].filter(Boolean).join(' ')).join(', ')}` : '',
      ].filter(Boolean) : []),
      isHardStop ? `NOTE: This problem description matches a HARD STOP safety category. Set callPro:true and warningLevel:"danger" regardless of how the user phrased it.` : '',

      // ── JSON SCHEMA ──
      `Return exactly this JSON structure (no extra fields, no omissions):`,
      `{"confidence":85,"status":"Diagnose in 1 sentence","difficulty":"Easy DIY","timeEstimate":"20 min","estimatedCost":"€8–15","warningLevel":"low","diagnosis":"Root cause in 1–2 sentences","causes":["cause1","cause2"],"safetyWarning":"","callPro":false,"proReason":"","steps":[{"title":"Step title","description":"Specific step with exact component names and tool sizes","imageQuery":"specific english search query for step image","emoji":"🔧","tip":""}],"tools":["Exact tool name"],"partsNeeded":["Exact part name"],"proTip":"One expert tip that a DIYer would not know","proSearchQuery":"service type near me"}`,
    ].filter(Boolean).join('\n'),
  });

  // ── 4. Call Anthropic ───────────────────────────────────────────────────
  const controller = new AbortController();
  const t0         = Date.now();
  const abortTimer = setTimeout(() => controller.abort(), 25000);

  let aRes;
  try {
    console.log('[FixIt] → Anthropic START');
    aRes = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 1200,
          temperature: 0,
        messages:   [{ role: 'user', content }],
      }),
      signal: controller.signal,
    });
    console.log('[FixIt] ← Anthropic %dms HTTP=%d', Date.now() - t0, aRes.status);
  } catch (e) {
    clearTimeout(abortTimer);
    console.error('[FixIt] STAGE_FAILED: anthropicFetch —', e.name, e.message);
    return res.status(500).json({
      error: e.name === 'AbortError' ? 'timeout' : 'fetch_failed',
      stage: 'anthropicFetch',
      debug: e.message,
      version: DEPLOY_VERSION,
    });
  }
  clearTimeout(abortTimer);

  // ── 5. Read Anthropic response ──────────────────────────────────────────
  if (!aRes.ok) {
    let errText = '';
    try { errText = await aRes.text(); } catch (_) {}
    console.error('[FixIt] STAGE_FAILED: anthropicHTTP %d — %s', aRes.status, errText.slice(0, 200));
    return res.status(500).json({ error: 'anthropic_http_error', status: aRes.status, debug: errText.slice(0, 200), version: DEPLOY_VERSION });
  }

  let envelope;
  try {
    envelope = await aRes.json();
  } catch (e) {
    console.error('[FixIt] STAGE_FAILED: envelopeParse —', e.message);
    return res.status(500).json({ error: 'envelope_parse_failed', stage: 'envelopeParse', debug: e.message, version: DEPLOY_VERSION });
  }

  if (envelope.error) {
    console.error('[FixIt] STAGE_FAILED: anthropicApiError —', envelope.error.message);
    return res.status(500).json({ error: 'anthropic_api_error', debug: envelope.error.message, version: DEPLOY_VERSION });
  }

  // ── 6. Extract text ─────────────────────────────────────────────────────
  const rawText = envelope?.content?.[0]?.text;
  if (typeof rawText !== 'string' || rawText.length === 0) {
    console.error('[FixIt] STAGE_FAILED: noText — envelope:', JSON.stringify(envelope).slice(0, 300));
    return res.status(500).json({ error: 'no_text', stage: 'extractText', debug: JSON.stringify(envelope).slice(0, 300), version: DEPLOY_VERSION });
  }

  console.log('[FixIt] RAW_FIRST_500:', rawText.slice(0, 500));

  // ── 7. Clean + parse ────────────────────────────────────────────────────
  let s = rawText;

  // Remove all markdown fences (global, handles space OR newline after ```json)
  s = s.replace(/```json/gi, '').replace(/```/g, '');
  s = s.trim();

  // Extract { ... }
  const first = s.indexOf('{');
  const last  = s.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) {
    console.error('[FixIt] STAGE_FAILED: noBraces — cleaned:', s.slice(0, 300));
    return res.status(500).json({ error: 'no_braces', stage: 'extractBraces', debug: s.slice(0, 300), version: DEPLOY_VERSION });
  }
  s = s.slice(first, last + 1);

  // Normalize smart quotes
  s = s.replace(/[\u201c\u201d\u201e\u201f]/g, '"').replace(/[\u2018\u2019]/g, "'");

  // Remove trailing commas
  s = s.replace(/,\s*([\]}])/g, '$1');

  // Escape bare control chars inside string values
  let out = '', inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc)         { out += c; esc = false; continue; }
    if (c === '\\')  { out += c; esc = true;  continue; }
    if (c === '"')   { inStr = !inStr; out += c; continue; }
    if (inStr && c === '\n') { out += '\\n'; continue; }
    if (inStr && c === '\r') { out += '\\r'; continue; }
    if (inStr && c === '\t') { out += '\\t'; continue; }
    out += c;
  }
  s = out;

  console.log('[FixIt] CLEANED_FIRST_500:', s.slice(0, 500));

  // ── 8. JSON.parse ───────────────────────────────────────────────────────
  let parsed;
  try {
    parsed = JSON.parse(s);
  } catch (e) {
    const posMatch = e.message.match(/position (\d+)/);
    const pos      = posMatch ? parseInt(posMatch[1]) : -1;
    console.error('[FixIt] STAGE_FAILED: jsonParse');
    console.error('[FixIt] JSON_PARSE_ERROR_MESSAGE:', e.message);
    if (pos >= 0) {
      console.error('[FixIt] JSON_PARSE_ERROR_POSITION:', pos,
        '— context:', JSON.stringify(s.slice(Math.max(0, pos - 40), pos + 40)));
    }
    console.error('[FixIt] CLEANED_LAST_200:', s.slice(-200));
    return res.status(500).json({
      error:            'json_parse_failed',
      stage:            'jsonParse',
      debug:            e.message,
      position:         pos,
      context:          pos >= 0 ? s.slice(Math.max(0, pos - 40), pos + 40) : '',
      cleaned_last_200: s.slice(-200),
      version:          DEPLOY_VERSION,
    });
  }

  // ── 9. Return ───────────────────────────────────────────────────────────
  parsed._version = DEPLOY_VERSION;
  const dur = Date.now() - t0;
  console.log('[FixIt] PARSE SUCCESS — keys:', Object.keys(parsed).join(','));
  console.log('[FixIt] RETURNING REAL AI RESPONSE dur=%dms conf=%s', dur, parsed.confidence);
  return res.status(200).json(parsed);
}
