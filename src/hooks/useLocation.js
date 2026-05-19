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

  // Return best country code: GPS country → lang fallback → DEFAULT
  const getCC = useCallback((lang) => {
    if (country && country !== 'DEFAULT') return country;
    const g = LANG_TO_CC[lang];
    return (g && COUNTRIES[g]) ? g : 'DEFAULT';
  }, [country]);

  return { lat, lng, city, country, locStatus, requestLocation, getCC };
}
