import { useState, useEffect, useRef, useCallback } from 'react';
import { LANGS, tx } from './data/lang.js';
import { getCountry, smartCC, mapsUrlFor, getStores, getOnlineStores, getLocalStoreSearch } from './data/countries.js';
import { EMRG, getEmrgT, getEmrgS } from './data/emergency.js';
import { getQP } from './data/quickproblems.js';
import { useLocation } from './hooks/useLocation.js';
import { useAI } from './hooks/useAI.js';
import { useNearby, MAP_CATS } from './hooks/useNearby.js';
import { C, s, Spinner, NavBar, BackBtn, LangPicker, Screen, Scroll } from './components/UI.jsx';

// ── localStorage helpers (prefixed fixit_) ────────────────────────────────────
const LS = {
  get: k => { try { return JSON.parse(localStorage.getItem('fixit_'+k)); } catch { return null; } },
  set: (k,v) => { try { localStorage.setItem('fixit_'+k, JSON.stringify(v)); } catch {} },
};
// Session storage for tab-return persistence (cleared when browser closes)
const SS = {
  get: k => { try { return JSON.parse(sessionStorage.getItem('fixit_'+k)); } catch { return null; } },
  set: (k,v) => { try { sessionStorage.setItem('fixit_'+k, JSON.stringify(v)); } catch {} },
  del: k => { try { sessionStorage.removeItem('fixit_'+k); } catch {} },
};

// ── AI loading messages (cycles during diagnosis) ─────────────────────────────
const AI_MSGS = {
  en:['AI analysis running… (20–40 sec)','Identifying the cause…','Preparing repair steps…','Finding parts and tools…'],
  de:['KI-Analyse läuft… (ca. 20–40 Sek.)','Ursache wird ermittelt…','Reparaturschritte werden erstellt…','Teile und Werkzeuge werden gesucht…'],
  fr:['Analyse du problème…','Identification de la cause…','Préparation des étapes…','Recherche des pièces…'],
  es:['Analizando tu problema…','Identificando la causa…','Preparando los pasos…','Buscando repuestos…'],
  it:['Analisi del problema…','Identificazione della causa…','Preparazione dei passi…','Ricerca dei ricambi…'],
  pl:['Analiza problemu…','Identyfikacja przyczyny…','Przygotowanie kroków…','Szukanie części…'],
  sr:['Analiza problema u toku…','Otkrivanje uzroka…','Priprema koraka…','Traženje delova…'],
  hr:['Analiza problema u tijeku…','Otkrivanje uzroka…','Priprema koraka…','Traženje dijelova…'],
  mk:['Анализа на проблемот…','Откривање на причината…','Подготовка на чекорите…','Барање делови…'],
  tr:['Problem analiz ediliyor…','Neden belirleniyor…','Adımlar hazırlanıyor…','Parçalar aranıyor…'],
};


// ── Category recognition label for Parts Finder ─────────────────────────────
// Returns e.g. "Fahrzeug erkannt" / "Gerät erkannt" / "Tier erkannt" etc.
function catRecognitionLabel(vType, lang) {
  const de = lang==='de', fr = lang==='fr', es = lang==='es', it = lang==='it';
  const mk = lang==='mk', sr = lang==='sr', hr = lang==='hr', pl = lang==='pl', tr = lang==='tr';
  const labels = {
    car:        de?'Fahrzeug erkannt':fr?'Véhicule reconnu':es?'Vehículo detectado':it?'Veicolo rilevato':mk?'Возило препознаено':(sr||hr)?'Vozilo prepoznato':pl?'Pojazd rozpoznany':tr?'Araç tanındı':'Vehicle detected',
    bike:       de?'Fahrrad erkannt':fr?'Vélo reconnu':es?'Bicicleta detectada':it?'Bici rilevata':mk?'Велосипед препознаен':(sr||hr)?'Bicikl prepoznat':pl?'Rower rozpoznany':tr?'Bisiklet tanındı':'Bike detected',
    tech:       de?'Gerät erkannt':fr?'Appareil reconnu':es?'Dispositivo detectado':it?'Dispositivo rilevato':mk?'Уред препознаен':(sr||hr)?'Uređaj prepoznat':pl?'Urządzenie rozpoznane':tr?'Cihaz tanındı':'Device detected',
    appliances: de?'Gerät erkannt':fr?'Appareil reconnu':es?'Electrodoméstico detectado':it?'Elettrodomestico rilevato':mk?'Апарат препознаен':(sr||hr)?'Aparat prepoznat':pl?'Urządzenie rozpoznane':tr?'Cihaz tanındı':'Appliance detected',
    garden:     de?'Gartenprodukt erkannt':fr?'Produit jardin reconnu':es?'Producto jardín detectado':it?'Prodotto giardino rilevato':mk?'Градинарски производ препознаен':(sr||hr)?'Vrtni proizvod prepoznat':pl?'Produkt ogrodowy rozpoznany':tr?'Bahçe ürünü tanındı':'Garden product detected',
    pets:       de?'Tierprodukt erkannt':fr?'Produit animal reconnu':es?'Producto mascota detectado':it?'Prodotto animale rilevato':mk?'Производ за миленик препознаен':(sr||hr)?'Proizvod za ljubimca prepoznat':pl?'Produkt dla zwierząt rozpoznany':tr?'Evcil hayvan ürünü tanındı':'Pet product detected',
    home:       de?'Produkt erkannt':fr?'Produit reconnu':es?'Producto detectado':it?'Prodotto rilevato':mk?'Производ препознаен':(sr||hr)?'Proizvod prepoznan':pl?'Produkt rozpoznany':tr?'Ürün tanındı':'Product detected',
  };
  return labels[vType] || (de?'Produkt erkannt':'Product detected');
}

// ── Category terminology mapper ───────────────────────────────────────────────
// Returns UI labels adapted to the category — pets/garden differ from repair
function catTerms(cat, lang) {
  const de = lang === 'de';
  const fr = lang === 'fr';
  const es = lang === 'es';
  const it = lang === 'it';
  const mk = lang === 'mk';
  const sr = lang === 'sr';
  const hr = lang === 'hr';

  const isPet    = cat === 'pets';
  const isGarden = cat === 'garden';
  const isBike   = cat === 'bike';
  const isCar    = cat === 'car';
  const isTech   = cat === 'tech';
  // Everything else (home, appliances) = repair

  if (isPet) return {
    tools:     de?'Empfohlene Hilfsmittel':fr?'Accessoires recommandés':es?'Accesorios recomendados':it?'Accessori consigliati':mk?'Препорачани средства':(sr||hr)?'Preporučena sredstva':'Recommended Supplies',
    parts:     de?'Empfohlene Produkte':fr?'Produits recommandés':es?'Productos recomendados':it?'Prodotti consigliati':mk?'Препорачани производи':(sr||hr)?'Preporučeni proizvodi':'Recommended Products',
    steps:     de?'Pflegehinweise':fr?'Conseils de soin':es?'Consejos de cuidado':it?'Consigli di cura':mk?'Упатства за нега':(sr||hr)?'Saveti za negu':'Care Guide',
    fixedQ:    de?'Hat das geholfen?':fr?'Cela a-t-il aidé?':es?'¿Ha ayudado?':it?'Ha aiutato?':mk?'Дали помогна?':(sr||hr)?'Da li je pomoglo?':'Did this help?',
    fixedY:    de?'✅ Ja, hat geholfen!':fr?'✅ Oui, aidé!':es?'✅ Sí, ayudó!':it?'✅ Sì, ha aiutato!':mk?'✅ Да, помогна!':(sr||hr)?'✅ Da, pomoglo!':'✅ Yes, helped!',
    fixedN:    de?'❌ Weitere Hilfe nötig':fr?'❌ Aide supplémentaire':es?'❌ Más ayuda necesaria':it?'❌ Serve altro aiuto':mk?'❌ Потребна е уште помош':(sr||hr)?'❌ Potrebna dodatna pomoć':'❌ More help needed',
    proBtn:    de?'Tierarzt finden':fr?'Trouver un vétérinaire':es?'Buscar veterinario':it?'Trova veterinario':mk?'Најди ветеринар':(sr||hr)?'Nađi veterinara':'Find a Vet',
    partsBtn:  de?'Produkte suchen':fr?'Chercher produits':es?'Buscar productos':it?'Cerca prodotti':mk?'Барај производи':(sr||hr)?'Traži proizvode':'Find Products',
    loading:   de?['Problem wird analysiert…','Symptome werden erkannt…','Pflegehinweise werden erstellt…','Tierarzt-Empfehlungen werden gesucht…']:
               fr?['Analyse du problème…','Identification des symptômes…','Préparation des conseils…','Recherche vétérinaire…']:
               es?['Analizando el problema…','Identificando síntomas…','Preparando consejos…','Buscando veterinario…']:
               mk?['Анализа на проблемот…','Препознавање на симптомите…','Подготовка на совети…','Барање ветеринар…']:
               (sr||hr)?['Analiza problema…','Prepoznavanje simptoma…','Priprema saveta…','Traženje veterinara…']:
               ['Analyzing the problem…','Identifying symptoms…','Preparing care advice…','Finding vet recommendations…'],
  };
  if (isGarden) return {
    tools:     de?'Benötigte Materialien':fr?'Matériaux nécessaires':es?'Materiales necesarios':it?'Materiali necessari':mk?'Потребни материјали':(sr||hr)?'Potrebni materijali':'Materials Needed',
    parts:     de?'Empfohlene Gartenprodukte':fr?'Produits de jardin':es?'Productos de jardín':it?'Prodotti da giardino':mk?'Градинарски производи':(sr||hr)?'Vrtni proizvodi':'Garden Products',
    steps:     de?'Pflegeschritte':fr?'Étapes de soin':es?'Pasos de cuidado':it?'Passi di cura':mk?'Чекори за нега':(sr||hr)?'Koraci nege':'Care Steps',
    fixedQ:    de?'Hat das geholfen?':fr?'Cela a-t-il aidé?':es?'¿Ha ayudado?':it?'Ha aiutato?':mk?'Дали помогна?':(sr||hr)?'Da li je pomoglo?':'Did this help?',
    fixedY:    de?'✅ Ja, Problem gelöst!':lang==='tr'?'✅ Evet, çözüldü!':lang==='pl'?'✅ Tak, rozwiązane!':'✅ Yes, sorted!',
    fixedN:    de?'❌ Noch nicht gelöst':lang==='tr'?'❌ Hâlâ çözülmedi':lang==='pl'?'❌ Nadal nie rozwiązane':'❌ Still not solved',
    proBtn:    de?'Gärtner finden':lang==='tr'?'Bahçıvan bul':lang==='pl'?'Znajdź ogrodnika':'Find a Gardener',
    partsBtn:  de?'Gartenprodukte suchen':lang==='tr'?'Bahçe ürünleri bul':lang==='pl'?'Znajdź produkty ogrodowe':'Find Garden Products',
    loading:   de?['Gartenproblem wird analysiert…','Ursache wird ermittelt…','Pflegeschritte werden erstellt…','Gartenprodukte werden gesucht…']:
               ['Analyzing garden problem…','Identifying the cause…','Preparing care steps…','Finding garden products…'],
  };
  if (isBike) {
    const tr = lang==='tr', pl = lang==='pl';
    return {
    tools:     de?'Benötigte Werkzeuge':tr?'Gerekli araçlar':pl?'Potrzebne narzędzia':'Tools Needed',
    parts:     de?'Fahrradteile und Zubehör':tr?'Bisiklet parçaları':pl?'Części rowerowe':'Bike Parts & Accessories',
    steps:     de?'Reparaturschritte':tr?'Onarım adımları':pl?'Kroki naprawy':'Repair Steps',
    fixedQ:    de?'Wurde das Problem behoben?':tr?'Sorun çözüldü mü?':pl?'Czy problem został rozwiązany?':'Was the problem fixed?',
    fixedY:    de?'✅ Ja, funktioniert!':tr?'✅ Evet, çalışıyor!':pl?'✅ Tak, działa!':'✅ Yes, working!',
    fixedN:    de?'❌ Noch nicht behoben':tr?'❌ Hâlâ bozuk':pl?'❌ Nadal zepsute':'❌ Not fixed yet',
    proBtn:    de?'Fahrradwerkstatt finden':tr?'Bisiklet tamircisi bul':pl?'Znajdź serwis rowerowy':'Find Bike Shop',
    partsBtn:  de?'Fahrradteile suchen':tr?'Bisiklet parçası bul':pl?'Znajdź części rowerowe':'Find Bike Parts',
    loading:   de?['Fahrradproblem wird analysiert…','Ursache wird ermittelt…','Reparaturschritte werden erstellt…','Fahrradteile werden gesucht…']:
               tr?['Bisiklet sorunu analiz ediliyor…','Neden araştırılıyor…','Onarım adımları hazırlanıyor…','Bisiklet parçaları aranıyor…']:
               pl?['Analiza problemu rowerowego…','Identyfikacja przyczyny…','Przygotowanie kroków naprawy…','Szukanie części rowerowych…']:
               ['Analyzing bike issue…','Identifying the cause…','Preparing repair steps…','Finding bike parts…'],
  };}
  // Default: repair (home, appliances, car, tech)
  return {
    tools:     de?'Benötigte Werkzeuge':fr?'Outils nécessaires':es?'Herramientas necesarias':it?'Strumenti necessari':mk?'Потребни алатки':(sr||hr)?'Potrebni alati':lang==='tr'?'Gerekli araçlar':lang==='pl'?'Potrzebne narzędzia':'Tools Needed',
    parts:     de?'Benötigte Teile':fr?'Pièces nécessaires':es?'Piezas necesarias':it?'Parti necessarie':mk?'Потребни делови':(sr||hr)?'Potrebni delovi':lang==='tr'?'Gerekli parçalar':lang==='pl'?'Potrzebne części':'Parts Needed',
    steps:     de?'Reparaturschritte':fr?'Étapes de réparation':es?'Pasos de reparación':it?'Passi di riparazione':mk?'Чекори за поправка':(sr||hr)?'Koraci popravke':lang==='tr'?'Onarım adımları':lang==='pl'?'Kroki naprawy':'Repair Steps',
    fixedQ:    de?'Hat das geholfen?':fr?'Cela a-t-il résolu?':es?'¿Se resolvió?':it?'Il problema è risolto?':mk?'Дали се поправи?':(sr||hr)?'Da li je popravljeno?':'Did this fix it?',
    fixedY:    de?'✅ Ja, behoben!':fr?'✅ Oui, résolu!':es?'✅ Sí, solucionado!':it?'✅ Sì, risolto!':mk?'✅ Да, поправено!':(sr||hr)?'✅ Da, popravljeno!':lang==='tr'?'✅ Evet, çözüldü!':lang==='pl'?'✅ Tak, naprawione!':'✅ Yes, fixed!',
    fixedN:    de?'❌ Noch defekt':fr?'❌ Toujours en panne':es?'❌ Aún defectuoso':it?'❌ Ancora rotto':mk?'❌ Сè уште дефектно':(sr||hr)?'❌ Još uvek pokvareno':lang==='tr'?'❌ Hâlâ bozuk':lang==='pl'?'❌ Nadal zepsute':'❌ Still broken',
    proBtn:    de?'Fachmann finden':fr?'Trouver un pro':es?'Buscar profesional':it?'Trova professionista':mk?'Најди стручњак':(sr||hr)?'Nađi stručnjaka':lang==='tr'?'Usta bul':lang==='pl'?'Znajdź fachowca':'Find Professional',
    partsBtn:  cat==='car'?(de?'Autoteile finden':lang==='tr'?'Araba parçası bul':lang==='pl'?'Znajdź części do auta':'Find Auto Parts'):
             cat==='tech'?(de?'Ersatzteile finden':lang==='tr'?'Yedek parça bul':lang==='pl'?'Znajdź części zamienne':'Find Spare Parts'):
             cat==='appliances'?(de?'Ersatzteile finden':lang==='tr'?'Yedek parça bul':lang==='pl'?'Znajdź części zamienne':'Find Spare Parts'):
               (de?'Teile finden':'Find Parts'),
    loading:   de?['Problem wird analysiert…','Ursache wird ermittelt…','Reparaturschritte werden erstellt…','Teile und Werkzeuge werden gesucht…']:
               fr?['Analyse du problème…','Identification de la cause…','Préparation des étapes…','Recherche des pièces…']:
               es?['Analizando tu problema…','Identificando la causa…','Preparando los pasos…','Buscando repuestos…']:
               it?['Analisi del problema…','Identificazione della causa…','Preparazione dei passi…','Ricerca dei ricambi…']:
               mk?['Анализа на проблемот…','Откривање на причината…','Подготовка на чекорите…','Барање делови…']:
               (sr||hr)?['Analiza problema…','Otkrivanje uzroka…','Priprema koraka…','Traženje delova…']:
               lang==='tr'?['Problem analiz ediliyor…','Neden araştırılıyor…','Onarım adımları hazırlanıyor…','Parça ve araçlar bulunuyor…']:
               lang==='pl'?['Analiza problemu…','Identyfikacja przyczyny…','Przygotowanie kroków…','Szukanie części i narzędzi…']:
               ['Analyzing your problem…','Identifying the cause…','Preparing repair steps…','Finding parts and tools…'],
  };
}

const CSS = `
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.15}}
@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes slideUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
@keyframes toast{0%{opacity:0;transform:translateY(10px)}20%,80%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-10px)}}
::-webkit-scrollbar{display:none}
*{-webkit-tap-highlight-color:transparent;box-sizing:border-box}
`;

