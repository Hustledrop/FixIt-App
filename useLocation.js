import { useState, useCallback, useRef } from 'react';
import { LANG_TO_CC, COUNTRIES } from '../data/countries.js';

export function useLocation() {
  const [lat, setLat]         = useState(null);
  const [lng, setLng]         = useState(null);
  const [city, setCity]       = useState('');
  const [country, setCountry] = useState('DEFAULT');
  const [locStatus, setLocStatus] = useState('idle');
  const requested = useRef(false);

  const requestLocation = useCallback(() => {
    if (requested.current) return;
    requested.current = true;
    if (!navigator.geolocation) { setLocStatus('denied'); return; }
    setLocStatus('loading');
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const la = parseFloat(pos.coords.latitude.toFixed(6));
        const lo = parseFloat(pos.coords.longitude.toFixed(6));
        setLat(la); setLng(lo); setLocStatus('ok');
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${la}&lon=${lo}&format=json`,
            { headers: { 'Accept-Language': 'en' } });
          const d = await r.json();
          const ct = d.address?.city || d.address?.town || d.address?.village || d.address?.county || '';
          const c2 = (d.address?.country_code || '').toUpperCase();
          setCity(ct);
          setCountry(COUNTRIES[c2] ? c2 : 'DEFAULT');
        } catch (_) { /* GPS ok, geocode failed — keep DEFAULT */ }
      },
      () => { setLocStatus('denied'); requested.current = false; },
      { timeout: 12000, maximumAge: 300000, enableHighAccuracy: false }
    );
  }, []);

  // Timezone → country code mapping (no network call, instant, browser-agnostic)
  // Better than language suffix because:
  // - Croatian worker in Germany → 'Europe/Berlin' → DE ✅
  // - Messenger in-app browsers with different locale → timezone unchanged ✅
  function getTimezoneCC() {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      const TZ_MAP = {
        'Europe/Berlin':'DE','Europe/Vienna':'AT','Europe/Zurich':'CH',
        'Europe/London':'GB','Europe/Dublin':'IE','Europe/Paris':'FR',
        'Europe/Madrid':'ES','Europe/Rome':'IT','Europe/Warsaw':'PL',
        'Europe/Zagreb':'HR','Europe/Belgrade':'RS','Europe/Skopje':'MK',
        'Europe/Sarajevo':'BA','Europe/Istanbul':'TR','Europe/Bucharest':'RO',
        'Europe/Sofia':'BG','Europe/Athens':'GR','Europe/Prague':'CZ',
        'Europe/Budapest':'HU','Europe/Amsterdam':'NL','Europe/Brussels':'BE',
        'Europe/Stockholm':'SE','Europe/Copenhagen':'DK','Europe/Helsinki':'FI',
        'Europe/Oslo':'NO','Europe/Lisbon':'PT','Europe/Kiev':'UA',
        'America/New_York':'US','America/Chicago':'US','America/Denver':'US',
        'America/Los_Angeles':'US','America/Toronto':'CA','America/Vancouver':'CA',
        'Australia/Sydney':'AU','Australia/Melbourne':'AU',
        'Asia/Tokyo':'JP','Asia/Seoul':'KR','Asia/Shanghai':'CN',
        'Asia/Dubai':'AE','Asia/Riyadh':'SA',
      };
      const cc = TZ_MAP[tz];
      return (cc && COUNTRIES[cc]) ? cc : null;
    } catch (_) { return null; }
  }

  // Return best country code:
  // Priority: GPS reverse-geocode → timezone → lang-suffix region → DEFAULT
  // Language does NOT control country — they are fully independent.
  const getCC = useCallback((lang, detectedRegion) => {
    // GPS always wins — this is the primary fix for "Croatian phone in Germany"
    if (country && country !== 'DEFAULT') {
      console.log('[FixIt] REGION GPS:', country);
      return country;
    }
    // Timezone is a better pre-GPS signal than language suffix
    // (timezone reflects physical location, not phone locale)
    const tzCC = getTimezoneCC();
    if (tzCC) {
      console.log('[FixIt] REGION timezone:', tzCC);
      return tzCC;
    }
    // detectedRegion from navigator.language suffix — last resort before DEFAULT
    if (detectedRegion && COUNTRIES[detectedRegion]) {
      console.log('[FixIt] REGION locale-suffix:', detectedRegion);
      return detectedRegion;
    }
    console.log('[FixIt] REGION DEFAULT (no GPS, no timezone match)');
    return 'DEFAULT';
  }, [country]);

  return { lat, lng, city, country, locStatus, requestLocation, getCC };
}
