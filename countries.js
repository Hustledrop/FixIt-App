export const LANG_TO_CC = {
  de:'DE',fr:'FR',it:'IT',es:'ES',pl:'PL',nl:'NL',pt:'PT',
  sr:'RS',hr:'HR',bs:'BA',sl:'SI',mk:'MK',bg:'BG',sq:'AL',
  ro:'RO',el:'GR',tr:'TR',uk:'UA',cs:'CZ',sv:'SE',da:'DK',
  no:'NO',fi:'FI',en:'GB',ru:'RU',ar:'SA',he:'IL',zh:'CN',
  ja:'JP',ko:'KR',hi:'IN',me:'ME',
};

export const COUNTRIES = {
  DE:{name:"Germany",flag:"🇩🇪",e:"112",fire:"112",police:"110",amb:"112",doc:"116117",
      rs:{n:"ADAC",num:"0800 5 10 11 12"},ph:{n:"Tierärztlicher Notdienst",num:"011612"},pa:{n:"Tierrettung",num:""}},
  AT:{name:"Austria",flag:"🇦🇹",e:"112",fire:"122",police:"133",amb:"144",doc:"141",
      rs:{n:"ÖAMTC",num:"120"},ph:{n:"Tierarzt Notdienst",num:""},pa:{n:"Wiener Tierrettung",num:"699 1780 3808"}},
  CH:{name:"Switzerland",flag:"🇨🇭",e:"112",fire:"118",police:"117",amb:"144",doc:"0900 57 67 47",
      rs:{n:"TCS",num:"0800 140 140"},ph:{n:"Vet Notfall",num:""},pa:{n:"Tierrettung ZH",num:"044 261 41 41"}},
  GB:{name:"UK",flag:"🇬🇧",e:"999",fire:"999",police:"999",amb:"999",doc:"111",
      rs:{n:"AA/RAC",num:"0800 887 766"},ph:{n:"RSPCA 24hr",num:"0300 1234 999"},pa:{n:"PDSA",num:"0800 731 2502"}},
  FR:{name:"France",flag:"🇫🇷",e:"112",fire:"18",police:"17",amb:"15",doc:"116117",
      rs:{n:"AXA Assistance",num:"01 55 92 24 24"},ph:{n:"SPA",num:"01 45 00 25 25"},pa:{n:"Vet Urgence",num:""}},
  ES:{name:"Spain",flag:"🇪🇸",e:"112",fire:"080",police:"091",amb:"061",doc:"",
      rs:{n:"RACE",num:"900 200 093"},ph:{n:"SEPRONA",num:"062"},pa:{n:"Vet Urgencias",num:""}},
  IT:{name:"Italy",flag:"🇮🇹",e:"112",fire:"115",police:"113",amb:"118",doc:"",
      rs:{n:"ACI",num:"803 116"},ph:{n:"LAV",num:"06 4461325"},pa:{n:"Vet Urgenza",num:""}},
  RS:{name:"Serbia",flag:"🇷🇸",e:"112",fire:"193",police:"192",amb:"194",doc:"",
      rs:{n:"AMSS",num:"1987"},ph:{n:"Vet Stanica Beograd",num:"011 2768 258"},pa:{n:"Sklonište Beograd",num:"011 3412 690"}},
  HR:{name:"Croatia",flag:"🇭🇷",e:"112",fire:"193",police:"192",amb:"194",doc:"",
      rs:{n:"HAK",num:"1987"},ph:{n:"Vet Zagreb",num:"01 4444 000"},pa:{n:"Sklonište Zagreb",num:"01 2401 818"}},
  MK:{name:"North Macedonia",flag:"🇲🇰",e:"112",fire:"193",police:"192",amb:"194",doc:"",
      rs:{n:"AMSM",num:"196"},ph:{n:"Vet Klinika Skopje",num:"02 3131 100"},pa:{n:"Azil Skopje",num:""}},
  TR:{name:"Turkey",flag:"🇹🇷",e:"112",fire:"110",police:"155",amb:"112",doc:"182",
      rs:{n:"Türkiye Sigorta",num:"444 8 460"},ph:{n:"Veteriner Acil",num:""},pa:{n:"Hayvan Barınağı",num:""}},
  PL:{name:"Poland",flag:"🇵🇱",e:"112",fire:"998",police:"997",amb:"999",doc:"",
      rs:{n:"PZM",num:"9637"},ph:{n:"TOZ",num:"22 628 21 36"},pa:{n:"Schronisko",num:""}},
  US:{name:"USA",flag:"🇺🇸",e:"911",fire:"911",police:"911",amb:"911",doc:"",
      rs:{n:"AAA",num:"1-800-222-4357"},ph:{n:"ASPCA",num:"888-426-4435"},pa:{n:"Animal Control",num:"311"}},
  AU:{name:"Australia",flag:"🇦🇺",e:"000",fire:"000",police:"000",amb:"000",doc:"",
      rs:{n:"NRMA",num:"13 11 11"},ph:{n:"RSPCA",num:"1300 278 3589"},pa:{n:"Animal Emergency",num:"1300 919 016"}},
  NL:{name:"Netherlands",flag:"🇳🇱",e:"112",fire:"112",police:"112",amb:"112",doc:"",
      rs:{n:"ANWB",num:"088 269 2888"},ph:{n:"Dierenbescherming",num:"0800 1877"},pa:{n:"Dierenambulance",num:""}},
  DEFAULT:{name:"International",flag:"🌍",e:"112",fire:"112",police:"112",amb:"112",doc:"",
           rs:{n:"Local Roadside",num:"112"},ph:{n:"Local Vet",num:""},pa:{n:"Animal Shelter",num:""}},
};