export default function App() {
  const [lang, setLang]           = useState(() => SS.get('lang') || 'en');
  const [selLang, setSelLang]     = useState('en');
  const [showLP, setShowLP]       = useState(false);
  const [screen, setScreen]       = useState('splash'); // always start at splash; restore happens in boot effect
  const [prevScr, setPrevScr]     = useState('home');
  const [curFix, setCurFix]       = useState(() => SS.get('curFix') || 'home');
  const [photo, setPhoto]         = useState(null);
  const [photoB64, setPhotoB64]   = useState(null);
  const [photoMime, setPhotoMime] = useState(null);
  const [vType, setVType]         = useState('car');
  const [vInput, setVInput]       = useState('');
  const [pInput, setPInput]       = useState('');
  const [pResults, setPResults]   = useState(null);
  const [hsnModel, setHsnModel]     = useState(''); // extra model field when HSN/TSN entered
  const [mapCat, setMapCat]       = useState('garage');
  const [emrgKey, setEmrgKey]     = useState(null);
  const [aiMsgIdx, setAiMsgIdx]   = useState(0);
  const [feedback, setFeedback]   = useState(null); // null | 'fixed' | 'broken'
  const [freeLimitHit, setFreeLimitHit] = useState(false); // shown when free diagnosis already used
  const [toast, setToast]         = useState(null);
  const [history, setHistory]     = useState(() => LS.get('history') || []);
  const [showHistory, setShowHistory] = useState(false);
  const [nearbyBump, setNearbyBump]   = useState(0); // increment to force nearby refresh
  const [isOnline, setIsOnline]   = useState(navigator.onLine);
  const [showPWA, setShowPWA]     = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [onboardSlide, setOnboardSlide] = useState(0);
  const [totalSaved, setTotalSaved]   = useState(() => LS.get('totalSaved') || 0);
  const [profile, setProfile]         = useState(() => LS.get('profile') || null); // {vehicles:[], home:{}}
  const problemRef = useRef('');
  const diagCategoryRef = useRef('home'); // category of CURRENT diagnosis
  const aiMsgTimer = useRef(null);
  const pwaPrompt  = useRef(null);

  const { lat, lng, city, country, locStatus, requestLocation, getCC } = useLocation();
  const { result: aiResult, loading: aiLoading, error: aiError, diagnose, reset: aiReset } = useAI();
  const { bizs, loading: bizLoading, error: bizError, fetchBiz } = useNearby();

  const t   = useCallback(k => tx(lang, k), [lang]);
  const cc  = getCC(lang);
  const cd  = getCountry(cc);
  const mu  = useCallback(q => mapsUrlFor(q, lat, lng, cc, lang), [lat, lng, cc, lang]);

  // Boot
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const bl = (navigator.language||'en').substring(0,2).toLowerCase();
    setSelLang(LANGS[bl] ? bl : 'en');
    const tm = setTimeout(() => {
      // Check onboarding
      if (!LS.get('onboarding_done')) {
        setScreen('onboarding');
      } else {
        setScreen('splash-r');
      }
    }, 900);

    // Restore state from a previous session if user navigated away (e.g. opened a store tab)
    // visibilitychange fires on tab return; pageshow handles Safari bfcache
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const savedLang   = SS.get('lang');
        const savedFix    = SS.get('curFix');
        if (savedLang) setLang(l => l !== savedLang ? savedLang : l);
        if (savedFix)  setCurFix(f => f !== savedFix ? savedFix : f);
        // If we have a saved diagnosis and were on result screen, stay there
        // (screen is already set; just make sure we don't reset to splash)
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Online/offline detection
    const goOnline  = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    // PWA install prompt
    const handleInstall = e => { e.preventDefault(); pwaPrompt.current = e; };
    window.addEventListener('beforeinstallprompt', handleInstall);

    // PWA visit counter
    const visits = (LS.get('visits') || 0) + 1;
    LS.set('visits', visits);
    if (visits >= 3 && !LS.get('pwa_dismissed') && !window.matchMedia('(display-mode: standalone)').matches) {
      setTimeout(() => setShowPWA(true), 5000);
    }

    return () => {
      document.head.removeChild(style);
      clearTimeout(tm);
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('beforeinstallprompt', handleInstall);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // AI loading message cycle
  useEffect(() => {
    if (aiLoading) {
      setAiMsgIdx(0);
      aiMsgTimer.current = setInterval(() => {
        setAiMsgIdx(i => {
          const msgs = AI_MSGS[lang] || AI_MSGS.en;
          return (i + 1) % msgs.length;
        });
      }, 2200);
    } else {
      clearInterval(aiMsgTimer.current);
    }
    return () => clearInterval(aiMsgTimer.current);
  }, [aiLoading, lang]);

  // Nearby fetch: triggered by nearbyBump (incremented by goto+category change+refresh),
  // also by GPS arrival. nearbyBump guarantees re-fetch even if screen hasn't changed.
  useEffect(() => {
    if (screen === 'nearby' && lat && lng) {
      fetchBiz(mapCat, lat, lng);
    }
  }, [nearbyBump, mapCat, lat, lng]); // mapCat in deps ensures chip + reset both trigger

  // Persist key UI state so returning from external store tab restores correctly
  useEffect(() => {
    if (lang) SS.set('lang', lang);
  }, [lang]);

  useEffect(() => {
    if (curFix) SS.set('curFix', curFix);
  }, [curFix]);

  useEffect(() => {
    // Persist screen — but not splash/onboarding/loc-ask (transient boot screens)
    if (screen && !['splash','splash-r','onboarding','loc-ask'].includes(screen)) {
      SS.set('lastScreen', screen);
    }
  }, [screen]);

  useEffect(() => {
    if (aiResult) {
      SS.set('aiResult', aiResult);
      SS.set('aiProblem', problemRef.current);
    }
  }, [aiResult]);

  // Restore diagnosis when user returns from external tab (iPhone Safari pageshow)
  useEffect(() => {
    const handlePageShow = (e) => {
      // e.persisted = true means Safari restored from bfcache (back from external tab)
      if (e.persisted) {
        const savedScreen = SS.get('lastScreen');
        const savedResult = SS.get('aiResult');
        // Only restore to result screen if we have a saved diagnosis
        if (savedResult && savedScreen === 'result') {
          // Don't call goto() — just set screen directly to avoid side effects
          setScreen('result');
        }
      }
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []); // eslint-disable-line

  // Save to history when AI result arrives (top-level, legal)
  useEffect(() => {
    if (aiResult) saveToHistory(aiResult, problemRef.current);
  }, [aiResult]); // eslint-disable-line

  function goto(s) {
    // Push current screen to history before navigating (skip transient screens)
    const skip = ['splash','splash-r','onboarding','loc-ask'];
    if (!skip.includes(screen) && screen !== s) {
      setHistory(h => [...h.slice(-19), screen]); // keep last 20 screens
    }
    setScreen(s);
    if (s === 'nearby') {
      setMapCat('garage');
      setNearbyBump(b => b + 1);
    }
    if (s !== 'result') setFeedback(null);
  }

  function goBack() {
    setHistory(h => {
      if (h.length === 0) { setScreen('home'); return h; }
      const prev = h[h.length - 1];
      setScreen(prev);
      return h.slice(0, -1);
    });
  }

  // Back button — always shows when history has entries (or when forced via onPress)
  const BackBtn = ({ onPress } = {}) => {
    const canGoBack = history.length > 0 || !!onPress;
    if (!canGoBack) return null;
    return (
      <button onClick={onPress || goBack} style={{
        background:'transparent', border:'none', color:C.m, cursor:'pointer',
        fontSize:'0.85rem', fontWeight:600, padding:'4px 0', fontFamily:'inherit',
        display:'flex', alignItems:'center', gap:4, marginBottom:8,
      }}>
← {lang==='de'?'Zurück':lang==='fr'?'Retour':lang==='es'?'Atrás':lang==='it'?'Indietro':
(lang==='mk')?'Назад':(lang==='sr'||lang==='hr')?'Natrag':lang==='tr'?'Geri':lang==='pl'?'Wstecz':'Back'}
      </button>
    );
  };

  function openFix(cat) {
    setCurFix(cat);
    setPrevScr('home');
    clearPhoto();
    problemRef.current = '';   // always start fresh when switching category
    goto('fix-now');
  }

  function clearPhoto() {
    setPhoto(null); setPhotoB64(null); setPhotoMime(null);
  }

  function confirmLang() { setLang(selLang); goto('loc-ask'); }

  function detectMime(b64) {
    // Detect real image type from base64 magic bytes — never trust browser MIME alone
    if (b64.startsWith('/9j/'))   return 'image/jpeg';
    if (b64.startsWith('iVBOR'))  return 'image/png';
    if (b64.startsWith('UklGR'))  return 'image/webp';
    if (b64.startsWith('R0lGO'))  return 'image/gif';
    return null; // unknown / unsupported
  }

  function handlePhoto(e) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      const dataUrl = ev.target.result;
      const b64 = dataUrl.split(',')[1];
      const realMime = detectMime(b64);

      if (!realMime) {
        // HEIC, TIFF, BMP or other unsupported format
        showToast(lang === 'de'
          ? '⚠️ Bildformat nicht unterstützt. Bitte JPG, PNG oder WebP verwenden.'
          : '⚠️ Image format not supported. Please upload JPG, PNG or WebP.');
        return;
      }

      setPhoto(dataUrl);
      setPhotoB64(b64);
      setPhotoMime(realMime); // always use detected MIME, not browser's f.type
    };
    r.readAsDataURL(f);
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function runAI(override) {
    // Read textarea DOM directly as fallback — catches any onChange race conditions
    if (!override) {
      const el = document.getElementById('fixit-problem-input');
      if (el && el.value.trim()) problemRef.current = el.value.trim();
    }
    const prob = override ?? problemRef.current;
    if (!prob && !photoB64) { showToast(t('descProblem')); return; } // toast, never alert
    // For preset taps OR text-only runs: clear any stale photo state
    // Only keep photo if user has a visible photo AND no override text
    if (override || (!photo && photoB64)) clearPhoto();
    // ALWAYS clear old parts search state — never reuse from a previous diagnosis
    setPResults(null);
    setVInput('');
    setPInput('');
    setHsnModel('');
    diagCategoryRef.current = curFix;
    setPrevScr('fix-now');
    // ── Free device limit check ──────────────────────────────────────────────
    // Safety/emergency prompts ALWAYS bypass this limit.
    // A user smelling gas or seeing live wires must never hit a paywall.
    const EMERGENCY_BYPASS = /gas\s*(leak|geruch|smell|riecht|ausströmt|ausströmend)|gas\s+im\s+(haus|raum|bad|keller|zimmer|küche)|riecht\s+nach\s+gas|gasleitung|gasherd\s*(aus|def|kaput|explod)|live\s*(wire|cable|mains)|240v|230v\s*(kabel|leitung|draht)|stromschlag|elektroschock|sicherungskasten|breaker\s*box|load.?bearing|tragende\s+wand|asbest|asbestos|notfall|emergency|feuerwehr|fire\s*(dept|depart)|notruf/i;
    const probText = (prob || '').toLowerCase();
    const isEmergency = EMERGENCY_BYPASS.test(probText);

    const freeUsed = LS.get('free_diagnosis_used');
    if (freeUsed && !isEmergency) {
      setFreeLimitHit(true);
      goto('home');
      return;
    }
    setFeedback(null);
    goto('result');
    await diagnose({ problem: prob, photoB64: override ? null : photoB64, photoMime: override ? null : photoMime, category: curFix, lang, countryName: cd.name, userProfile: profile });
  }

  function saveToHistory(result, prob) {
    if (!result) return;
    // Mark free diagnosis as used ONLY for real repair guides (not safety hard-stops)
    // callPro=true means it's a safety block — keep those free always
    if (!result.callPro && !result._fallback) {
      LS.set('free_diagnosis_used', true);
    }
    // Parse estimatedCost into a number for savings tracking
    // Format: "€5–15", "£10–25", "$8" — extract midpoint
    function parseSaving(costStr) {
      if (!costStr) return 0;
      const nums = (costStr.match(/[\d]+/g) || []).map(Number);
      if (nums.length === 0) return 0;
      if (nums.length === 1) return nums[0];
      return Math.round((nums[0] + nums[nums.length-1]) / 2); // midpoint
    }
    const savedAmt = parseSaving(result.estimatedCost);
    // NOTE: totalSaved is NOT incremented here.
    // It is only incremented when the user confirms "Yes, fixed!" (handleFeedback).
    // savedAmt is stored on the history entry so handleFeedback can use it.

    const entry = {
      id: Date.now(),
      problem: prob || problemRef.current || 'Photo diagnosis',
      diagnosis: result.diagnosis?.substring(0, 120),
      confidence: result.confidence,
      estimatedCost: result.estimatedCost || '',
      savedAmt,
      category: curFix,
      date: new Date().toISOString(),
      cc,
      fixed: null,
    };
    const updated = [entry, ...(history || [])].slice(0, 20);
    setHistory(updated);
    LS.set('history', updated);
  }

  function handleFeedback(val) {
    setFeedback(val);
    const updated = (history || []).map((h, i) => i === 0 ? {...h, fixed: val === 'fixed'} : h);
    setHistory(updated);
    LS.set('history', updated);

    // Only count savings when user CONFIRMS the repair worked
    if (val === 'fixed') {
      const thisEntry = (history || [])[0];
      const amt = thisEntry?.savedAmt || 0;
      if (amt > 0) {
        const prev = LS.get('totalSaved') || 0;
        const next = prev + amt;
        LS.set('totalSaved', next);
        setTotalSaved(next);
      }
    }
  }

  async function handleShare() {
    const r = aiResult;
    if (!r) return;

    // Build share text
    const savedLine = r.estimatedCost ? (
      lang==='de' ? `Mögliches Sparpotenzial: ca. ${r.estimatedCost}` :
      lang==='tr' ? `Tahmini tasarruf: yaklaşık ${r.estimatedCost}` :
      lang==='pl' ? `Potencjalne oszczędności: ok. ${r.estimatedCost}` :
      `Estimated savings: approx. ${r.estimatedCost}`
    ) : '';
    const shareText = [
      lang==='de' ? '🔧 Gerade selbst repariert mit FixIt!' :
      lang==='tr' ? '🔧 FixIt ile kendim tamir ettim!' :
      lang==='pl' ? '🔧 Sam naprawiłem z FixIt!' :
      '🔧 Just fixed it myself with FixIt!',
      savedLine,
      r.status || '',
      `fixit-app.vercel.app`,
    ].filter(Boolean).join('\n');

    // Try canvas share card first, fall back to text share
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1080; canvas.height = 1080;
      const ctx = canvas.getContext('2d');
      // Background
      const grad = ctx.createLinearGradient(0, 0, 1080, 1080);
      grad.addColorStop(0, '#1f0c00'); grad.addColorStop(1, '#0A0908');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, 1080, 1080);
      // Orange accent bar
      ctx.fillStyle = '#E8521A'; ctx.fillRect(0, 0, 8, 1080);
      // FIXIT logo
      ctx.font = 'bold 80px system-ui'; ctx.fillStyle = '#ffffff';
      ctx.fillText('FIX', 80, 130);
      ctx.fillStyle = '#E8521A'; ctx.fillText('IT', 248, 130);
      // Emoji + status
      ctx.font = '120px system-ui'; ctx.fillText('🔧', 80, 320);
      ctx.font = 'bold 56px system-ui'; ctx.fillStyle = '#4ade80';
      ctx.fillText(lang==='de'?'Problem behoben!':lang==='tr'?'Problem çözüldü!':lang==='pl'?'Naprawione!':'Fixed it!', 80, 420);
      // Problem
      const prob = (problemRef.current || '').substring(0, 45);
      ctx.font = '36px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(prob, 80, 490);
      // Savings
      if (r.estimatedCost) {
        ctx.font = 'bold 100px system-ui'; ctx.fillStyle = '#4ade80';
        ctx.fillText(r.estimatedCost, 80, 640);
        ctx.font = 'bold 36px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(lang==='de'?'Sparpotenzial (ca.)':lang==='tr'?'tahmini tasarruf':lang==='pl'?'potencjalne oszczędności':'est. savings', 80, 700);
      }
      // URL
      ctx.font = '28px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillText('fixit-app.vercel.app', 80, 1020);

      canvas.toBlob(async blob => {
        if (blob && navigator.share && navigator.canShare?.({ files: [new File([blob], 'fixit.png', {type:'image/png'})] })) {
          await navigator.share({ files: [new File([blob], 'fixit.png', {type:'image/png'})], title: 'FixIt', text: shareText });
        } else if (blob) {
          // Download the image
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'fixit-repair.png';
          a.click();
          // Also try text share
          if (navigator.share) await navigator.share({ title: 'FixIt', text: shareText, url: window.location.href });
        } else if (navigator.share) {
          await navigator.share({ title: 'FixIt', text: shareText, url: window.location.href });
        }
      }, 'image/png');
    } catch (e) {
      // Final fallback: copy to clipboard
      try { await navigator.clipboard.writeText(shareText + '\n' + window.location.href); setToast('✅ Copied!'); }
      catch (_) {}
    }
  }

  function extractSearchableProduct(raw, category) {
    if (!raw) return '';
    const s = raw.trim();

    // Pattern: "Kein ... – nur X erforderlich/benötigt" → extract X
    const nurMatch = s.match(/nur\s+(.+?)(?:\s+(?:erforderlich|benötigt|needed|required))?[–\-]?\s*$/i) ||
                     s.match(/only\s+(?:a\s+|an\s+)?(.+?)(?:\s+(?:required|needed))?$/i);
    if (nurMatch) {
      const extracted = nurMatch[1].trim().replace(/\s+(erforderlich|benötigt|needed|required)$/i, '').trim();
      if (extracted.length > 1) return extracted;
    }

    // Pattern: "X oder Y" → take first item only
    const oderMatch = s.match(/^([^–\-,]+?)\s+(?:oder|or)\s+/i);
    if (oderMatch && !s.toLowerCase().startsWith('kein') && !s.toLowerCase().startsWith('no ')) {
      return oderMatch[1].trim();
    }

    // Pattern: "Kein Ersatzteil nötig..." whole sentence starting with negation → return empty
    // so the caller falls back to problem context
    if (/^(kein|keine|no\s+replacement|no\s+part)/i.test(s)) {
      // Try to find tool/product after "nur" / "only"
      const fallback = s.match(/(?:nur|only)\s+(?:ein\s+|eine\s+|a\s+|an\s+)?([A-ZÄÖÜ][a-zäöüA-ZÄÖÜ0-9\-]+)/);
      if (fallback) return fallback[1];
      return ''; // signal: no part, use context
    }

    return ''; // no special pattern matched — let cleanProductSearchQuery handle it
  }

  // Clean AI-generated part name into a real buyable search query.
  // Call signature: (partName, _unused, category, brandOrModel, _unused2)
  // All callers: cleanProductSearchQuery(part, '', category, brand, '')
  function cleanProductSearchQuery(partName, _d, category, brandOrModel, _l) {
    if (!partName) return '';
    let q = partName.trim();

    // SHORT QUERY BYPASS: if already 2-5 words and no filler patterns, return as-is
    // New AI prompt generates short purchasable queries — don't mangle them
    const wordCount = q.split(/\s+/).length;
    const hasFillerPattern = /passend|Ersatzteil|kompatibel|für das|für den|für die|zur Reparatur|zum Modell/i.test(q);
    if (wordCount <= 5 && !hasFillerPattern) return q;

    // 1. Strip ALL parenthetical content (prices, conditions, explanations)
    q = q.replace(/\([^)]*\)/gi, '');

    // 2. Strip prices like €10-30, €5, 10€, $15
    q = q.replace(/€\s*[\d.,]+(-[\d.,]+)?/g, '');
    q = q.replace(/[\d.,]+\s*€/g, '');
    q = q.replace(/\$\s*[\d.,]+/g, '');

    // 3. Truncate at connectors — keep only the primary product name
    // "WLAN-Repeater bei schlechter Abdeckung" → "WLAN-Repeater"
    // "Neemöl oder pflanzliches Insektizid" → "Neemöl"
    q = q.replace(/\s+(?:oder|or)\s+.*/i, '');  // strip alternatives after "oder/or"
    q = q.replace(/\s+(bei\s+\w|\bfalls\b|\bwenn\b|\bfür\b|\bif\b\s|\bfor\b\s|\bwith\b\s).*/i, '');

    // 4. Strip leading filler words — loop until stable (Ggf. neuer X needs 2 passes)
    const leadingRe = /^(ggf\.?\s*|evtl\.?\s*|optional[:,]?\s*|falls\s+\S+,?\s*|if\s+broken[:,]?\s*|maybe[:,]?\s*|bei\s+Bedarf[:,]?\s*|neue[nrms]?\s+(?=\S)|je\s+nach\s+\S+\s*|possibly[:,]?\s*)/i;
    let _prev = '';
    while (q !== _prev) { _prev = q; q = q.replace(leadingRe, '').trim(); }

    // 5. Remove duplicate consecutive words (case-insensitive): "Beko Beko" → "Beko"
    q = q.replace(/\b(\w+)\s+\1\b/gi, '$1');

    // 5b. Strip common German part-name filler prefixes: "Ersatz-" → ""
    // "Ersatz-Antriebsriemen" → "Antriebsriemen", "Ersatz Dichtung" → "Dichtung"
    q = q.replace(/\bErsatz[-\s]/gi, '');
    q = q.replace(/\bReplacement\b\s*/gi, '');

    // 6a. Strip everything after em-dash or long dash (explanatory suffix)
    q = q.replace(/\s*[–—].*$/, '').trim();

    // 6b. Collapse multiple spaces
    q = q.replace(/\s{2,}/g, ' ').trim();

    // Fallback if everything was stripped
    if (!q) q = (category || 'repair part').trim();

    // Prepend brand/model when provided and not already in query
    // Skip for pets/garden (no brands), skip 2-letter country codes (de, en, fr)
    const brand = (brandOrModel || '').trim();
    const isPureLang = /^[a-z]{2}$/i.test(brand); // reject "de", "en", "fr" etc.
    const skipCats  = ['pets', 'garden'].includes(category);
    if (brand && !isPureLang && !skipCats) {
      const brandWord = brand.toLowerCase().split(' ')[0];
      if (!q.toLowerCase().includes(brandWord)) {
        q = brand.split(' ').slice(0, 4).join(' ') + ' ' + q;
      }
    }

    return q.trim();
  }

  // Maps common symptom phrases to buyable product search terms
  function symptomToProducts(prob, cat, lang) {
    const p = prob.toLowerCase();
    const de = lang === 'de';
    // Garden
    if (cat === 'garden') {
      if (/pflanzen.*sterb|pflanzen.*gelb|vergilb/i.test(p)) return de ? 'Pflanzendünger Blumenerde pH-Test' : 'plant fertilizer potting soil';
      if (/schädling|insekt|blattlaus/i.test(p)) return de ? 'Schädlingsspray Insektenmittel' : 'pest spray insecticide';
      if (/rasen|gras/i.test(p)) return de ? 'Rasensamen Rasendünger' : 'grass seed lawn fertilizer';
      if (/unkraut/i.test(p)) return de ? 'Unkrautvernichter Unkrautstecher' : 'weed killer';
      return ''; // no match — use raw query is ok for garden tools
    }
    // Car
    if (cat === 'car') {
      if (/springt nicht an|startet nicht|start/i.test(p)) return de ? 'Autobatterie Starthilfekabel Anlasser' : 'car battery jump leads starter motor';
      if (/überhitz|kühlwasser|temperatur/i.test(p)) return de ? 'Kühlmittel Thermostat Kühlerschlauch' : 'coolant thermostat radiator hose';
      if (/öl.*verlier|ölverlust/i.test(p)) return de ? 'Motoröl Dichtring Ölwannendichtung' : 'engine oil seal gasket';
      if (/bremse|bremst/i.test(p)) return de ? 'Bremsbeläge Bremsscheibe' : 'brake pads brake disc';
      if (/reifen|platt/i.test(p)) return de ? 'Reifen Flickset Reifenluft' : 'tyre repair kit tyre pump';
    }
    // Appliances
    if (cat === 'appliances') {
      if (/waschmaschine.*schleuder|schleuder/i.test(p)) return de ? 'Ablaufpumpe Motorkohlen Keilriemen Waschmaschine' : 'washing machine pump motor brushes belt';
      if (/ofen.*heiz|backofen/i.test(p)) return de ? 'Heizelement Ofendichtung Thermostat Backofen' : 'oven heating element door seal thermostat';
      if (/kühlschrank|kühlt nicht/i.test(p)) return de ? 'Kompressor Kühlschrank Thermostat' : 'fridge compressor thermostat';
      if (/spülmaschine/i.test(p)) return de ? 'Spülmaschinenpumpe Sprüharm Dichtung' : 'dishwasher pump spray arm seal';
    }
    // Tech
    if (cat === 'tech') {
      if (/laptop.*langsam|computer.*langsam/i.test(p)) return de ? 'SSD Festplatte RAM Arbeitsspeicher Laptop Reinigung' : 'SSD RAM laptop cleaning';
      if (/lädt nicht|ladekabel|akku/i.test(p)) return de ? 'Ladekabel USB-C Akku Ersatz' : 'charging cable USB-C battery replacement';
      if (/wlan|wifi|internet/i.test(p)) return de ? 'WLAN Repeater Router USB WLAN Stick' : 'WiFi repeater router USB adapter';
      if (/bildschirm|display/i.test(p)) return de ? 'Laptop Display Ersatz Monitor HDMI' : 'laptop screen replacement monitor';
    }
    // Home
    if (cat === 'home') {
      if (/wasserhahn.*tropf|tropfend/i.test(p)) return de ? 'Wasserhahn Dichtung Kartusche Ersatz' : 'tap washer cartridge replacement';
      if (/toilette.*läuft|wc.*läuft/i.test(p)) return de ? 'WC Füllventil Ablaufventil Spülkasten' : 'toilet fill valve flush valve cistern';
      if (/steckdose|schalter|elektro/i.test(p)) return de ? 'Steckdose Lichtschalter Unterputzdose' : 'electrical socket switch outlet box';
      if (/tür.*schließ|schloss/i.test(p)) return de ? 'Türschloss Türband Schließblech' : 'door lock hinge strike plate';
    }
    // Bike
    if (cat === 'bike') {
      if (/bremse|bremst/i.test(p)) return de ? 'Fahrrad Bremsbeläge Bremszug' : 'bike brake pads cable';
      if (/reifen|platt|schlauch/i.test(p)) return de ? 'Fahrradschlauch Flickset Fahrradreifen' : 'inner tube puncture repair kit tyre';
      if (/kette|gangschaltung|schaltz/i.test(p)) return de ? 'Fahrradkette Kassette Schaltwerk' : 'bike chain cassette derailleur';
    }
    return ''; // no match found
  }

  // ── Shop query cleaner ───────────────────────────────────────────────────────
  // Applied before opening any shop URL. Removes "Satz", OEM codes, and
  // overly specific terms that narrow results too much on Autodoc/Amazon.
  function shopQueryClean(q) {
    if (!q) return q;
    let s = q.trim();
    // Remove "Satz" (German for "set/kit" — often narrows too much)
    s = s.replace(/\bSatz\b/gi, '').trim();
    // Remove bare OEM/OE part number patterns (alphanumeric codes like "0250202132", "F026402062")
    // Pattern: word that's mostly digits or looks like a part code (6+ chars, mixed alnum)
    s = s.replace(/\b[A-Z0-9]{2,4}[0-9]{4,}\b/g, '').trim();      // Bosch-style codes
    s = s.replace(/\b[0-9]{8,}\b/g, '').trim();                    // pure long numbers
    s = s.replace(/\b[A-Z][0-9]{6,}\b/g, '').trim();               // F026402062 style
    // Remove trailing/leading filler words left after stripping
    s = s.replace(/\s{2,}/g, ' ').trim();
    s = s.replace(/^(für|for|passend|kompatibel)\s+/i, '').trim();
    return s || q; // never return empty
  }

  function buildPartsQueryFromDiagnosis(result, problem, category, vehicleCtx) {
    const parts = result?.partsNeeded || [];
    const prob  = (problem || '').trim();

    // Build a compact vehicle prefix from detected context (e.g. "BMW X3 2.0d")
    const vPrefix = vehicleCtx
      ? [vehicleCtx.make, vehicleCtx.model, vehicleCtx.engine, vehicleCtx.year]
          .filter(Boolean).join(' ').trim()
      : '';

    // Helper: ensure vehicle prefix is in a query (avoid duplication)
    // Checks for make OR model first-word — so "Golf 7 AGM..." is not re-prefixed with "VW"
    function ensureVehicle(q) {
      if (!vPrefix || !q) return q;
      const qUp = q.toUpperCase();
      const vehicleTokens = [vehicleCtx?.make, (vehicleCtx?.model||'').split(' ')[0]]
        .filter(s => s && s.length > 2);
      const alreadyHasVehicle = vehicleTokens.some(t => qUp.includes(t.toUpperCase()));
      return alreadyHasVehicle ? q : `${vPrefix} ${q}`;
    }

    if (parts.length > 0) {
      // First try smart extraction (handles "Kein Ersatzteil – nur Ladegerät" cases)
      const smart = extractSearchableProduct(parts[0], category);
      if (smart && smart.length > 1) {
        const cleaned = cleanProductSearchQuery(smart, '', category, '', '');
        if (cleaned && cleaned.length > 1) return ensureVehicle(cleaned);
      }
      // Fallback: clean the raw part name
      const first = cleanProductSearchQuery(parts[0], '', category, '', '');
      if (first && first.length > 2) return ensureVehicle(first);
    }
    // Convert symptom text to product query if possible
    const symQuery = symptomToProducts(prob, category, lang);
    if (symQuery) return ensureVehicle(symQuery);
    // Last fallback: cleaned problem text
    if (prob && prob.length < 40) return ensureVehicle(cleanProductSearchQuery(prob, '', category, '', ''));
    return vPrefix || category || 'repair part';
  }

  function findParts() {
    if (!pInput.trim()) return;
    const isHSN = /^\d{4}/.test(vInput.trim());
    // Pass empty brandOrModel — vInput is prepended separately in searchQ below
    // This prevents "trek marlin 6 trek marlin 6 bremsbelag" duplication
    const cleanPart = cleanProductSearchQuery(pInput, '', vType, '', '');
    let searchQ;
    if (isHSN && hsnModel.trim()) {
      searchQ = `${hsnModel.trim()} ${cleanPart}`;
    } else if (isHSN && !hsnModel.trim()) {
      searchQ = `Autoteile ${cleanPart}`;
    } else {
      searchQ = vInput ? `${vInput} ${cleanPart}` : cleanPart;
    }
    setPResults({ q: cleanPart, vehicle: vInput, hsnModel: hsnModel.trim(), searchQ, isHSN, category: vType });
  }

  const hr = new Date().getHours();
  const greeting = hr < 12 ? t('goodMorning') : hr < 18 ? t('goodAfternoon') : t('goodEvening');
  const aiMsgs = AI_MSGS[lang] || AI_MSGS.en;

  // ── ONBOARDING ───────────────────────────────────────────────────────────────
  if (screen === 'onboarding') {
    const slides = [
      { icon:'🔍', title: t('describeYourProblem'), sub: lang==='de'?'Tippe oder fotografiere — die KI analysiert es sofort.':lang==='tr'?'Yaz veya fotoğrafla — yapay zeka hemen analiz eder.':lang==='pl'?'Wpisz lub sfotografuj — AI analizuje natychmiast.':'Type or photograph — AI analyses it instantly.' },
      { icon:'🤖', title: t('getExactSteps'), sub: lang==='de'?'Schritt-für-Schritt-Anleitung mit Bildern und Teilevorschlägen.':lang==='tr'?'Resimler ve parça önerileriyle adım adım kılavuz.':lang==='pl'?'Instrukcja krok po kroku ze zdjęciami i sugestiami części.':'Step-by-step guide with images and parts suggestions.' },
      { icon:'🛒', title: t('findPartsNearYou'), sub: lang==='de'?'Lokale Shops und Online-Preise auf einen Blick.':lang==='tr'?'Yerel mağazalar ve çevrimiçi fiyatlar bir bakışta.':lang==='pl'?'Lokalne sklepy i ceny online na jednym ekranie.':'Local stores and online prices at a glance.' },
    ];
    const slide = onboardSlide;
    const setSlide = setOnboardSlide;
    const isLast = slide === slides.length - 1;
    const done = () => { LS.set('onboarding_done', true); setScreen('splash-r'); };
    return (
      <div style={{position:'absolute',inset:0,background:C.d,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px 28px'}}>
        <button onClick={done} style={{position:'absolute',top:54,right:24,background:'none',border:'none',color:C.m,fontSize:'0.82rem',cursor:'pointer',fontFamily:'inherit'}}>Skip</button>
        <div style={{fontSize:'5rem',marginBottom:24,animation:'slideUp .5s ease'}}>{slides[slide].icon}</div>
        <div style={{fontSize:'1.5rem',fontWeight:800,textAlign:'center',marginBottom:12,letterSpacing:'-0.02em',animation:'slideUp .5s ease'}}>{slides[slide].title}</div>
        <div style={{fontSize:'0.92rem',color:C.m,textAlign:'center',lineHeight:1.65,maxWidth:300,marginBottom:40,animation:'slideUp .5s ease'}}>{slides[slide].sub}</div>
        <div style={{display:'flex',gap:8,marginBottom:32}}>
          {slides.map((_,i)=><div key={i} style={{width:i===slide?24:8,height:8,borderRadius:4,background:i===slide?C.o:'rgba(255,255,255,0.15)',transition:'width .3s'}}/>)}
        </div>
        <button onClick={isLast?done:()=>setSlide(s=>s+1)} style={{...s.btn,maxWidth:300,borderRadius:16,padding:16,fontSize:'1rem'}}>
          {isLast?(lang==='de'?"Los geht's! 🔧":lang==='tr'?'Hadi başlayalım! 🔧':lang==='pl'?'Zaczynamy! 🔧':lang==='mk'?'Ајде да почнеме! 🔧':lang==='hr'?'Počnimo! 🔧':"Let's Fix It! 🔧"):'Next →'}
        </button>
        <style>{CSS}</style>
      </div>
    );
  }

  // ── SPLASH ───────────────────────────────────────────────────────────────────
  if (screen === 'splash' || screen === 'splash-r') {
    const l = LANGS[selLang]||LANGS.en;
    const ts = k => tx(selLang, k);
    const ready = screen === 'splash-r';
    return (
      <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:16,padding:'40px 28px',background:C.d}}>
        {showLP && <LangPicker lang={selLang} setLang={lc=>{setSelLang(lc);setShowLP(false);}} setShowLP={setShowLP} LANGS={LANGS} t={k=>tx(selLang,k)}/>}
        <div style={{fontSize:'3rem',fontWeight:900,letterSpacing:'-0.03em'}}>FIX<span style={{color:C.o}}>IT</span></div>
        <div style={{display:'flex',alignItems:'center',gap:8,fontSize:'0.82rem',color:C.m}}>
          <span style={{width:7,height:7,background:C.o,borderRadius:'50%',animation:'blink .9s infinite',flexShrink:0}}/>
          {ready?ts('langDetected'):ts('detecting')}
        </div>
        <div style={{background:'rgba(232,82,26,0.07)',border:'1px solid rgba(232,82,26,0.2)',borderRadius:22,padding:22,textAlign:'center',width:'100%',maxWidth:340}}>
          <div style={{fontSize:'2.8rem',marginBottom:8}}>{l.f}</div>
          <div style={{fontSize:'1.2rem',fontWeight:800,marginBottom:4}}>{l.n} — {l.na}</div>
        </div>
        {ready && <>
          <button onClick={confirmLang} style={{...s.btn,maxWidth:340,borderRadius:16,padding:16,fontSize:'1rem'}}>
            {ts('continueIn')} {l.na} →
          </button>
          <button onClick={()=>setShowLP(true)} style={{background:'none',border:'none',color:C.m,fontSize:'0.82rem',cursor:'pointer',textDecoration:'underline',fontFamily:'inherit'}}>
            {ts('chooseOther')}
          </button>
        </>}
        <style>{CSS}</style>
      </div>
    );
  }

  // ── LOC-ASK ──────────────────────────────────────────────────────────────────
  if (screen === 'loc-ask') return (
    <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:20,padding:'40px 28px',background:C.d}}>
      <div style={{fontSize:'4rem'}}>📍</div>
      <div style={{fontSize:'1.4rem',fontWeight:800,textAlign:'center'}}>{t('allowLocation')}</div>
      <div style={{fontSize:'0.88rem',color:C.m,textAlign:'center',lineHeight:1.65,maxWidth:300}}>{t('locationDesc')}</div>
      <div style={{display:'flex',flexDirection:'column',gap:10,width:'100%',maxWidth:340}}>
        <button style={{...s.btn,padding:16,borderRadius:16,fontSize:'1rem'}} onClick={()=>{goto('home');requestLocation();}}>📍 {t('allow')}</button>
        <button style={{...s.btn,...s.btnSec,padding:14,borderRadius:16}} onClick={()=>goto('home')}>{t('skipNow')}</button>
      </div>
      <style>{CSS}</style>
    </div>
  );

  // ── HOME ─────────────────────────────────────────────────────────────────────
  if (screen === 'home') return (
    <Screen>
      {showLP && <LangPicker lang={lang} setLang={lc=>{setLang(lc);setShowLP(false);aiReset();setPResults(null);setPInput('');setVInput('');}} setShowLP={setShowLP} LANGS={LANGS} t={t}/>}
      {/* Offline banner */}
      {!isOnline && <div style={{background:'rgba(232,178,26,0.15)',borderBottom:'1px solid rgba(232,178,26,0.3)',padding:'8px 16px',fontSize:'0.72rem',color:C.y,textAlign:'center',flexShrink:0}}>⚠️ Offline mode — emergency info still available</div>}
      {/* Free diagnosis limit message */}
      {freeLimitHit && (
        <div style={{background:'rgba(232,178,26,0.1)',borderBottom:'1px solid rgba(232,178,26,0.2)',
          padding:'16px 20px',display:'flex',alignItems:'flex-start',gap:12}}>
          <span style={{fontSize:'1.2rem',flexShrink:0}}>🔒</span>
          <div style={{flex:1}}>
            <div style={{fontSize:'0.85rem',fontWeight:700,marginBottom:4,color:'rgba(232,178,26,0.9)'}}>
              {lang==='de'?'Du hast deine kostenlose Analyse bereits genutzt.':
               lang==='tr'?'Ücretsiz analizini zaten kullandın.':
               lang==='pl'?'Wykorzystałeś już swoją bezpłatną analizę.':
               'You have already used your free analysis.'}
            </div>
            <div style={{fontSize:'0.72rem',color:'rgba(255,255,255,0.4)',marginBottom:10,lineHeight:1.5}}>
              {lang==='de'?'Die kostenlose Testversion erlaubt aktuell eine Analyse pro Gerät.':
               lang==='tr'?'Ücretsiz deneme şu anda cihaz başına bir analiz sağlar.':
               lang==='pl'?'Bezpłatna wersja próbna umożliwia jedną analizę na urządzenie.':
               'The free trial currently allows one analysis per device.'}
            </div>
            <button onClick={()=>setFreeLimitHit(false)} style={{
              background:'transparent',border:'1px solid rgba(255,255,255,0.15)',
              color:'rgba(255,255,255,0.6)',borderRadius:8,padding:'6px 14px',
              fontSize:'0.75rem',cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>
              {lang==='de'?'Zurück':'Back'}
            </button>
          </div>
        </div>
      )}
      {/* PWA install banner */}
      {showPWA && <div style={{background:'rgba(232,82,26,0.1)',borderBottom:`1px solid ${C.b}`,padding:'10px 16px',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
        <div style={{flex:1,fontSize:'0.78rem'}}>📲 {lang==='de'?'FixIt installieren für schnelleren Zugriff':lang==='tr'?'Daha hızlı erişim için FixIt yükle':lang==='pl'?'Zainstaluj FixIt dla szybszego dostępu':'Install FixIt for faster access'}</div>
        <button onClick={()=>{if(pwaPrompt.current){pwaPrompt.current.prompt();pwaPrompt.current=null;}LS.set('pwa_dismissed',true);setShowPWA(false);}} style={{background:C.o,border:'none',borderRadius:8,padding:'5px 12px',color:'#fff',fontSize:'0.72rem',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Install</button>
        <button onClick={()=>{LS.set('pwa_dismissed',true);setShowPWA(false);}} style={{background:'none',border:'none',color:C.m,fontSize:'0.78rem',cursor:'pointer',fontFamily:'inherit'}}>✕</button>
      </div>}
      <div style={{background:'linear-gradient(160deg,#1f0c00,#0A0908 65%)',padding:'52px 20px 20px',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18}}>
          <div style={{fontSize:'1.5rem',fontWeight:900}}>FIX<span style={{color:C.o}}>IT</span></div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {lat && <div style={{fontSize:'0.7rem',color:C.g,background:'rgba(26,158,92,0.1)',border:'1px solid rgba(26,158,92,0.2)',borderRadius:100,padding:'4px 10px'}}>📍 {city||`${lat.toFixed(2)},${lng.toFixed(2)}`}</div>}
            {history.length > 0 && <button onClick={()=>setShowHistory(true)} style={{background:C.c,border:`1px solid ${C.b}`,borderRadius:100,padding:'5px 10px',fontSize:'0.7rem',cursor:'pointer',color:C.m,fontFamily:'inherit'}}>🕐 {history.length}</button>}
            <button onClick={()=>setShowLP(true)} style={{background:C.c,border:`1px solid ${C.b}`,borderRadius:100,padding:'5px 12px',fontSize:'0.8rem',cursor:'pointer',color:C.m,fontFamily:'inherit'}}>{LANGS[lang]?.f} {lang.toUpperCase()}</button>
          </div>
        </div>
        <div style={{fontSize:'0.78rem',color:C.m,marginBottom:3}}>{greeting}</div>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
          <div style={{fontSize:'1.3rem',fontWeight:800}}>{t('welcome')}</div>
          {totalSaved > 0 && (
            <div style={{display:'flex',flexDirection:'column',gap:2}}>
              <div style={{background:'rgba(26,158,92,0.12)',border:'1px solid rgba(26,158,92,0.25)',
                borderRadius:100,padding:'3px 10px',fontSize:'0.68rem',fontWeight:600,color:C.g,
                display:'flex',alignItems:'center',gap:4,whiteSpace:'nowrap'}}>
                💰 {lang==='de'?'Sparpotenzial':lang==='tr'?'Tahmini tasarruf':lang==='pl'?'Potencjalne oszczędności':'Est. savings'}: <span style={{fontWeight:800}}>ca. €{totalSaved}</span>
              </div>
              <div style={{fontSize:'0.55rem',color:'rgba(255,255,255,0.2)',textAlign:'center',lineHeight:1.3}}>
                {lang==='de'?'Schätzung. Keine Garantie.':lang==='tr'?'Tahmin. Garanti değil.':lang==='pl'?'Szacunek. Brak gwarancji.':'Estimate. No guarantee.'}
              </div>
            </div>
          )}
        </div>
        <div onClick={()=>openFix('home')} style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:16,padding:'14px 16px',display:'flex',alignItems:'center',gap:10,color:C.m,cursor:'pointer'}}>
          🔍 <span>{t('descProblem')}</span>
        </div>
      </div>
      <Scroll>
        {/* History modal */}
        {showHistory && (
          <div onClick={()=>setShowHistory(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:100,display:'flex',alignItems:'flex-end'}}>
            <div onClick={e=>e.stopPropagation()} style={{background:'#151310',borderRadius:'26px 26px 0 0',width:'100%',maxHeight:'70vh',overflowY:'auto',padding:20}}>
              <div style={{fontSize:'1rem',fontWeight:800,marginBottom:16}}>🕐 {lang==='de'?'Verlauf':lang==='tr'?'Tamir Geçmişi':lang==='pl'?'Historia Napraw':lang==='mk'?'Историја':lang==='hr'?'Povijest':'Repair History'}</div>
              {history.map(h=>(
                <div key={h.id} style={{...s.card,marginBottom:8}}>
                  <div style={{fontSize:'0.82rem',fontWeight:700,marginBottom:4}}>{h.problem}</div>
                  <div style={{fontSize:'0.72rem',color:C.m,marginBottom:6}}>{h.diagnosis}</div>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontSize:'0.65rem',color:C.m}}>{new Date(h.date).toLocaleDateString()}</span>
                    {h.fixed===true && <span style={{fontSize:'0.65rem',color:C.g}}>{lang==='de'?'✅ Behoben':lang==='tr'?'✅ Çözüldü':lang==='pl'?'✅ Naprawiono':'✅ Fixed'}</span>}
                    {h.fixed===false && <span style={{fontSize:'0.65rem',color:C.r}}>{lang==='de'?'❌ Nicht behoben':lang==='tr'?'❌ Çözülmedi':lang==='pl'?'❌ Nie naprawiono':'❌ Not fixed'}</span>}
                    <button onClick={()=>{problemRef.current=h.problem;setCurFix('home');setShowHistory(false);goto('result');diagnose({problem:h.problem,category:'home',lang,countryName:cd.name});}} style={{marginLeft:'auto',background:C.o,border:'none',borderRadius:8,padding:'4px 10px',color:'#fff',fontSize:'0.65rem',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>{lang==='de'?'Erneut':'Try again'}</button>
                  </div>
                </div>
              ))}
              {history.length === 0 && <div style={{textAlign:'center',color:C.m,padding:'20px 0'}}>No repairs yet</div>}
              {totalSaved > 0 && <div style={{background:'rgba(26,158,92,0.08)',border:'1px solid rgba(26,158,92,0.18)',borderRadius:10,padding:'10px 14px',marginBottom:12,textAlign:'center'}}>
                <div style={{fontSize:'0.65rem',color:C.m,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:2}}>{lang==='de'?'Mögliches Sparpotenzial mit FixIt':lang==='tr'?'FixIt ile tahmini tasarruf':lang==='pl'?'Potencjalne oszczędności z FixIt':'Estimated savings with FixIt'}</div>
                <div style={{fontSize:'1.5rem',fontWeight:900,color:C.g}}>ca. €{totalSaved}</div>
                <div style={{fontSize:'0.6rem',color:'rgba(255,255,255,0.22)',marginTop:4}}>{lang==='de'?'Schätzung basierend auf typischen Reparaturkosten. Keine Garantie.':lang==='tr'?'Tipik onarım maliyetlerine göre tahmin. Garanti yoktur.':lang==='pl'?'Szacunek oparty na typowych kosztach naprawy. Bez gwarancji.':'Estimate based on typical repair costs. No guarantee.'}</div>
              </div>}
              <button onClick={()=>{setHistory([]);LS.set('history',[]);setTotalSaved(0);LS.set('totalSaved',0);}} style={{...s.btn,...s.btnSec,marginTop:8,fontSize:'0.78rem',padding:'10px'}}>{lang==='de'?'Verlauf löschen':lang==='tr'?'Geçmişi temizle':lang==='pl'?'Wyczyść historię':'Clear history'}</button>
            </div>
          </div>
        )}
        {/* Emergency banner */}
        <div onClick={()=>goto('emergency')} style={{background:'linear-gradient(135deg,#2A0000,#1A0000)',border:'1px solid rgba(214,59,47,0.3)',borderRadius:18,padding:16,display:'flex',alignItems:'center',gap:14,marginBottom:22,cursor:'pointer',animation:'fadeIn .4s ease'}}>
          <span style={{width:8,height:8,background:C.r,borderRadius:'50%',flexShrink:0,animation:'blink 1.2s infinite'}}/>
          <div style={{flex:1}}>
            <div style={{fontSize:'0.7rem',color:C.r,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:2}}>{t('emergencyHelp')}</div>
            <div style={{fontSize:'0.82rem',color:'rgba(255,255,255,0.75)'}}>{t('emergencySubtitle')}</div>
          </div>
          <div style={{color:C.r,fontSize:'1.1rem'}}>→</div>
        </div>
        <div style={{fontSize:'0.68rem',fontWeight:700,color:C.m,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:12}}>{t('whatNeedsFixing')}</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:22}}>
          {[['🏠',t('homeRepair'),'home',true],['🚗',t('carProblems'),'car',false],['📱',t('techDevices'),'tech',false],['🌿',t('garden'),'garden',false],['🍳',t('appliances'),'appliances',false],['🐾',t('petHealth'),'pets',false]].map(([em,nm,cat,hi],i)=>(
            <div key={cat} onClick={()=>openFix(cat)} style={{background:hi?'rgba(232,82,26,0.07)':C.c,border:`1px solid ${hi?'rgba(232,82,26,0.35)':C.b}`,borderRadius:18,padding:16,cursor:'pointer',animation:`fadeIn ${.3+i*.07}s ease`}}>
              <span style={{fontSize:'1.8rem',marginBottom:8,display:'block'}}>{em}</span>
              <div style={{fontSize:'0.85rem',fontWeight:700,marginBottom:3}}>{nm}</div>
              <div style={{fontSize:'0.7rem',color:C.m}}>{t('tapToFix')}</div>
            </div>
          ))}
        </div>
        {/* Location prompt */}
        {!lat && locStatus !== 'loading' && (
          <div style={{...s.card,background:'rgba(26,95,232,0.06)',borderColor:'rgba(26,95,232,0.2)',textAlign:'center'}}>
            <div style={{fontSize:'1.5rem',marginBottom:8}}>📍</div>
            <div style={{fontSize:'0.86rem',fontWeight:700,marginBottom:6}}>{t('enableLocBanner')}</div>
            <div style={{fontSize:'0.75rem',color:C.m,marginBottom:6}}>{t('enableLocDesc')}</div>
            {locStatus === 'denied' && <div style={{fontSize:'0.72rem',color:C.y,marginBottom:8}}>⚠️ {lang==='de'?'GPS-Zugriff verweigert. Einstellungen → Datenschutz → Standort → FixIt.':lang==='tr'?'GPS reddedildi. Ayarlar → Gizlilik → Konum → FixIt.':lang==='pl'?'GPS odmówiony. Ustawienia → Prywatność → Lokalizacja → FixIt.':'GPS denied. Enable in Settings → Privacy → Location → FixIt.'}</div>}
            <button onClick={()=>goto('loc-ask')} style={{...s.btn,width:'auto',padding:'10px 20px',borderRadius:100}}>{t('allow')}</button>
          </div>
        )}
      </Scroll>
      <NavBar screen={screen} t={t} goto={goto}/>
      <style>{CSS}</style>
    </Screen>
  );

  // ── FIX NOW ──────────────────────────────────────────────────────────────────
  if (screen === 'fix-now') return (
    <Screen>
      {showLP && <LangPicker lang={lang} setLang={lc=>{setLang(lc);setShowLP(false);aiReset();setPResults(null);setPInput('');setVInput('');}} setShowLP={setShowLP} LANGS={LANGS} t={t}/>}
      <div style={{padding:'52px 20px 14px',borderBottom:`1px solid ${C.b}`,flexShrink:0}}>
          <BackBtn/>
        <div style={{fontSize:'1.35rem',fontWeight:800,letterSpacing:'-0.02em',marginBottom:4}}>{t('fixItNow')}</div>
        <div style={{fontSize:'0.82rem',color:C.m}}>{t('descOrPhoto')}</div>
      </div>
      {!isOnline && <div style={{background:'rgba(26,95,232,0.1)',padding:'10px 20px',fontSize:'0.78rem',color:C.bl,flexShrink:0}}>🔌 {lang==='de'?'Internetverbindung für KI-Analyse erforderlich.':'Connect to internet to use AI repair guide.'}</div>}
      <Scroll>
        {photo && (
          <div style={{position:'relative',marginBottom:14}}>
            <img src={photo} alt="upload" style={{width:'100%',borderRadius:14,maxHeight:180,objectFit:'cover',display:'block'}}/>
            <button onClick={clearPhoto} style={{position:'absolute',top:8,right:8,background:'rgba(0,0,0,0.65)',border:'none',color:'#fff',borderRadius:'50%',width:28,height:28,cursor:'pointer',fontFamily:'inherit'}}>✕</button>
          </div>
        )}
        <div style={{display:'flex',gap:8,marginBottom:14}}>
          <label style={{flex:1,background:'rgba(232,82,26,0.06)',border:'2px dashed rgba(232,82,26,0.3)',borderRadius:16,padding:'16px 10px',textAlign:'center',cursor:'pointer',display:'block'}}>
            <input type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{display:'none'}}/>
            <div style={{fontSize:'1.6rem',marginBottom:4}}>📷</div>
            <div style={{fontSize:'0.78rem',fontWeight:700,color:C.o}}>{lang==='de'?'Kamera':lang==='fr'?'Caméra':lang==='it'?'Fotocamera':lang==='tr'?'Kamera':lang==='pl'?'Aparat':'Camera'}</div>
          </label>
          <label style={{flex:1,background:'rgba(255,255,255,0.03)',border:'2px dashed rgba(255,255,255,0.12)',borderRadius:16,padding:'16px 10px',textAlign:'center',cursor:'pointer',display:'block'}}>
            <input type="file" accept="image/*" onChange={handlePhoto} style={{display:'none'}}/>
            <div style={{fontSize:'1.6rem',marginBottom:4}}>🖼️</div>
            <div style={{fontSize:'0.78rem',fontWeight:700,color:'rgba(255,255,255,0.55)'}}>{lang==='de'?'Foto hochladen':lang==='fr'?'Importer photo':lang==='it'?'Carica foto':lang==='tr'?'Fotoğraf yükle':lang==='pl'?'Prześlij zdjęcie':'Upload photo'}</div>
          </label>
        </div>
        <div style={s.card}>
          <div style={{fontSize:'0.65rem',color:C.m,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10}}>{t('describeWords')}</div>
          <textarea
            id="fixit-problem-input"
            placeholder={t('descProblem')}
            onChange={e=>{problemRef.current=e.target.value;}}
            defaultValue={problemRef.current}
            style={{...s.inp,resize:'none',height:90,marginBottom:10}}
          />
          <button onClick={()=>runAI()} style={{...s.btn,opacity:!isOnline?0.5:1}} disabled={!isOnline}>{t('getAIGuide')}</button>
        </div>
        <div style={{fontSize:'0.68rem',fontWeight:700,color:C.m,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:12}}>{t('commonProblems')}</div>
        {getQP(lang,curFix).map((p,i)=>(
          <div key={i} onClick={()=>{ if(!isOnline) return; problemRef.current=p.t; runAI(p.t); }} style={{...s.card,display:'flex',alignItems:'center',gap:12,cursor:isOnline?'pointer':'not-allowed',marginBottom:8,opacity:isOnline?1:0.5,animation:`fadeIn ${.25+i*.05}s ease`}}>
            <span style={{fontSize:'1.1rem',flexShrink:0}}>{p.e}</span>
            <span style={{fontSize:'0.85rem',fontWeight:600,flex:1}}>{p.t}</span>
            <span style={{color:C.m}}>→</span>
          </div>
        ))}
      </Scroll>
      <NavBar screen={screen} t={t} goto={goto}/>
      <style>{CSS}</style>
    </Screen>
  );

  // ── RESULT ───────────────────────────────────────────────────────────────────
  if (screen === 'result') {
    const r   = aiResult;
    const pct = r?.confidence||0;
    const col = r?.callPro?C.r:pct<60?C.y:C.g;
    const ci  = 170, off = ci-(ci*pct/100);
    // Normalize AI-generated proSearchQuery to short, local-intent friendly term
    function normalizeProSearch(raw, cat, isDE) {
      if (!raw) return isDE ? 'Werkstatt in der Nähe' : 'repair service near me';
      let q = raw.trim();
      // Strip "oder X" alternatives
      q = q.replace(/\s+(?:oder|or)\s+.*/i, '');
      // Strip "in meiner Nähe" / "near me" if AI added it (we add it via Google Maps)
      q = q.replace(/\s+in\s+meiner\s+Nähe/gi, '').replace(/\s+near\s+me/gi, '').trim();
      // Strip trailing filler
      q = q.replace(/\s*[–—].*$/, '').trim();
      // If still too long (>40 chars), use category default
      if (q.length > 40) {
        const defaults = {
          car: isDE?'Autowerkstatt':'car repair shop',
          bike: isDE?'Fahrradwerkstatt':'bike repair shop',
          tech: isDE?'Elektronik Reparatur':'electronics repair',
          appliances: isDE?'Gerätereparatur':'appliance repair',
          home: isDE?'Handwerker Klempner':'handyman plumber',
          garden: isDE?'Gärtner Gartencenter':'garden center',
          pets: isDE?'Tierarzt':'veterinarian',
        };
        q = defaults[cat] || (isDE?'Fachmann':'repair service');
      }
      return q;
    }
    const isDE = lang === 'de';
    const proQ = normalizeProSearch(r?.proSearchQuery, curFix, isDE)||`${curFix} repair service`;
    const ct  = catTerms(curFix, lang);  // category-aware terminology



    return (
      <Screen>
        {showLP && <LangPicker lang={lang} setLang={lc=>{setLang(lc);setShowLP(false);aiReset();setPResults(null);setPInput('');setVInput('');}} setShowLP={setShowLP} LANGS={LANGS} t={t}/>}
        <div style={{padding:'52px 20px 14px',background:'linear-gradient(160deg,#001a0d,#0A0908 60%)',borderBottom:`1px solid ${C.b}`,flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <BackBtn/>
            {r && <button onClick={handleShare} style={{background:'none',border:`1px solid ${C.b}`,borderRadius:100,padding:'5px 12px',fontSize:'0.72rem',cursor:'pointer',color:C.m,fontFamily:'inherit'}}>↗ {lang==='de'?'Teilen':lang==='tr'?'Paylaş':lang==='pl'?'Udostępnij':'Share'}</button>}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:14}}>
            <div style={{position:'relative',width:68,height:68,flexShrink:0}}>
              <svg viewBox="0 0 68 68" width="68" height="68" style={{transform:'rotate(-90deg)'}}>
                <circle fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" cx="34" cy="34" r="27"/>
                <circle fill="none" stroke={col} strokeWidth="5" strokeLinecap="round" strokeDasharray={ci} strokeDashoffset={r?off:ci} cx="34" cy="34" r="27" style={{transition:'stroke-dashoffset 1s ease'}}/>
              </svg>
              <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.8rem',fontWeight:800}}>{r?`${pct}%`:'…'}</div>
            </div>
            <div>
              <div style={{fontSize:'1rem',fontWeight:800,marginBottom:3,color:r?.callPro?C.r:C.t}}>{r?.status||(aiLoading?(ct.loading||AI_MSGS[lang]||AI_MSGS.en)[aiMsgIdx % (ct.loading||AI_MSGS[lang]||AI_MSGS.en).length]:'…')}</div>
              <div style={{fontSize:'0.75rem',color:C.m}}>{r?`⏱ ${r.timeEstimate} · ${r.estimatedCost}`:(aiLoading?'':'' )}</div>
            </div>
          </div>
        </div>
        <Scroll>
          {/* Loading with cycling messages */}
          {aiLoading && (
            <div style={{textAlign:'center',padding:'40px 20px',display:'flex',flexDirection:'column',alignItems:'center',gap:16}}>
              <div style={{position:'relative',width:60,height:60}}>
                <div style={{position:'absolute',inset:0,border:`3px solid rgba(255,255,255,0.06)`,borderTopColor:C.o,borderRadius:'50%',animation:'spin .8s linear infinite'}}/>
                <div style={{position:'absolute',inset:6,border:`2px solid rgba(255,255,255,0.04)`,borderTopColor:'rgba(232,82,26,0.4)',borderRadius:'50%',animation:'spin 1.2s linear infinite reverse'}}/>
              </div>
              <div style={{fontSize:'0.92rem',color:C.t,fontWeight:600}}>{(ct.loading||AI_MSGS[lang]||AI_MSGS.en)[aiMsgIdx % (ct.loading||AI_MSGS[lang]||AI_MSGS.en).length]}</div>
              <div style={{fontSize:'0.75rem',color:C.m}}>{t('diagnosingWait')}</div>
            </div>
          )}
          {/* Error */}
          {aiError && !aiLoading && (() => {
            const errCode = typeof aiError==='object'?aiError.code:aiError;
            const isKeyIssue  = ['nokey','missing_api_key','invalid_api_key','invalid_api_key_format','badkey'].includes(errCode);
            const isNetworkErr = ['network','anthropic_network_error'].includes(errCode);
            const isOverload   = ['rate_limited','anthropic_overloaded','ai_timeout'].includes(errCode);
            const isBadReq     = ['anthropic_bad_request','anthropic_api_error'].includes(errCode);
            const savedProb    = problemRef.current;
            return (
              <div style={{...s.card,background:isKeyIssue?'rgba(232,178,26,0.06)':'rgba(232,82,26,0.06)',borderColor:isKeyIssue?'rgba(232,178,26,0.25)':'rgba(232,82,26,0.2)',animation:'fadeIn .4s ease'}}>
                <div style={{fontSize:'1.5rem',textAlign:'center',marginBottom:12}}>{isKeyIssue?'⚙️':errCode==='rate_limited'?'⏱️':errCode==='timeout'?'⌛':errCode==='json_parse_fallback'?'🔄':isNetworkErr?'📡':'🔧'}</div>
                <div style={{fontSize:'1rem',fontWeight:800,textAlign:'center',marginBottom:8}}>
                  {isKeyIssue ? t('aiNoKey') :
                    errCode==='rate_limited'        ? (lang==='de'?'Tageslimit erreicht':lang==='tr'?'Günlük limit doldu':lang==='pl'?'Osiągnięto dzienny limit':'Daily limit reached') :
                    errCode==='timeout'             ? (lang==='de'?'Analyse hat zu lange gedauert':lang==='tr'?'Analiz çok uzun sürdü':lang==='pl'?'Analiza trwała zbyt długo':'Analysis timed out') :
                    errCode==='json_parse_fallback' ? (lang==='de'?'Analyse konnte nicht verarbeitet werden':lang==='tr'?'Analiz işlenemedi':lang==='pl'?'Nie udało się przetworzyć analizy':'Analysis could not be processed') :
                    t('aiUnavailable')}
                </div>
                <div style={{fontSize:'0.86rem',color:C.m,textAlign:'center',lineHeight:1.65,marginBottom:savedProb?8:16}}>
                  {isKeyIssue?t('aiNoKeyDesc'):(lang==='de'?'Bitte nochmals versuchen. Deine Eingabe wird erneut gesendet.':lang==='tr'?'Lütfen tekrar dene. Giriş yeniden gönderilecek.':lang==='pl'?'Spróbuj ponownie. Twoje dane zostaną przesłane ponownie.':'Please try again. Your input will be resent.')}
                </div>
                {!isKeyIssue && savedProb && (
                  <div style={{background:'rgba(255,255,255,0.04)',borderRadius:8,padding:'8px 10px',marginBottom:8,fontSize:'0.72rem',color:C.m,lineHeight:1.5}}>
                    📝 {lang==='de'?'Ihr Text':'Your text'}: <em style={{color:C.t}}>{savedProb.substring(0,80)}{savedProb.length>80?'…':''}</em>
                  </div>
                )}

                <button onClick={()=>{ const el=document.getElementById('fixit-problem-input'); if(el&&el.value.trim()) problemRef.current=el.value.trim(); runAI(savedProb||problemRef.current); }} style={s.btn}>{t('tryAgain')}</button>
                <div style={{height:10}}/>
                <button onClick={()=>window.open(mu(proQ), '_blank', 'noopener,noreferrer')} style={{...s.btn,...s.btnSec}}>{ct.proBtn}</button>
              </div>
            );
          })()}
          {/* Results */}
          {r && !aiLoading && <div style={{animation:'fadeIn .4s ease'}}>
            {r.safetyWarning && <div style={{
                ...s.card,
                background: r.warningLevel==='danger' ? 'rgba(214,59,47,0.14)' : 'rgba(214,59,47,0.06)',
                borderColor: r.warningLevel==='danger' ? 'rgba(214,59,47,0.6)' : 'rgba(214,59,47,0.25)',
                borderWidth: r.warningLevel==='danger' ? 2 : 1,
              }}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                <span style={{fontSize:'1.2rem'}}>{r.warningLevel==='danger'?'🚨':'⚠️'}</span>
                <div style={{fontSize:'0.62rem',fontWeight:700,color:C.r,textTransform:'uppercase',letterSpacing:'0.1em'}}>
                  {r.warningLevel==='danger'
                    ? (lang==='de'?'SICHERHEITSWARNUNG — PROFESSIONELLE HILFE ERFORDERLICH':lang==='tr'?'GÜVENLİK UYARISI — UZMAN GEREKLİ':lang==='pl'?'OSTRZEŻENIE BEZPIECZEŃSTWA — WYMAGANY FACHOWIEC':'SAFETY WARNING — PROFESSIONAL REQUIRED')
                    : t('safetyWarning')}
                </div>
              </div>
              <div style={{fontSize:'0.86rem',lineHeight:1.7,color:r.warningLevel==='danger'?'rgba(255,255,255,0.9)':C.t}}>{r.safetyWarning}</div>
            </div>}
            <div style={{...s.card,background:'rgba(26,158,92,0.05)',borderColor:'rgba(26,158,92,0.2)'}}>
              <div style={{fontSize:'0.62rem',fontWeight:700,color:C.g,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8}}>{t('diagnosis')}</div>
              <div style={{fontSize:'0.86rem',lineHeight:1.65,marginBottom:10}}>{r.diagnosis}</div>
              {r._fallback && (
                <div style={{background:'rgba(232,178,26,0.08)',border:'1px solid rgba(232,178,26,0.25)',borderRadius:10,padding:'12px 14px',marginBottom:12}}>
                  <div style={{fontSize:'0.72rem',color:C.y,marginBottom:10}}>
                    ⚡ {lang==='de'?'Schnellanalyse — für vollständige Diagnose erneut versuchen oder Foto hochladen.':'Quick analysis — retry or upload a photo for a complete diagnosis.'}
                  </div>
                  <button onClick={()=>runAI(problemRef.current||undefined)} style={{...s.btn,padding:'10px 16px',fontSize:'0.82rem',width:'auto'}}>
                    🔄 {lang==='de'?'Erneut analysieren':lang==='tr'?'Tekrar analiz et':lang==='pl'?'Analizuj ponownie':'Retry analysis'}
                  </button>
                </div>
              )}
              {r._vehicleCtx && (
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                  <div style={{background:'rgba(26,95,232,0.12)',border:'1px solid rgba(26,95,232,0.2)',
                    borderRadius:100,padding:'4px 10px',fontSize:'0.65rem',fontWeight:700,
                    color:'rgba(100,149,237,0.9)',display:'flex',alignItems:'center',gap:5}}>
                    <span>🚗</span>
                    <span>{[r._vehicleCtx.make,r._vehicleCtx.model,r._vehicleCtx.generation,r._vehicleCtx.engine,r._vehicleCtx.year].filter(Boolean).join(' ')}</span>
                  </div>
                  <div style={{fontSize:'0.6rem',color:'rgba(255,255,255,0.22)'}}>
                    {lang==='de'?'erkannt':lang==='tr'?'algılandı':lang==='pl'?'wykryto':'detected'}
                  </div>
                </div>
              )}
              {r.causes?.length>0 && <div style={{marginBottom:10}}>
                <div style={{fontSize:'0.62rem',fontWeight:700,color:C.m,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>{t('possibleCauses')}</div>
                {r.causes.map((c,i)=><div key={i} style={{display:'flex',gap:8,alignItems:'center',marginBottom:4}}><span style={{fontSize:'0.6rem',color:C.g,flexShrink:0}}>◆</span><span style={{fontSize:'0.8rem',color:'rgba(240,237,232,0.8)'}}>{c}</span></div>)}
              </div>}
              <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                <span style={{padding:'5px 11px',borderRadius:100,fontSize:'0.7rem',fontWeight:600,background:'rgba(26,158,92,0.12)',color:C.g,border:'1px solid rgba(26,158,92,0.2)'}}>⏱ {r.timeEstimate}</span>
                <span style={{padding:'5px 11px',borderRadius:100,fontSize:'0.7rem',fontWeight:600,background:'rgba(26,158,92,0.1)',color:C.g,border:'1px solid rgba(26,158,92,0.2)'}}>
                  💰 {lang==='de'?'Sparpotenzial ca.':lang==='tr'?'Tahmini tasarruf':lang==='pl'?'Potencjał oszczędności':'Est. saving'} {r.estimatedCost}
                </span>
                {r.difficulty && <span style={{padding:'5px 11px',borderRadius:100,fontSize:'0.7rem',fontWeight:600,background:'rgba(26,158,92,0.1)',color:C.g,border:'1px solid rgba(26,158,92,0.2)'}}>{r.difficulty}</span>}
              </div>
            </div>
            {/* Steps with real images */}
            {r.steps?.length>0 && <div style={{...s.card,padding:0,overflow:'hidden'}}>
              <div style={{padding:'14px 14px 6px'}}>
                <div style={{fontSize:'0.62rem',fontWeight:700,color:C.o,textTransform:'uppercase',letterSpacing:'0.1em'}}>{ct.steps}</div>
              </div>
              <div style={{padding:'0 12px 12px',display:'flex',flexDirection:'column',gap:12}}>
                {r.steps.map((st,i)=>{
                  const googleImgUrl = st.imageQuery
                    ? `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(st.imageQuery)}`
                    : null;
                  return (
                    <div key={i} style={{border:`1px solid ${C.b}`,borderRadius:16,overflow:'hidden',background:C.c,animation:`fadeIn ${.4+i*.1}s ease`}}>
                      <div style={{position:'relative',background:'#151210',minHeight:70,display:'flex',alignItems:'center',padding:'12px 14px',gap:12}}>
                        <span style={{fontSize:'2rem',flexShrink:0}}>{st.emoji||'🔧'}</span>
                        <div style={{flex:1}}>
                          <div style={{fontSize:'0.6rem',fontWeight:700,color:C.o,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:3}}>{t('step')} {i+1} {t('of')} {r.steps.length}</div>
                          <div style={{fontSize:'0.78rem',color:C.m,lineHeight:1.4}}>{st.title}</div>
                        </div>
                        {googleImgUrl && (
                          <button onClick={()=>window.open(googleImgUrl, '_blank', 'noopener,noreferrer')} style={{background:'rgba(26,95,232,0.15)',border:'1px solid rgba(26,95,232,0.3)',borderRadius:8,padding:'6px 10px',color:C.bl,fontSize:'0.65rem',fontWeight:700,cursor:'pointer',whiteSpace:'nowrap',flexShrink:0,fontFamily:'inherit'}}>
                            🔍 {lang==='de'?'Bild':lang==='tr'?'Görsel':lang==='pl'?'Obraz':'Image'}
                          </button>
                        )}
                        <div style={{position:'absolute',top:8,left:8,background:C.o,color:'#fff',fontSize:'0.6rem',fontWeight:800,padding:'3px 8px',borderRadius:100}}>{i+1}</div>
                      </div>
                      <div style={{padding:'13px 14px'}}>
                        <div style={{fontSize:'0.9rem',fontWeight:800,marginBottom:6}}>{st.title}</div>
                        <div style={{fontSize:'0.8rem',color:'rgba(240,237,232,0.82)',lineHeight:1.6}}>{st.description}</div>
                        {st.tip && <div style={{display:'flex',gap:8,background:'rgba(232,82,26,0.07)',border:'1px solid rgba(232,82,26,0.18)',borderRadius:10,padding:9,marginTop:10}}>
                          <span>{t('photoTip')}</span>
                          <div style={{fontSize:'0.74rem',color:'rgba(240,237,232,0.7)',lineHeight:1.5,flex:1}}>{st.tip}</div>
                        </div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>}
            {r.tools?.length>0 && <div style={s.card}>
              <div style={{fontSize:'0.62rem',fontWeight:700,color:C.bl,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8}}>{ct.tools}</div>
              <div style={{display:'flex',flexWrap:'wrap'}}>{r.tools.map((tool,i)=><span key={i} onClick={()=>window.open(`https://www.amazon.com/s?k=${encodeURIComponent(tool)}`, '_blank', 'noopener,noreferrer')} style={{padding:'5px 11px',borderRadius:100,fontSize:'0.7rem',fontWeight:600,background:'rgba(26,95,232,0.12)',color:C.bl,border:'1px solid rgba(26,95,232,0.2)',cursor:'pointer',margin:3}}>{tool} →</span>)}</div>
            </div>}
            {r.partsNeeded?.length>0 && <div style={{...s.card,background:'rgba(232,82,26,0.04)',borderColor:'rgba(232,82,26,0.15)'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}><div style={{fontSize:'0.62rem',fontWeight:700,color:C.o,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:0}}>{ct.parts}</div>
              <div style={{fontSize:'0.6rem',color:'rgba(255,178,36,0.65)',fontStyle:'italic'}}>{lang==='de'?'Suchvorschläge':lang==='tr'?'Arama önerileri':lang==='pl'?'Sugestie':'Search suggestions'}</div></div>
              <div style={{display:'flex',flexWrap:'wrap'}}>{r.partsNeeded.map((p,i)=><span key={i} onClick={()=>{
                      const cat2=curFix==='car'?'car':curFix==='tech'?'tech':curFix==='appliances'?'appliances':curFix==='garden'?'garden':curFix==='pets'?'pets':'home';
                       const cq2 = cleanProductSearchQuery(p,'',cat2,'','');
                       setPInput(cq2); setVInput(''); setHsnModel(''); setVType(cat2);
                       setPResults({ q: cq2, vehicle: '', hsnModel: '', searchQ: cq2, isHSN: false, category: cat2, fromDiagnosis: true });
                      goto('parts');
                    }} style={{padding:'5px 11px',borderRadius:100,fontSize:'0.7rem',fontWeight:600,background:'rgba(232,82,26,0.12)',color:C.o,border:'1px solid rgba(232,82,26,0.2)',cursor:'pointer',margin:3}}>{p} →</span>)}</div>
              <div style={{fontSize:'0.65rem',color:'rgba(255,255,255,0.25)',marginTop:8,lineHeight:1.5}}>
                {r._vehicleCtx ? (
                  lang==='de'
                    ? `Suchvorschläge für ${[r._vehicleCtx.make, r._vehicleCtx.model, r._vehicleCtx.engine].filter(Boolean).join(' ')}. Bitte OE-Nummer über VIN, HSN/TSN, Fahrzeugschein oder altes Teil prüfen.`
                    : lang==='tr'
                    ? `${[r._vehicleCtx.make, r._vehicleCtx.model, r._vehicleCtx.engine].filter(Boolean).join(' ')} için arama önerileri. OE uyumluluğunu VIN veya araç belgesiyle doğrulayın.`
                    : `Search suggestions for ${[r._vehicleCtx.make, r._vehicleCtx.model, r._vehicleCtx.engine].filter(Boolean).join(' ')}. Verify OE/OEM compatibility using VIN, registration data, or the original part.`
                ) : (
                  lang==='de'?'Bitte OE-Nummer über VIN, HSN/TSN, Fahrzeugschein oder altes Teil prüfen.':
                  lang==='tr'?'OE uyumluluğunu VIN, ruhsat belgesi veya orijinal parça ile doğrulayın.':
                  lang==='pl'?'Sprawdź numer OE przez VIN, dane rejestracyjne lub oryginalną część.':
                  'Please verify OE/OEM compatibility using VIN, registration data, or the original part.'
                )}
              </div>
            </div>}
            {r.proTip && <div style={{...s.card,background:'rgba(232,178,26,0.05)',borderColor:'rgba(232,178,26,0.2)'}}>
              <div style={{fontSize:'0.62rem',fontWeight:700,color:C.y,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8}}>{t('expertTip')}</div>
              <div style={{fontSize:'0.86rem',lineHeight:1.65}}>{r.proTip}</div>
            </div>}
            {/* Did this fix it? */}
            {!feedback && <div style={{...s.card,background:'rgba(255,255,255,0.03)',textAlign:'center'}}>
              <div style={{fontSize:'0.78rem',fontWeight:700,marginBottom:12}}>{ct.fixedQ}</div>
              <div style={{display:'flex',gap:10,justifyContent:'center'}}>
                <button onClick={()=>handleFeedback('fixed')} style={{...s.btn,width:'auto',padding:'10px 20px',background:'rgba(26,158,92,0.15)',color:C.g,border:`1px solid rgba(26,158,92,0.3)`}}>{ct.fixedY}</button>
                <button onClick={()=>handleFeedback('broken')} style={{...s.btn,width:'auto',padding:'10px 20px',background:'rgba(214,59,47,0.1)',color:C.r,border:`1px solid rgba(214,59,47,0.25)`}}>{ct.fixedN}</button>
              </div>
            </div>}
            {feedback === 'fixed' && <div style={{...s.card,background:'rgba(26,158,92,0.08)',borderColor:'rgba(26,158,92,0.3)',textAlign:'center'}}>
              <div style={{fontSize:'1.5rem',marginBottom:8}}>🎉</div>
              <div style={{fontSize:'1rem',fontWeight:800,marginBottom:8,color:C.g}}>{lang==='de'?'Glückwunsch! Problem behoben!':lang==='tr'?'Tebrikler! Problem çözüldü!':lang==='pl'?'Gratulacje! Problem rozwiązany!':'Problem Fixed!'}</div>
              <button onClick={handleShare} style={{...s.btn,marginBottom:8}}>↗ {lang==='de'?'Teilen':lang==='tr'?'Paylaş':lang==='pl'?'Udostępnij':'Share Fix'}</button>
            </div>}
            {feedback === 'broken' && <div style={{...s.card,background:'rgba(214,59,47,0.06)',borderColor:'rgba(214,59,47,0.25)',textAlign:'center'}}>
              <div style={{fontSize:'1.5rem',marginBottom:8}}>🔧</div>
              <div style={{fontSize:'0.9rem',fontWeight:700,marginBottom:12}}>{lang==='de'?'Noch nicht behoben?':lang==='tr'?'Henüz düzeltilmedi mi?':lang==='pl'?'Jeszcze nie naprawione?':'Not fixed yet?'}</div>
              <button onClick={()=>window.open(mu(proQ), '_blank', 'noopener,noreferrer')} style={{...s.btn,background:C.r}}>{ct.proBtn}</button>
            </div>}
            {r.callPro ? (
              <div style={{...s.card,background:'rgba(214,59,47,0.06)',borderColor:'rgba(214,59,47,0.25)'}}>
                <div style={{fontSize:'0.62rem',fontWeight:700,color:C.r,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8}}>{t('proRequired')}</div>
                <div style={{fontSize:'0.86rem',lineHeight:1.65,marginBottom:12}}>{r.proReason}</div>
                <button onClick={()=>window.open(mu(proQ), '_blank', 'noopener,noreferrer')} style={{...s.btn,background:C.r}}>{ct.proBtn}</button>
              </div>
            ) : (
              <div style={{display:'flex',gap:10}}>
                <button onClick={()=>{
                  const cat = curFix==='car'?'car':curFix==='tech'?'tech':curFix==='appliances'?'appliances':curFix==='garden'?'garden':curFix==='pets'?'pets':'home';
                  setVType(cat);
                  // Build query from CURRENT diagnosis — never reuse old parts search
                  const detectedVehicle = r._vehicleCtx;
                  const diagQuery = buildPartsQueryFromDiagnosis(r, problemRef.current, curFix, detectedVehicle);
                  // Build the vehicle label string for the vInput field
                  const vehicleLabel = detectedVehicle
                    ? [detectedVehicle.make, detectedVehicle.model, detectedVehicle.engine, detectedVehicle.year].filter(Boolean).join(' ')
                    : '';
                  setPInput(diagQuery);
                  setVInput(vehicleLabel); // populate vehicle field with detected vehicle
                  setHsnModel('');
                  setVType('car');
                  // Pre-populate pResults so parts are immediately visible
                  const fullSearchQ = diagQuery; // vehicle already in diagQuery via ensureVehicle
                  setPResults({ q: diagQuery, vehicle: vehicleLabel, hsnModel: '', searchQ: fullSearchQ, isHSN: false, category: cat, fromDiagnosis: true, vehicleCtx: detectedVehicle });
                  goto('parts');
                }} style={s.btn}>{ct.partsBtn}</button>
                <button onClick={()=>window.open(mu(proQ), '_blank', 'noopener,noreferrer')} style={{...s.btn,...s.btnSec}}>{ct.proBtn}</button>
              </div>
            )}
          </div>}
        </Scroll>
        {/* Toast */}
        {toast && <div style={{position:'fixed',bottom:120,left:'50%',transform:'translateX(-50%)',background:'rgba(30,30,30,0.95)',color:'#fff',padding:'10px 20px',borderRadius:100,fontSize:'0.82rem',fontWeight:600,animation:'toast 2.5s ease forwards',whiteSpace:'nowrap',zIndex:200}}>{toast}</div>}
        <NavBar screen={screen} t={t} goto={goto}/>
        <style>{CSS}</style>
      </Screen>
    );
  }

  // ── EMERGENCY ────────────────────────────────────────────────────────────────
  if (screen === 'emergency') return (
    <Screen bg="#060000">
      {showLP && <LangPicker lang={lang} setLang={lc=>{setLang(lc);setShowLP(false);aiReset();setPResults(null);setPInput('');setVInput('');}} setShowLP={setShowLP} LANGS={LANGS} t={t}/>}
      {!isOnline && <div style={{background:'rgba(232,178,26,0.1)',borderBottom:'1px solid rgba(232,178,26,0.2)',padding:'8px 16px',fontSize:'0.72rem',color:C.y,textAlign:'center',flexShrink:0}}>⚠️ Offline mode — emergency numbers still available</div>}
      <div style={{padding:'52px 20px 14px',background:'linear-gradient(160deg,rgba(214,59,47,0.1),transparent 60%)',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:6,fontSize:'0.62rem',fontWeight:700,color:C.r,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8}}>
          <span style={{width:8,height:8,background:C.r,borderRadius:'50%',animation:'blink 1.2s infinite'}}/>
          {t('emergencyMode')}
        </div>
        <div style={{fontSize:'1.4rem',fontWeight:800,letterSpacing:'-0.02em',marginBottom:4}}>{t('whatsHappening')}</div>
        <div style={{fontSize:'0.78rem',color:C.m}}>{t('selectCategory')}</div>
      </div>
      <Scroll pad="14px 20px">
        <a href={`tel:${cd.e}`} style={{background:C.r,borderRadius:20,padding:18,display:'flex',alignItems:'center',gap:14,marginBottom:10,textDecoration:'none'}}>
          <div style={{fontSize:'2rem'}}>🆘</div>
          <div style={{flex:1}}>
            <div style={{fontSize:'0.92rem',fontWeight:800,color:'#fff',marginBottom:3}}>CALL {cd.e} — {cd.name.toUpperCase()}</div>
            <div style={{fontSize:'0.68rem',color:'rgba(255,255,255,0.75)'}}>🚑 {cd.amb} · 🚒 {cd.fire} · 👮 {cd.police}{cd.doc?` · 👨‍⚕️ ${cd.doc}`:''}</div>
          </div>
          <div style={{color:'#fff',fontSize:'1.2rem'}}>→</div>
        </a>
        <div style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:14,padding:'12px 14px',marginBottom:10,fontSize:'0.72rem',color:'rgba(255,255,255,0.5)',lineHeight:1.6}}>
          📍 <strong style={{color:C.t}}>{cd.name}</strong> — 🚗 {cd.rs?.n}: <strong style={{color:C.t}}>{cd.rs?.num}</strong>
          {cd.ph?.num?` | 🐾 ${cd.ph.n}: ${cd.ph.num}`:''}
        </div>
        {Object.entries(EMRG).map(([key,ec],idx)=>{
          const titles=getEmrgT(key,lang);
          return (
            <div key={key} onClick={()=>{setEmrgKey(key);goto('emrg-detail');}} style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:16,padding:'14px 16px',display:'flex',alignItems:'center',gap:12,cursor:'pointer',marginBottom:8,animation:`fadeIn ${.25+idx*.06}s ease`}}>
              <span style={{fontSize:'1.4rem',flexShrink:0}}>{ec.ic}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:'0.88rem',fontWeight:700,marginBottom:3}}>{titles[0]}</div>
                <div style={{fontSize:'0.7rem',color:C.m}}>{titles[1]}</div>
              </div>
              <span style={{padding:'4px 10px',borderRadius:100,fontSize:'0.62rem',fontWeight:700,background:ec.badge==='URGENT'?'rgba(214,59,47,0.2)':'rgba(232,178,26,0.2)',color:ec.badge==='URGENT'?C.r:C.y,flexShrink:0}}>{ec.badge}</span>
            </div>
          );
        })}
      </Scroll>
      <NavBar screen={screen} t={t} goto={goto}/>
      <style>{CSS}</style>
    </Screen>
  );

  // ── EMRG DETAIL ──────────────────────────────────────────────────────────────
  if (screen === 'emrg-detail' && emrgKey) {
    const ec=EMRG[emrgKey], titles=getEmrgT(emrgKey,lang), steps=getEmrgS(emrgKey,lang);
    const CallBtn=({icon,label,num,type='p'})=>(
      <a href={`tel:${num}`} style={{display:'flex',alignItems:'center',gap:12,borderRadius:16,padding:14,marginBottom:8,textDecoration:'none',background:type==='p'?C.r:type==='s'?'rgba(232,178,26,0.1)':'rgba(26,95,232,0.1)'}}>
        <span style={{fontSize:'1.4rem',flexShrink:0}}>{icon}</span>
        <div style={{flex:1}}><div style={{fontSize:'0.86rem',fontWeight:700,color:type==='p'?'#fff':type==='s'?C.y:C.bl}}>{label}</div><div style={{fontSize:'0.67rem',color:type==='p'?'rgba(255,255,255,0.7)':C.m}}>{t('tapToCall')}</div></div>
        <div style={{fontWeight:800,color:type==='p'?'#fff':type==='s'?C.y:C.bl,fontSize:'1rem',flexShrink:0}}>{num}</div>
      </a>
    );
    const MapBtn=({icon,label,query})=>(
      <button onClick={()=>window.open(mu(query), '_blank', 'noopener,noreferrer')} style={{display:'flex',alignItems:'center',gap:12,borderRadius:16,padding:14,marginBottom:8,border:'1px solid rgba(232,178,26,0.2)',width:'100%',background:'rgba(232,178,26,0.08)',cursor:'pointer',textAlign:'left',fontFamily:'inherit'}}>
        <span style={{fontSize:'1.4rem',flexShrink:0}}>{icon}</span>
        <div style={{flex:1}}><div style={{fontSize:'0.86rem',fontWeight:700,color:C.y}}>{label}</div><div style={{fontSize:'0.67rem',color:C.m}}>{t('openMapNear')}</div></div>
        <div style={{color:C.y,fontSize:'1rem'}}>→</div>
      </button>
    );
    return (
      <Screen bg="#060000">
        {showLP && <LangPicker lang={lang} setLang={lc=>{setLang(lc);setShowLP(false);aiReset();setPResults(null);setPInput('');setVInput('');}} setShowLP={setShowLP} LANGS={LANGS} t={t}/>}
        <div style={{padding:'52px 20px 14px',borderBottom:'1px solid rgba(255,255,255,0.06)',flexShrink:0}}>
          <BackBtn onPress={()=>goto('emergency')}/>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontSize:'2.2rem'}}>{ec.ic}</span>
            <div><div style={{fontSize:'1.2rem',fontWeight:800}}>{titles[0]}</div><div style={{fontSize:'0.78rem',color:C.m}}>{titles[1]}</div></div>
          </div>
        </div>
        <Scroll pad="14px 20px">
          <div style={{background:'rgba(214,59,47,0.06)',border:'1px solid rgba(214,59,47,0.2)',borderRadius:14,padding:14,marginBottom:12}}>
            <div style={{fontSize:'0.62rem',fontWeight:700,color:C.r,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:10}}>{t('callNow')}</div>
            {ec.call==='roadside'&&<><CallBtn icon="🚗" label={`${cd.rs?.n}: ${cd.rs?.num}`} num={cd.rs?.num||'112'} type="s"/><CallBtn icon="🆘" label={`Emergency: ${cd.e}`} num={cd.e}/><MapBtn icon="🗺️" label={t('nearestGarage')} query="car garage mechanic near me"/></>}
            {ec.call==='vet'&&<>{cd.ph?.num&&<CallBtn icon="🐾" label={`${cd.ph.n}: ${cd.ph.num}`} num={cd.ph.num} type="s"/>}{cd.pa?.num&&cd.pa.num.length>3&&<CallBtn icon="🚑" label={`${cd.pa.n}: ${cd.pa.num}`} num={cd.pa.num} type="i"/>}<MapBtn icon="🗺️" label={t('emergencyVet')} query="emergency vet open now 24h"/><MapBtn icon="🏥" label={t('animalClinicNear')} query="animal clinic veterinarian near me"/></>}
            {ec.call==='fire'&&<><CallBtn icon="🚒" label={`Fire: ${cd.fire}`} num={cd.fire}/><CallBtn icon="🆘" label={`Emergency: ${cd.e}`} num={cd.e}/></>}
            {ec.call==='plumber'&&<><CallBtn icon="🆘" label={`Emergency: ${cd.e}`} num={cd.e}/><MapBtn icon="🔧" label={t('emergencyPlumber')} query={t('plumberQuery')}/></>}
            {ec.call==='power'&&<><CallBtn icon="🆘" label={`Emergency: ${cd.e}`} num={cd.e}/><MapBtn icon="⚡" label={t('electricityProvider')} query={cc==='DE'?'Stadtwerke Strom Störung Netzbetreiber Stromausfall':cc==='AT'?'Stromnetz Störung Stadtwerke':cc==='CH'?'Stromnetzbetreiber Störung':cc==='FR'?'panne électrique signaler fournisseur':cc==='GB'?'power cut report network operator':cc==='US'?'power outage report electric utility':'electricity power outage report'}/></>}
            {ec.call==='emergency'&&<CallBtn icon="🆘" label={`Emergency: ${cd.e}`} num={cd.e}/>}
          </div>
          <div style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:14,padding:14,marginBottom:12}}>
            <div style={{fontSize:'0.62rem',fontWeight:700,color:C.o,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:12}}>{t('immediateSteps')}</div>
            {steps.map((step,i)=>(
              <div key={i} style={{display:'flex',gap:12,alignItems:'flex-start',marginBottom:10}}>
                <div style={{width:26,height:26,background:C.o,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.7rem',fontWeight:800,color:'#fff',flexShrink:0}}>{i+1}</div>
                <div style={{fontSize:'0.84rem',lineHeight:1.6,color:'rgba(240,237,232,0.88)',flex:1,paddingTop:2}}>{step}</div>
              </div>
            ))}
          </div>
          <div style={{background:'rgba(232,82,26,0.06)',border:'1px solid rgba(232,82,26,0.2)',borderRadius:14,padding:14}}>
            <div style={{fontSize:'0.62rem',fontWeight:700,color:C.o,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8}}>📍 {t('emergencyNumbers')} — {cd.name}</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              {[['🆘','Emergency',cd.e],['🚒','Fire',cd.fire],['👮','Police',cd.police],['🚑','Ambulance',cd.amb]].map(([ic,lb,nm])=>(
                <a key={lb} href={`tel:${nm}`} style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:10,padding:10,textAlign:'center',display:'block',textDecoration:'none'}}>
                  <div style={{fontSize:'1.2rem',marginBottom:3}}>{ic}</div>
                  <div style={{fontSize:'0.62rem',color:C.m,marginBottom:2}}>{lb}</div>
                  <div style={{fontSize:'0.9rem',fontWeight:800,color:C.r}}>{nm}</div>
                </a>
              ))}
            </div>
          </div>
          {/* Affiliate disclosure — shown only when shop links are visible */}
          <div style={{textAlign:'center',padding:'12px 16px 4px',fontSize:'0.65rem',color:'rgba(255,255,255,0.2)',lineHeight:1.5}}>
            As an Amazon Associate, FixIt may earn from qualifying purchases.
          </div>
        </Scroll>
        <NavBar screen={screen} t={t} goto={goto}/>
        <style>{CSS}</style>
      </Screen>
    );
  }

  // ── NEARBY ───────────────────────────────────────────────────────────────────
  if (screen === 'nearby') {
    const catLabels={garage:t('catGarage'),parts:t('catParts'),tyres:t('catTyres'),petrol:t('catPetrol'),hardware:t('catHardware'),vet:t('catVet'),it:t('catIT')};
    // Category-specific Google Maps search terms (correct service type, not product)
    // catMapsQ: short, intent-friendly local service search terms per language
    const _isDE = lang === 'de', _isTR = lang === 'tr',
          _isHR = lang === 'hr' || lang === 'sr',
          _isMK = lang === 'mk', _isFR = lang === 'fr',
          _isES = lang === 'es', _isIT = lang === 'it';
    const catMapsQ={
      garage:   _isDE?'Autowerkstatt in der Nähe':_isTR?'Araba tamircisi yakınımda':_isHR?'Auto servis u blizini':_isMK?'Автосервис во близина':_isFR?'Garage automobile près de moi':_isES?'Taller mecánico cercano':_isIT?'Officina auto vicino':' car mechanic near me',
      parts:    _isDE?'Autoteile in der Nähe':_isTR?'Oto yedek parça yakınımda':_isHR?'Auto dijelovi u blizini':_isMK?'Авто делови во близина':'auto parts store near me',
      tyres:    _isDE?'Reifenservice in der Nähe':_isTR?'Lastik servisi yakınımda':_isHR?'Servis za gume u blizini':_isMK?'Сервис за гуми во близина':'tyre service near me',
      petrol:   _isDE?'Tankstelle in der Nähe':_isTR?'Benzin istasyonu yakınımda':_isHR?'Benzinska stanica u blizini':_isMK?'Бензинска станица во близина':'petrol station near me',
      hardware: _isDE?'Baumarkt in der Nähe':_isTR?'Hırdavatçı yakınımda':_isHR?'Željezarija u blizini':_isMK?'Железарија во близина':'hardware store near me',
      vet:      _isDE?'Tierarzt in der Nähe':_isTR?'Veteriner yakınımda':_isHR?'Veterinar u blizini':_isMK?'Ветеринар во близина':'veterinarian near me',
      it:       _isDE?'Computer Reparatur in der Nähe':_isTR?'Bilgisayar tamiri yakınımda':_isHR?'Servis računala u blizini':_isMK?'Сервис компјутери во близина':'computer repair near me',
    };
    return (
      <Screen>
        {showLP && <LangPicker lang={lang} setLang={lc=>{setLang(lc);setShowLP(false);aiReset();setPResults(null);setPInput('');setVInput('');}} setShowLP={setShowLP} LANGS={LANGS} t={t}/>}
        <div style={{padding:'52px 20px 12px',borderBottom:`1px solid ${C.b}`,flexShrink:0}}>
          <BackBtn/>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
            <div style={{fontSize:'1.2rem',fontWeight:800,flex:1}}>{t('findNearby')}</div>
            <button onClick={()=>{if(lat){setNearbyBump(b=>b+1);}else goto('loc-ask');}} style={{background:C.o,border:'none',borderRadius:100,padding:'8px 16px',color:'#fff',fontSize:'0.75rem',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>{t('refresh')}</button>
          </div>
          <div style={{display:'flex',gap:8,overflowX:'auto',paddingBottom:2}}>
            {Object.keys(MAP_CATS).map(k=>(
              <button key={k} onClick={()=>{setMapCat(k);setNearbyBump(b=>b+1);}} style={{padding:'7px 14px',borderRadius:100,fontSize:'0.72rem',fontWeight:600,whiteSpace:'nowrap',cursor:'pointer',border:k===mapCat?'none':`1px solid ${C.b}`,background:k===mapCat?C.o:C.c,color:k===mapCat?'#fff':C.m,flexShrink:0,fontFamily:'inherit'}}>
                {MAP_CATS[k].icon} {catLabels[k]||k}
              </button>
            ))}
          </div>
        </div>
        {/* Skeleton map while loading, real schematic when loaded */}
        <div style={{height:155,background:'#0D1420',position:'relative',overflow:'hidden',flexShrink:0}}>
          {bizLoading ? (
            <div style={{position:'absolute',inset:0,background:'linear-gradient(90deg,#0D1420 25%,#1a2030 50%,#0D1420 75%)',backgroundSize:'200% 100%',animation:'shimmer 1.5s infinite'}}/>
          ) : (
            <>
              <div style={{position:'absolute',inset:0,backgroundImage:'linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)',backgroundSize:'28px 28px'}}/>
              <div style={{position:'absolute',top:'42%',left:0,right:0,height:6,background:'rgba(255,255,255,0.06)',borderRadius:3}}/>
              <div style={{position:'absolute',left:'35%',top:0,bottom:0,width:5,background:'rgba(255,255,255,0.06)'}}/>
              {lat ? <>
                <div style={{position:'absolute',top:'44%',left:'48%',transform:'translate(-50%,-50%)',width:16,height:16,background:C.bl,borderRadius:'50%',border:'3px solid #fff',boxShadow:'0 0 0 6px rgba(26,95,232,0.2)'}}/>
                {bizs.slice(0,3).map((b,i)=>{
                  const pos=[{top:'18%',left:'28%'},{top:'25%',left:'65%'},{top:'62%',left:'22%'}][i];
                  const clr=[C.g,C.bl,C.o][i]; const bg2=['#1A3A2A','#1A2A4A','#3A1800'][i];
                  return <div key={i} style={{position:'absolute',...pos,display:'flex',flexDirection:'column',alignItems:'center',transform:'translateX(-50%)'}}>
                    <div style={{background:bg2,color:clr,padding:'4px 10px',borderRadius:100,fontSize:'0.62rem',fontWeight:800,whiteSpace:'nowrap',marginBottom:3}}>{i===0?'⭐ ':''}{b.dist<1?Math.round(b.dist*1000)+'m':b.dist.toFixed(1)+'km'}</div>
                    <div style={{width:2,height:7,background:clr,borderRadius:2}}/>
                  </div>;
                })}
                <div style={{position:'absolute',bottom:6,right:10,fontSize:'0.55rem',color:'rgba(255,255,255,0.3)'}}>📍 {city||`${lat.toFixed(3)},${lng.toFixed(3)}`} · OSM</div>
              </> : <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(10,9,8,0.8)'}}>
                {locStatus==='denied' ? (
                  <div style={{textAlign:'center',padding:20}}>
                    <div style={{fontSize:'2rem',marginBottom:8}}>📍</div>
                    <div style={{fontSize:'0.82rem',color:C.m,marginBottom:12}}>{lang==='de'?'GPS verweigert. Standort in Einstellungen aktivieren.':lang==='tr'?'GPS reddedildi. Ayarlardan etkinleştirin.':lang==='pl'?'GPS odmówiony. Włącz lokalizację w ustawieniach.':'GPS denied. Enable location in Settings.'}</div>
                    <button onClick={()=>goto('loc-ask')} style={{...s.btn,width:'auto',padding:'8px 16px',fontSize:'0.78rem'}}>How to enable →</button>
                  </div>
                ) : (
                  <button onClick={()=>goto('loc-ask')} style={{...s.btn,width:'auto',padding:'10px 20px'}}>📍 {t('enableLocation')}</button>
                )}
              </div>}
            </>
          )}
        </div>
        <Scroll pad="12px 20px">
          {!lat && locStatus!=='loading' && <div style={{...s.card,background:'rgba(26,95,232,0.06)',borderColor:'rgba(26,95,232,0.2)',textAlign:'center',marginBottom:12}}>
            <div style={{fontSize:'1.5rem',marginBottom:8}}>📍</div>
            <div style={{fontSize:'0.86rem',fontWeight:700,marginBottom:6}}>{t('locationNeeded')}</div>
            <div style={{fontSize:'0.75rem',color:C.m,marginBottom:12}}>{t('locationNeededDesc')}</div>
            {locStatus==='denied' && <div style={{fontSize:'0.72rem',color:C.y,marginBottom:10}}>⚠️ {lang==='de'?'GPS verweigert — Einstellungen → Datenschutz → Standort → FixIt aktivieren.':lang==='tr'?'GPS reddedildi — Ayarlar → Gizlilik → Konum → FixIt':lang==='pl'?'GPS odmówiony — Ustawienia → Prywatność → Lokalizacja → FixIt':'GPS denied — go to Settings → Privacy → Location → enable FixIt.'}</div>}
            <button onClick={()=>goto('loc-ask')} style={{...s.btn,width:'auto',padding:'10px 20px',borderRadius:100}}>{t('enableLocation')}</button>
          </div>}
          {/* ONE status block — loading shows spinner + Maps button; error shows Maps button; never duplicates */}
          {bizLoading && (
            <div style={{textAlign:'center',padding:'24px 20px',color:C.m,display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
              <Spinner size={32}/>
              <div style={{fontSize:'0.78rem'}}>{t('loadingPlaces')}</div>
            </div>
          )}
          {!bizLoading && bizError && (
            <div style={{...s.card,textAlign:'center',padding:'20px 16px'}}>
              <div style={{fontSize:'1.4rem',marginBottom:8}}>{bizError==='empty'?'🔍':'📡'}</div>
              <div style={{fontSize:'0.85rem',fontWeight:700,marginBottom:4}}>
                {bizError==='empty'
                  ? (lang==='de'?`Kein ${catLabels[mapCat]} in der Nähe gefunden`:lang==='tr'?`Yakında ${catLabels[mapCat]} bulunamadı`:lang==='pl'?`Nie znaleziono ${catLabels[mapCat]} w pobliżu`:`No nearby ${catLabels[mapCat]} found`)
                  : (lang==='de'?'Ergebnisse konnten nicht geladen werden':lang==='tr'?'Sonuçlar yüklenemedi':lang==='pl'?'Nie udało się załadować wyników':'Could not load results')}
              </div>
              <div style={{fontSize:'0.72rem',color:C.m,marginBottom:14,lineHeight:1.5}}>
                {lang==='de'?'Google Maps zeigt alle Optionen in deiner Nähe.':
                 lang==='tr'?'Google Maps yakınımdaki tüm seçenekleri gösterir.':
                 lang==='pl'?'Google Maps pokaże wszystkie opcje w pobliżu.':
                 'Google Maps shows all nearby options.'}
              </div>
              <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}>
                {bizError==='error'&&<button onClick={()=>lat&&setNearbyBump(b=>b+1)} style={{...s.btn,...s.btnSec,width:'auto',padding:'10px 16px',fontSize:'0.78rem'}}>{t('retryBtn')||'↻ '+(lang==='de'?'Erneut versuchen':lang==='tr'?'Tekrar dene':lang==='pl'?'Spróbuj ponownie':'Try again')}</button>}
                <button onClick={()=>window.open(mu(`${catMapsQ[mapCat]||catLabels[mapCat]}`), '_blank', 'noopener,noreferrer')}
                  style={{...s.btn,width:'auto',padding:'10px 18px'}}>
                  {t('openGoogleMaps')}
                </button>
              </div>
            </div>
          )}

          {!bizLoading&&!bizError&&bizs.length>0&&<>
            <div style={{fontSize:'0.7rem',fontWeight:700,color:C.m,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10}}>{bizs.length} {t('realResultsFrom')}</div>
            {bizs.map((b,i)=>(
              <div key={i} onClick={()=>b.phone?(window.location=`tel:${b.phone}`):window.open(mu(`${b.name} ${b.addr}`), '_blank', 'noopener,noreferrer')} style={{...s.card,display:'flex',alignItems:'flex-start',gap:12,cursor:'pointer',background:i===0?'rgba(26,158,92,0.04)':C.c,borderColor:i===0?'rgba(26,158,92,0.35)':C.b,animation:`fadeIn ${.3+i*.04}s ease`}}>
                <div style={{width:44,height:44,borderRadius:13,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.3rem',flexShrink:0,background:'rgba(26,158,92,0.1)'}}>{i===0?'🏆':MAP_CATS[mapCat]?.icon||'📍'}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:'0.88rem',fontWeight:700,marginBottom:3}}>{i===0?'🏆 ':''}{b.name}</div>
                  <div style={{fontSize:'0.7rem',color:C.m,lineHeight:1.5}}>
                    {b.addr}
                    {b.phone&&<><br/><a href={`tel:${b.phone}`} onClick={e=>e.stopPropagation()} style={{color:C.bl}}>📞 {b.phone}</a></>}
                    {b.opening&&<><br/>🕐 {b.opening}</>}
                    {b.website&&<><br/><span onClick={e=>{e.stopPropagation();window.open(b.website.startsWith('http')?b.website:'https://'+b.website, '_blank', 'noopener,noreferrer');}} style={{color:C.bl,cursor:'pointer'}}>🌐 {t('website')}</span></>}
                  </div>
                </div>
                <div style={{textAlign:'right',flexShrink:0}}>
                  <div style={{fontSize:'0.9rem',fontWeight:800,color:C.g}}>{b.dist<1?Math.round(b.dist*1000)+'m':b.dist.toFixed(1)+'km'}</div>
                  {b.phone&&<div style={{fontSize:'0.65rem',fontWeight:700,color:C.bl,marginTop:4}}>📞 {t('call')}</div>}
                </div>
              </div>
            ))}
            <div onClick={()=>window.open(mu(`${catMapsQ[mapCat]||catLabels[mapCat]}`), '_blank', 'noopener,noreferrer')} style={{...s.card,textAlign:'center',cursor:'pointer',marginTop:4,border:`1px solid rgba(26,95,232,0.2)`,background:'rgba(26,95,232,0.04)'}}>
              <div style={{fontSize:'0.88rem',fontWeight:700,marginBottom:3}}>{t('openGoogleMaps')}</div>
              <div style={{fontSize:'0.72rem',color:C.m}}>{t('allResultsMap')}</div>
            </div>
          </>}

          {/* Affiliate disclosure — shown only when shop links are visible */}
          <div style={{textAlign:'center',padding:'12px 16px 4px',fontSize:'0.65rem',color:'rgba(255,255,255,0.2)',lineHeight:1.5}}>
            As an Amazon Associate, FixIt may earn from qualifying purchases.
          </div>
        </Scroll>
        <NavBar screen={screen} t={t} goto={goto}/>
        <style>{CSS}</style>
      </Screen>
    );
  }

  // ── PARTS ────────────────────────────────────────────────────────────────────
  if (screen === 'parts') {
    const localStores      = getStores(vType, cc);          // category-specific ONLINE stores
    const onlineStores     = getOnlineStores(cc);            // generic Amazon/eBay/Idealo
    const localSearchTerm  = getLocalStoreSearch(vType, lang); // local Google Maps term
    const localMapsUrl     = mu(localSearchTerm);             // Google Maps search URL
    const ptCt = catTerms(vType, lang); // category-aware terms for parts screen
    const isPetParts = vType === 'pets';
    const isBikeParts = vType === 'bike';
    const isRepairParts = !isPetParts && vType !== 'garden';
    const vPH = vType==='car'?t('vehicleInputCar'):vType==='bike'?t('vehicleInputBike'):(vType==='home'||vType==='appliances')?t('vehicleInputHome'):
                vType==='pets'?(t('vehicleInputPet')):t('vehicleInputDefault');
    return (
      <Screen>
        {showLP && <LangPicker lang={lang} setLang={lc=>{setLang(lc);setShowLP(false);aiReset();setPResults(null);setPInput('');setVInput('');}} setShowLP={setShowLP} LANGS={LANGS} t={t}/>}
        <div style={{padding:'52px 20px 14px',borderBottom:`1px solid ${C.b}`,flexShrink:0}}>
          <BackBtn/>
          <div style={{fontSize:'1.35rem',fontWeight:800,letterSpacing:'-0.02em',marginBottom:4}}>
            {vType==='car'   ?(lang==='de'?'Auto-Teile finden':lang==='tr'?'Araba Parçası Bul':lang==='pl'?'Znajdź części do auta':'Find Auto Parts'):
             vType==='bike'  ?(lang==='de'?'Fahrrad-Teile finden':lang==='tr'?'Bisiklet Parçası Bul':lang==='pl'?'Znajdź części do roweru':'Find Bike Parts'):
             vType==='tech'  ?(lang==='de'?'Elektronik & Zubehör':lang==='tr'?'Elektronik & Aksesuar':lang==='pl'?'Elektronika & Akcesoria':'Electronics & Parts'):
             vType==='appliances'?(lang==='de'?'Geräte-Ersatzteile':lang==='tr'?'Cihaz Yedek Parçaları':lang==='pl'?'Części do AGD':'Appliance Parts'):
             vType==='garden'?(lang==='de'?'Gartenbedarf finden':lang==='tr'?'Bahçe Malzemesi Bul':lang==='pl'?'Znajdź artykuły ogrodowe':'Find Garden Supplies'):
             vType==='pets'  ?(lang==='de'?'Tierbedarf finden':lang==='tr'?'Evcil Hayvan Ürünleri Bul':lang==='pl'?'Znajdź produkty dla zwierząt':'Find Pet Supplies'):
                              (lang==='de'?'Haus & Geräte finden':lang==='tr'?'Ev & Alet Bul':lang==='pl'?'Znajdź części & narzędzia':'Find Parts & Tools')}
          </div>
          <div style={{fontSize:'0.82rem',color:C.m}}>{t('partsSubtitle')}</div>
        </div>
        <Scroll>
          <div style={s.card}>
            <div style={{fontSize:'0.68rem',fontWeight:700,color:C.m,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>{t('searchingFor')}</div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}>
              {[['car',t('catCar')],['home',t('catHome')],['appliances',t('catAppliance')],['garden',t('catGarden')],['tech',t('catTech')],['bike',t('catBike')],['pets',t('catPets')]].map(([tp,lb])=>(
                <button key={tp} onClick={()=>{setVType(tp);setVInput('');setHsnModel('');}} style={{padding:'7px 14px',borderRadius:100,fontSize:'0.76rem',fontWeight:600,cursor:'pointer',border:'none',background:vType===tp?C.bl:'rgba(255,255,255,0.06)',color:vType===tp?'#fff':C.m,fontFamily:'inherit'}}>{lb}</button>
              ))}
            </div>
            <input value={vInput} onChange={e=>setVInput(e.target.value)} placeholder={vPH} style={{...s.inp,marginBottom:6}}/>
            <div style={{fontSize:'0.65rem',color:C.m,lineHeight:1.5}}>{t('vehicleHint')}</div>
            {/^\d{4}/.test(vInput.trim()) && (
              <div style={{marginTop:10,padding:'10px 12px',background:'rgba(232,178,26,0.08)',border:'1px solid rgba(232,178,26,0.2)',borderRadius:10}}>
                <div style={{fontSize:'0.65rem',color:C.y,fontWeight:700,marginBottom:6}}>
                  {lang==='de'?'✏️ Fahrzeugmodell ergänzen (empfohlen für genaue Suche):':lang==='tr'?'✏️ Araç modeli ekle (kesin arama için önerilir):':lang==='pl'?'✏️ Dodaj model pojazdu (zalecane dla dokładnego wyszukiwania):':'✏️ Add vehicle model (recommended for accurate search):'}
                </div>
                <input
                  value={hsnModel}
                  onChange={e=>setHsnModel(e.target.value)}
                  placeholder={lang==='de'?'z.B. VW Golf 7 2.0 TDI 2017':lang==='tr'?'örn. VW Golf 7 2.0 TDI 2017':lang==='pl'?'np. VW Golf 7 2.0 TDI 2017':'e.g. VW Golf 7 2.0 TDI 2017'}
                  style={{...s.inp,marginBottom:0}}
                />
              </div>
            )}
          </div>
          <div style={s.card}>
            <div style={{fontSize:'0.65rem',color:C.m,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>{isPetParts?(lang==='de'?'Welches Produkt wird benötigt?':'What product is needed?'):isBikeParts?(lang==='de'?'Welches Teil oder Zubehör?':'Which part or accessory?'):t('whatPartNeeded')}</div>
            <input value={pInput} onChange={e=>setPInput(e.target.value)} placeholder={isPetParts?(lang==='de'?'z.B. Flohmittel, Futternapf, Leine':'e.g. flea treatment, food bowl, leash'):
                isBikeParts?(lang==='de'?'z.B. Bremsbelag, Kette, Schlauch':lang==='tr'?'örn. fren balataları, zincir, iç lastik':lang==='pl'?'np. klocki hamulcowe, łańcuch, dętka':'e.g. brake pads, chain, inner tube'):
                t('partInputPlaceholder')} style={{...s.inp,marginBottom:10}}/>
            <button onClick={findParts} style={s.btn}>{isPetParts?(lang==='de'?'Produkte suchen':lang==='tr'?'Ürün bul':lang==='pl'?'Znajdź produkty':'Find Products'):isBikeParts?(lang==='de'?'Fahrradteile suchen':'Find Bike Parts'):t('findPartsBtn')}</button>
          </div>
          <div style={{...s.card,display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
            <span>{lat?'✅':'📍'}</span>
            <div style={{flex:1}}>
              <div style={{fontSize:'0.72rem',fontWeight:700}}>{lat?`📍 ${city||`${lat.toFixed(3)},${lng.toFixed(3)}`}`:t('locationNeeded')}</div>
              <div style={{fontSize:'0.62rem',color:C.m}}>{lat?`${t('storesFor')} ${cd.name} (GPS)`:t('locationNeededDesc')}</div>
            </div>
            {!lat&&<button onClick={()=>goto('loc-ask')} style={{background:C.o,border:'none',borderRadius:8,padding:'5px 10px',color:'#fff',fontSize:'0.65rem',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>{t('allow')}</button>}
          </div>
          {!pResults&&<div style={{...s.card,textAlign:'center',color:C.m}}>
            <div style={{fontSize:'2rem',marginBottom:10}}>🔩</div>
            <div style={{fontSize:'0.86rem',fontWeight:700,marginBottom:5}}>{isPetParts?(lang==='de'?'Produkt eingeben':lang==='tr'?'Ürün gir':lang==='pl'?'Wpisz produkt':'Enter product'):t('typePartFirst')}</div>
            <div style={{fontSize:'0.7rem',lineHeight:1.5,color:C.g}}>📍 {localSearchTerm} · {lang==='de'?'Amazon · eBay · Idealo':'Amazon · eBay'}</div>
          </div>}
          {pResults&&<>
            {pResults.fromDiagnosis && aiResult?.partsNeeded?.length > 1 ? (
              <div style={{marginBottom:10}}>
                <div style={{fontSize:'0.7rem',fontWeight:700,color:C.m,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>
                  {lang==='de'?'Teile aus der Diagnose — tippe zum Suchen:':lang==='tr'?'Teşhisten parçalar — aramak için dokun:':lang==='pl'?'Części z diagnozy — dotknij aby wyszukać:':'Parts from diagnosis — tap to search:'}
                </div>
                <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                  {aiResult.partsNeeded.map((part,pi)=>(
                    <span key={pi} onClick={()=>{
                        const cq = cleanProductSearchQuery(part,'',pResults.category||vType,'','');
                        // Prepend vehicle if it is not already in the cleaned query
                        const vc = pResults.vehicleCtx;
                        const vcStr = vc ? [vc.make, vc.model, vc.engine].filter(Boolean).join(' ') : '';
                        const vehicleTokens = [vc?.make, (vc?.model||'').split(' ')[0]].filter(s => s && s.length > 2);
                        const alreadyHasVehicle = !vcStr || vehicleTokens.some(t => cq.toUpperCase().includes(t.toUpperCase()));
                        const finalQ = alreadyHasVehicle ? cq : `${vcStr} ${cq}`;
                        setPInput(cq);
                        setPResults({...pResults, q:finalQ, searchQ:finalQ});
                      }}
                      style={{padding:'6px 12px',borderRadius:100,fontSize:'0.75rem',fontWeight:600,cursor:'pointer',margin:2,
                        background:pResults.q===cleanProductSearchQuery(part,'',pResults.category||vType,'','')?C.o:'rgba(232,82,26,0.12)',
                        color:pResults.q===cleanProductSearchQuery(part,'',pResults.category||vType,'','')?'#fff':C.o,
                        border:`1px solid ${pResults.q===cleanProductSearchQuery(part,'',pResults.category||vType,'','')?C.o:'rgba(232,82,26,0.2)'}`}}>
                      {(()=>{
                          const cq = cleanProductSearchQuery(part,'',pResults.category||vType,'','');
                          const vc = pResults.vehicleCtx;
                          const vcStr = vc ? [vc.make, vc.model, vc.engine].filter(Boolean).join(' ') : '';
                          if (!vcStr) return cq || part;
                          const vcTokens = [vc?.make, (vc?.model||'').split(' ')[0]].filter(s => s && s.length > 2);
                          const alreadyHas = !vcStr || vcTokens.some(t => cq.toUpperCase().includes(t.toUpperCase()));
                          return alreadyHas ? (cq || part) : `${vcStr} ${cq || part}`;
                        })()}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{fontSize:'0.7rem',fontWeight:700,color:C.m,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10}}>
                {t('resultsFor')}: "<strong style={{color:C.t}}>{pResults.q}</strong>"{pResults.vehicle?` · ${t('vehicle')}: ${pResults.vehicle}`:''}
              </div>
            )}
            {pResults.vehicle&&<div style={{...s.card,background:'rgba(26,95,232,0.06)',borderColor:'rgba(26,95,232,0.2)',marginBottom:10}}>
              <div style={{fontSize:'0.65rem',fontWeight:700,color:C.bl,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:6}}>
                {catRecognitionLabel(vType, lang)}
                {pResults.isHSN && cc==='DE' && ' — HSN/TSN'}
              </div>
              <div style={{fontSize:'0.78rem',color:C.t,lineHeight:1.6,marginBottom:6}}>
                {pResults.isHSN
                  ? (pResults.hsnModel
                    ? `${lang==='de'?'Modell':lang==='tr'?'Model':lang==='pl'?'Model':'Model'}: ${pResults.hsnModel} — ${lang==='de'?'Suche':lang==='tr'?'Arama':lang==='pl'?'Szukaj':'Search'}: "${pResults.searchQ}"`
                    : (lang==='de'?'HSN/TSN erkannt — bitte Modell oben ergänzen (z.B. "VW Golf 7 2.0 TDI 2017")':
                       'HSN/TSN detected — add the vehicle model above (e.g. "VW Golf 7 2.0 TDI 2017")'))
                  : `${lang==='de'?'Suche':lang==='tr'?'Arama':lang==='pl'?'Szukaj':'Search'}: "${pResults.searchQ}"`}
              </div>
              {pResults.isHSN && !pResults.hsnModel && <div style={{fontSize:'0.7rem',color:C.m}}>
                {lang==='de'?'Tipp: Modell oben ergänzen für exakte Teilesuche.':'Tip: Add the model above for exact part search.'}
              </div>}
            </div>}
            {/* VIN compatibility warning — shown when vehicle was auto-detected */}
            {pResults.vehicleCtx && pResults.fromDiagnosis && (
              <div style={{display:'flex',alignItems:'flex-start',gap:8,
                background:'rgba(251,191,36,0.06)',border:'1px solid rgba(251,191,36,0.2)',
                borderRadius:10,padding:'10px 14px',marginBottom:10}}>
                <span style={{fontSize:'1rem',flexShrink:0}}>⚠️</span>
                <div style={{fontSize:'0.68rem',color:'rgba(255,255,255,0.55)',lineHeight:1.6}}>
                  {lang==='de'
                    ? `Suchvorschläge für ${[pResults.vehicleCtx.make, pResults.vehicleCtx.model, pResults.vehicleCtx.engine].filter(Boolean).join(' ')}. Bitte vor dem Kauf über Fahrgestellnummer, vorhandenes Teile-Etikett oder Fahrzeughandbuch prüfen.`
                    : lang==='tr'
                    ? `${[pResults.vehicleCtx.make, pResults.vehicleCtx.model, pResults.vehicleCtx.engine].filter(Boolean).join(' ')} için arama önerileri. Satın almadan önce şasi numarası veya mevcut parça etiketi ile doğrulayın.`
                    : lang==='pl'
                    ? `Sugestie wyszukiwania dla ${[pResults.vehicleCtx.make, pResults.vehicleCtx.model, pResults.vehicleCtx.engine].filter(Boolean).join(' ')}. Przed zakupem sprawdź numer VIN, etykietę istniejącej części lub podręcznik pojazdu.`
                    : `Search suggestions for ${[pResults.vehicleCtx.make, pResults.vehicleCtx.model, pResults.vehicleCtx.engine].filter(Boolean).join(' ')}. Please verify compatibility via VIN, existing part label, or vehicle manual before buying.`}
                </div>
              </div>
            )}
            {/* LOKALE GESCHÄFTE — real nearby stores via Google Maps, NOT online shops */}
            <div style={{...s.card,background:'rgba(26,158,92,0.05)',borderColor:'rgba(26,158,92,0.2)',marginBottom:10}}>
              <div style={{fontSize:'0.62rem',fontWeight:700,color:C.g,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10}}>
                📍 {lang==='de'?'Lokale Geschäfte in der Nähe':'Local Stores Nearby'} {lat?'(GPS)':''}
              </div>
              {/* Single Google Maps button — opens real nearby local stores for this category */}
              <div onClick={()=>window.open(localMapsUrl, '_blank', 'noopener,noreferrer')}
                style={{background:'rgba(26,158,92,0.12)',border:'1px solid rgba(26,158,92,0.35)',borderRadius:12,padding:'12px 14px',display:'flex',alignItems:'center',gap:12,cursor:'pointer',marginBottom:8}}>
                <div style={{fontSize:'1.4rem'}}>🗺️</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:'0.86rem',fontWeight:700,color:C.g}}>
                    {localSearchTerm} {lang==='de'?'finden':'find'}
                  </div>
                  <div style={{fontSize:'0.65rem',color:C.m}}>
                    {lat ? (lang==='de'?'GPS aktiv — echte Ergebnisse in deiner Nähe':'GPS active — real results near you') : (lang==='de'?'Google Maps öffnen und suchen':'Open Google Maps to search')}
                  </div>
                </div>
                <div style={{color:C.g,fontWeight:700}}>→</div>
              </div>

            {/* ONLINE-SHOPS — category-specific + generic */}
            <div style={s.card}>
              <div style={{fontSize:'0.62rem',fontWeight:700,color:C.m,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10}}>
                🛒 {lang==='de'?'Online-Shops':'Online Shops'}
              </div>
              {/* Category-specific online stores (Autodoc for car, MediaMarkt for tech, etc.) */}
              {localStores.map((st,i)=>(
                <div key={`cat-${i}`} onClick={()=>window.open(st.u(shopQueryClean(pResults.searchQ)), '_blank', 'noopener,noreferrer')} style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'10px 14px',display:'flex',alignItems:'center',gap:12,cursor:'pointer',marginBottom:7}}>
                  <div style={{flex:1}}><div style={{fontSize:'0.86rem',fontWeight:700,display:'flex',alignItems:'center',gap:8}}>{st.n}{st.badge&&<span style={{background:C.o,color:'#fff',fontSize:'0.5rem',padding:'2px 7px',borderRadius:100,fontWeight:700}}>{st.badge}</span>}</div></div>
                  <div style={{color:C.m}}>→</div>
                </div>
              ))}
              {/* Generic online stores (Amazon, eBay, Idealo) */}
              {onlineStores.map((st,i)=>(
                <div key={`gen-${i}`} onClick={()=>window.open(st.u(shopQueryClean(pResults.searchQ)), '_blank', 'noopener,noreferrer')} style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'10px 14px',display:'flex',alignItems:'center',gap:12,cursor:'pointer',marginBottom:7}}>
                  <div style={{flex:1}}><div style={{fontSize:'0.86rem',fontWeight:700}}>{st.n}</div></div>
                  <div style={{color:C.m}}>→</div>
                </div>
              ))}
            </div>
          </>}
          {/* Affiliate disclosure — shown only when shop links are visible */}
          <div style={{textAlign:'center',padding:'12px 16px 4px',fontSize:'0.65rem',color:'rgba(255,255,255,0.2)',lineHeight:1.5}}>
            As an Amazon Associate, FixIt may earn from qualifying purchases.
          </div>
        </Scroll>
        <NavBar screen={screen} t={t} goto={goto}/>
        <style>{CSS}</style>
      </Screen>
    );
  }

  return null;
}