export const getCountry = cc => COUNTRIES[cc] || COUNTRIES.DEFAULT;

// GPS-first country detection — language is ONLY a fallback when GPS unavailable
export function smartCC(gpsCountry, lang) {
  if (gpsCountry && gpsCountry !== 'DEFAULT') return gpsCountry;
  const g = LANG_TO_CC[lang];
  return (g && COUNTRIES[g]) ? g : 'DEFAULT';
}

export function mapsUrlFor(q, lat, lng, cc, lang) {
  const domains = {
    DE:'https://www.google.de/maps',AT:'https://www.google.at/maps',
    CH:'https://www.google.ch/maps',GB:'https://www.google.co.uk/maps',
    FR:'https://www.google.fr/maps',ES:'https://www.google.es/maps',
    IT:'https://www.google.it/maps',RS:'https://www.google.rs/maps',
    HR:'https://www.google.hr/maps',MK:'https://www.google.mk/maps',
    TR:'https://www.google.com.tr/maps',PL:'https://www.google.pl/maps',
    US:'https://www.google.com/maps',AU:'https://www.google.com.au/maps',
  };
  const enc = encodeURIComponent(q);
  if (lat && lng) return `https://www.google.com/maps/search/${enc}/@${lat},${lng},14z`;
  const base = domains[cc] || 'https://www.google.com/maps';
  return `${base}/search/?api=1&query=${enc}&gl=${(cc||'us').toLowerCase()}&hl=${lang||'en'}`;
}

// ── STORES: GPS-based (language is irrelevant for store selection) ────────────
// All URLs use encodeURIComponent on the search term when called
const STORES = {
  car: {
    DE:[
      {n:"Autodoc.de 🚗",u:(q)=>`https://www.autodoc.de/search?keyword=${encodeURIComponent(q)}`,badge:"BEST"},
      {n:"Amazon.de 📦",u:(q)=>`https://www.amazon.de/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
      {n:"eBay.de 🛒",u:(q)=>`https://www.ebay.de/sch/i.html?_nkw=${encodeURIComponent(q)}&_sacat=0`},
      {n:"Idealo.de 💰",u:(q)=>`https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q=${encodeURIComponent(q)}`},
    ],
    AT:[
      {n:"Autodoc.at 🚗",u:(q)=>`https://www.autodoc.at/search?keyword=${encodeURIComponent(q)}`,badge:"BEST"},
      {n:"Amazon.de 📦",u:(q)=>`https://www.amazon.de/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
    ],
    CH:[
      {n:"Autodoc.ch 🚗",u:(q)=>`https://www.autodoc.ch/search?keyword=${encodeURIComponent(q)}`,badge:"BEST"},
      {n:"Amazon.de 📦",u:(q)=>`https://www.amazon.de/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
    ],
    GB:[
      {n:"Autodoc.co.uk 🚗",u:(q)=>`https://www.autodoc.co.uk/search?keyword=${encodeURIComponent(q)}`,badge:"BEST"},
      {n:"Euro Car Parts 🔴",u:(q)=>`https://www.eurocarparts.com/search?q=${encodeURIComponent(q)}`},
      {n:"Amazon.co.uk 📦",u:(q)=>`https://www.amazon.co.uk/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
    ],
    FR:[
      {n:"Autodoc.fr 🚗",u:(q)=>`https://www.autodoc.fr/search?keyword=${encodeURIComponent(q)}`,badge:"BEST"},
      {n:"Amazon.fr 📦",u:(q)=>`https://www.amazon.fr/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
    ],
    US:[
      {n:"AutoZone 🔴",u:(q)=>`https://www.autozone.com/searchresult?searchtext=${encodeURIComponent(q)}`,badge:"BEST"},
      {n:"Amazon 📦",u:(q)=>`https://www.amazon.com/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
      {n:"RockAuto 🔩",u:(q)=>`https://www.rockauto.com/en/partsearch/?query=${encodeURIComponent(q)}`},
    ],
    DEFAULT:[
      {n:"Autodoc 🚗",u:(q)=>`https://www.autodoc.co.uk/search?keyword=${encodeURIComponent(q)}`,badge:"BEST"},
      {n:"Amazon 📦",u:(q)=>`https://www.amazon.com/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
      {n:"eBay 🛒",u:(q)=>`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&_sacat=0`},
    ],
  },
  tech: {
    DE:[
      {n:"MediaMarkt 🔴",u:(q)=>`https://www.mediamarkt.de/de/search.html?query=${encodeURIComponent(q)}`},
      {n:"Saturn 🔵",u:(q)=>`https://www.saturn.de/de/search.html?query=${encodeURIComponent(q)}`},
      {n:"Amazon.de 📦",u:(q)=>`https://www.amazon.de/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
      {n:"Idealo.de 💰",u:(q)=>`https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q=${encodeURIComponent(q)}`},
    ],
    AT:[
      {n:"MediaMarkt 🔴",u:(q)=>`https://www.mediamarkt.at/de/search.html?query=${encodeURIComponent(q)}`},
      {n:"Amazon.de 📦",u:(q)=>`https://www.amazon.de/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
    ],
    CH:[
      {n:"MediaMarkt 🔴",u:(q)=>`https://www.mediamarkt.ch/de/search.html?query=${encodeURIComponent(q)}`},
      {n:"Digitec 💻",u:(q)=>`https://www.digitec.ch/search?q=${encodeURIComponent(q)}`},
    ],
    GB:[
      {n:"Currys 🔵",u:(q)=>`https://www.currys.co.uk/search?q=${encodeURIComponent(q)}`},
      {n:"Amazon.co.uk 📦",u:(q)=>`https://www.amazon.co.uk/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
    ],
    FR:[
      {n:"Fnac 🔵",u:(q)=>`https://www.fnac.com/SearchResult/ResultList.aspx?Search=${encodeURIComponent(q)}`},
      {n:"Darty 🔴",u:(q)=>`https://www.darty.com/nav/extra/search/search.html?type=SIMPLE&query=${encodeURIComponent(q)}`},
      {n:"Amazon.fr 📦",u:(q)=>`https://www.amazon.fr/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
    ],
    US:[
      {n:"Best Buy 🔵",u:(q)=>`https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(q)}`},
      {n:"Amazon 📦",u:(q)=>`https://www.amazon.com/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
    ],
    DEFAULT:[
      {n:"Amazon 📦",u:(q)=>`https://www.amazon.com/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
      {n:"eBay 🛒",u:(q)=>`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&_sacat=0`},
      {n:"Google Shopping 🔍",u:(q)=>`https://www.google.com/search?q=${encodeURIComponent(q)}&tbm=shop`},
    ],
  },
  home: {
    DE:[
      {n:"OBI 🟡",u:(q)=>`https://www.google.com/search?q=site%3Aobi.de+${encodeURIComponent(q)}`},
      {n:"Bauhaus 🏗️",u:(q)=>`https://www.bauhaus.info/suche?q=${encodeURIComponent(q)}`},
      {n:"Amazon.de 📦",u:(q)=>`https://www.amazon.de/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
      {n:"Idealo.de 💰",u:(q)=>`https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q=${encodeURIComponent(q)}`},
    ],
    AT:[
      {n:"OBI 🟡",u:(q)=>`https://www.google.com/search?q=site%3Aobi.at+${encodeURIComponent(q)}`},
      {n:"Bauhaus 🏗️",u:(q)=>`https://www.bauhaus.at/suche?q=${encodeURIComponent(q)}`},
      {n:"Amazon.de 📦",u:(q)=>`https://www.amazon.de/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
    ],
    CH:[
      {n:"Bauhaus 🏗️",u:(q)=>`https://www.bauhaus.ch/suche?q=${encodeURIComponent(q)}`},
      {n:"Amazon.de 📦",u:(q)=>`https://www.amazon.de/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
    ],
    GB:[
      {n:"B&Q 🟡",u:(q)=>`https://www.diy.com/search?q=${encodeURIComponent(q)}`},
      {n:"Screwfix 🔵",u:(q)=>`https://www.screwfix.com/search?q=${encodeURIComponent(q)}`},
      {n:"Amazon.co.uk 📦",u:(q)=>`https://www.amazon.co.uk/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
    ],
    FR:[
      {n:"Leroy Merlin 🟢",u:(q)=>`https://www.leroymerlin.fr/recherche/${encodeURIComponent(q)}`},
      {n:"Castorama 🔵",u:(q)=>`https://www.castorama.fr/search?query=${encodeURIComponent(q)}`},
      {n:"Amazon.fr 📦",u:(q)=>`https://www.amazon.fr/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
    ],
    US:[
      {n:"Home Depot 🟠",u:(q)=>`https://www.homedepot.com/s/${encodeURIComponent(q)}`,badge:"BEST"},
      {n:"Lowe's 🔵",u:(q)=>`https://www.lowes.com/search?searchTerm=${encodeURIComponent(q)}`},
      {n:"Amazon 📦",u:(q)=>`https://www.amazon.com/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
    ],
    MK:[
      {n:"Leroy Merlin 🟢",u:(q)=>`https://www.leroymerlin.rs/pretraga?q=${encodeURIComponent(q)}`},
      {n:"Amazon.de 📦",u:(q)=>`https://www.amazon.de/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
      {n:"eBay 🛒",u:(q)=>`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&_sacat=0`},
    ],
    RS:[
      {n:"Leroy Merlin 🟢",u:(q)=>`https://www.leroymerlin.rs/pretraga?q=${encodeURIComponent(q)}`},
      {n:"Amazon.de 📦",u:(q)=>`https://www.amazon.de/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
    ],
    HR:[
      {n:"Bauhaus 🏗️",u:(q)=>`https://www.bauhaus.hr/suche?q=${encodeURIComponent(q)}`},
      {n:"Leroy Merlin 🟢",u:(q)=>`https://www.leroymerlin.hr/pretraga?q=${encodeURIComponent(q)}`},
    ],
    DEFAULT:[
      {n:"Amazon 📦",u:(q)=>`https://www.amazon.com/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
      {n:"eBay 🛒",u:(q)=>`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&_sacat=0`},
      {n:"Google Shopping 🔍",u:(q)=>`https://www.google.com/search?q=${encodeURIComponent(q)}&tbm=shop`},
    ],
  },
  appliances: {
    DE:[
      {n:"Amazon.de 📦",u:(q)=>`https://www.amazon.de/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
      {n:"MediaMarkt 🔴",u:(q)=>`https://www.mediamarkt.de/de/search.html?query=${encodeURIComponent(q)}`},
      {n:"Saturn 🔵",u:(q)=>`https://www.saturn.de/de/search.html?query=${encodeURIComponent(q)}`},
      {n:"Idealo.de 💰",u:(q)=>`https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q=${encodeURIComponent(q)}`},
    ],
    GB:[
      {n:"Currys 🔵",u:(q)=>`https://www.currys.co.uk/search?q=${encodeURIComponent(q)}`},
      {n:"AO.com 🟡",u:(q)=>`https://ao.com/search?q=${encodeURIComponent(q)}`},
      {n:"Amazon.co.uk 📦",u:(q)=>`https://www.amazon.co.uk/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
    ],
    US:[
      {n:"Best Buy 🔵",u:(q)=>`https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(q)}`},
      {n:"Amazon 📦",u:(q)=>`https://www.amazon.com/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
    ],
    DEFAULT:[
      {n:"Amazon 📦",u:(q)=>`https://www.amazon.com/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
      {n:"eBay 🛒",u:(q)=>`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&_sacat=0`},
      {n:"Google Shopping 🔍",u:(q)=>`https://www.google.com/search?q=${encodeURIComponent(q)}&tbm=shop`},
    ],
  },
  garden: {
    DE:[
      {n:"OBI Garten 🌿",u:(q)=>`https://www.google.com/search?q=site%3Aobi.de+${encodeURIComponent(q)}`},
      {n:"Bauhaus Garten 🌱",u:(q)=>`https://www.bauhaus.info/suche?q=${encodeURIComponent(q)}`},
      {n:"Amazon.de 📦",u:(q)=>`https://www.amazon.de/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
    ],
    GB:[
      {n:"B&Q Garden 🌿",u:(q)=>`https://www.diy.com/search?q=${encodeURIComponent(q)}`},
      {n:"Amazon.co.uk 📦",u:(q)=>`https://www.amazon.co.uk/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
    ],
    US:[
      {n:"Home Depot Garden 🌿",u:(q)=>`https://www.homedepot.com/s/${encodeURIComponent(q)}`},
      {n:"Amazon 📦",u:(q)=>`https://www.amazon.com/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
    ],
    DEFAULT:[
      {n:"Amazon 📦",u:(q)=>`https://www.amazon.com/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
      {n:"Google Shopping 🔍",u:(q)=>`https://www.google.com/search?q=${encodeURIComponent(q)}&tbm=shop`},
    ],
  },
  pets: {
    DE:[
      {n:"Zooplus 🐾",u:(q)=>`https://www.zooplus.de/shop/search?text=${encodeURIComponent(q)}`},
      {n:"Fressnapf 🐕",u:(q)=>`https://www.fressnapf.de/search?query=${encodeURIComponent(q)}`},
      {n:"Amazon.de 📦",u:(q)=>`https://www.amazon.de/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
    ],
    GB:[
      {n:"Pets at Home 🐾",u:(q)=>`https://www.petsathome.com/shop/en/pets/search?q=${encodeURIComponent(q)}`},
      {n:"Amazon.co.uk 📦",u:(q)=>`https://www.amazon.co.uk/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
    ],
    US:[
      {n:"PetSmart 🐾",u:(q)=>`https://www.petsmart.com/search/?q=${encodeURIComponent(q)}`,badge:"BEST"},
      {n:"Amazon 📦",u:(q)=>`https://www.amazon.com/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
    ],
    DEFAULT:[
      {n:"Amazon 📦",u:(q)=>`https://www.amazon.com/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
      {n:"Google Shopping 🔍",u:(q)=>`https://www.google.com/search?q=${encodeURIComponent(q)}&tbm=shop`},
    ],
  },
  bike: {
    DE:[
      {n:"Bike24 🚲",u:(q)=>`https://www.bike24.de/search?q=${encodeURIComponent(q)}`,badge:"TOP"},
      {n:"Fahrrad XXL 🏪",u:(q)=>`https://www.fahrrad-xxl.de/search/?query=${encodeURIComponent(q)}`},
      {n:"ROSE Bikes 🌹",u:(q)=>`https://www.rosebikes.de/search?q=${encodeURIComponent(q)}`},
      {n:"Bike-Discount 💰",u:(q)=>`https://www.bike-discount.de/catalogsearch/result/?q=${encodeURIComponent(q)}`},
      {n:"Decathlon 🏃",u:(q)=>`https://www.decathlon.de/search?Ntt=${encodeURIComponent(q.split(' ').slice(-2).join(' '))}`},
      {n:"Amazon.de 📦",u:(q)=>`https://www.amazon.de/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
      {n:"eBay.de 🛒",u:(q)=>`https://www.ebay.de/sch/i.html?_nkw=${encodeURIComponent(q)}&_sacat=0`},
    ],
    GB:[
      {n:"Wiggle 🔵",u:(q)=>`https://www.wiggle.co.uk/search/?q=${encodeURIComponent(q)}`},
      {n:"Amazon.co.uk 📦",u:(q)=>`https://www.amazon.co.uk/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
    ],
    DEFAULT:[
      {n:"Amazon 📦",u:(q)=>`https://www.amazon.com/s?tag=fixitapp-20&k=${encodeURIComponent(q)}`},
      {n:"eBay 🛒",u:(q)=>`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&_sacat=0`},
    ],
  },
};

// GPS-based store lookup — language plays NO role here
// Category-specific ONLINE stores (previously misnamed as local stores)
export function getCategoryOnlineStores(category, cc) {
  const cat = STORES[category] || STORES.home;
  return cat[cc] || cat.DEFAULT || STORES.home.DEFAULT;
}

// Backward compat alias
export function getStores(category, cc) {
  return getCategoryOnlineStores(category, cc);
}

// Local store search terms per category — used to open Google Maps nearby search
export const LOCAL_STORE_SEARCH = {
  car:        { de:'Autoteile KFZ Teile',            en:'auto parts store' },
  bike:       { de:'Fahrradladen Fahrradgeschäft',   en:'bike shop bicycle store' },
  tech:       { de:'Elektronik Reparatur Handy',      en:'electronics repair phone shop' },
  appliances: { de:'Haushaltsgeräte Reparatur',       en:'appliance repair shop' },
  home:       { de:'Baumarkt Eisenwaren',             en:'hardware store DIY shop' },
  garden:     { de:'Gartencenter Pflanzen',           en:'garden center plant nursery' },
  pets:       { de:'Zoohandlung Tierhandlung',        en:'pet shop pet store' },
};

export function getLocalStoreSearch(category, lang) {
  const entry = LOCAL_STORE_SEARCH[category] || LOCAL_STORE_SEARCH.home;
  return (lang === 'de') ? entry.de : entry.en;
}

export function getOnlineStores(cc) {
  const isDACH = ['DE','AT','CH'].includes(cc);
  const isUK   = cc === 'GB';
  const isFR   = cc === 'FR';
  return [
    {n:`Amazon ${isDACH?'🇩🇪':isUK?'🇬🇧':isFR?'🇫🇷':'🌍'}`,
     u:(q)=>`https://www.${isDACH?'amazon.de':isUK?'amazon.co.uk':isFR?'amazon.fr':'amazon.com'}/s?k=${encodeURIComponent(q)}`},
    {n:`eBay ${isDACH?'🇩🇪':isUK?'🇬🇧':'🌍'}`,
     u:(q)=>`https://www.${isDACH?'ebay.de':isUK?'ebay.co.uk':'ebay.com'}/sch/i.html?_nkw=${encodeURIComponent(q)}&_sacat=0`},
    {n:"Idealo 💰",
     u:(q)=>`https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q=${encodeURIComponent(q)}`},
  ];
}
