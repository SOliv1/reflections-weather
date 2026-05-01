import React, { useState, useEffect, useRef, useCallback } from 'react';
import './index.js';
import './index.css';

// Country code → flag emoji
const flag = (code) => code
  ? String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E6 - 65 + c.charCodeAt(0)))
  : '';

const api = {
  key: process.env.REACT_APP_API_KEY,
  base: "https://api.openweathermap.org/data/2.5/"
}

// OpenWeatherMap returns weather[0].main for condition and weather[0].id for detail.
// Rain IDs 502-504, 522 = heavy/very heavy/extreme rain.
// For clear/temperature-based conditions, sunrise/sunset/night override based on local time.
const getWeatherClass = (weather) => {
  if (!weather.weather) return '';
  const condition = weather.weather[0].main;
  const id = weather.weather[0].id;
  const temp = weather.main.temp;

  // Condition-specific images always win (rain/storm/snow/mist look the same day or night)
  if (condition === 'Extreme') return 'extreme'; // hurricane, tornado, tropical storm, hail (IDs 900-906)
  if (condition === 'Thunderstorm') return 'thunderstorm';
  if (condition === 'Rain' && id >= 502) return 'heavy-rain';
  if (condition === 'Rain' || condition === 'Drizzle') return 'rain';
  // Snow at extreme cold shows ice image instead
  if (condition === 'Snow' && temp < -1) return 'ice';
  if (condition === 'Snow') return 'snow';
  // For clouds, temperature wins at extremes
  if (condition === 'Clouds') {
    if (temp < -1) return 'ice';
    if (temp <= 5) return 'cold';
    if (temp >= 40) return 'scorching';
    if (temp > 30) return 'hot';
    return 'clouds';
  }
  if (['Mist', 'Fog', 'Haze', 'Smoke'].includes(condition)) return 'mist';

  // For clear/warm/hot/cold — check local time of day at searched city
  const now = Math.floor(Date.now() / 1000); // current UTC unix
  const localUnix = now + weather.timezone;  // shift to city's local time
  const sunriseLocal = weather.sys.sunrise + weather.timezone;
  const sunsetLocal = weather.sys.sunset + weather.timezone;
  const goldenWindow = 45 * 60; // 45 minutes in seconds

  // Extreme temps override time-of-day entirely
  if (temp < -1) return 'ice';
  if (temp >= 40) return 'scorching';

  if (localUnix < sunriseLocal - goldenWindow || localUnix > sunsetLocal + goldenWindow) return 'night';
  if (localUnix < sunriseLocal + goldenWindow) return 'sunrise';
  if (localUnix > sunsetLocal - goldenWindow) return 'sunset';

  // Daytime temperature-based
  if (temp > 30) return 'hot';
  if (temp > 16) return 'warm';
  return 'cold';
}

// Returns time-of-day label + icon based on city's local solar position
const getTimeOfDay = (weather) => {
  const now        = Math.floor(Date.now() / 1000);
  const local      = now + weather.timezone;
  const sunrise    = weather.sys.sunrise + weather.timezone;
  const sunset     = weather.sys.sunset  + weather.timezone;
  const dayLen     = sunset - sunrise;
  const golden     = 40 * 60; // 40-minute golden-hour window
  const noonLocal  = sunrise + dayLen / 2;

  if (local < sunrise - golden)                         return { label: 'Night',       icon: '🌙' };
  if (local < sunrise)                                  return { label: 'Dawn',        icon: '🌄' };
  if (local < sunrise + golden)                         return { label: 'Morning',     icon: '🌅' };
  if (local < noonLocal - 60 * 60)                      return { label: 'Morning',     icon: '☀️' };
  if (local < noonLocal + 60 * 60)                      return { label: 'Noon',        icon: '🌞' };
  if (local < sunset - golden)                          return { label: 'Afternoon',   icon: '🌤️' };
  if (local < sunset)                                   return { label: 'Dusk',        icon: '🌇' };
  if (local < sunset + golden)                          return { label: 'Evening',     icon: '🌆' };
  return                                                       { label: 'Night',       icon: '🌙' };
};

function TimeOfDayBadge({ weather }) {
  const { label, icon } = getTimeOfDay(weather);
  return (
    <div className="tod-badge">
      <span className="tod-icon">{icon}</span>
      <span className="tod-label">{label}</span>
    </div>
  );
}

// Computes city local time from OWM timezone offset (UTC seconds)
const getCityTimeData = (tzOffsetSec) => {
  const d = new Date(Date.now() + tzOffsetSec * 1000);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const s = d.getUTCSeconds();
  const abs = Math.abs(tzOffsetSec);
  const tzH = Math.floor(abs / 3600);
  const tzM = Math.floor((abs % 3600) / 60);
  const sign = tzOffsetSec >= 0 ? '+' : '-';
  return {
    timeStr: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    hourDeg: ((h % 12) + m / 60) * 30,
    minDeg:  (m + s / 60) * 6,
    tzStr: tzM > 0
      ? `UTC${sign}${tzH}:${String(tzM).padStart(2, '0')}`
      : `UTC${sign}${tzH}`,
  };
};

// Shared SVG clock renderer
function ClockFace({ label, timeStr, tzLabel, hourDeg, minDeg }) {
  const px = (deg, r) => 50 + r * Math.sin(deg * Math.PI / 180);
  const py = (deg, r) => 50 - r * Math.cos(deg * Math.PI / 180);
  return (
    <div className="city-clock-wrap">
      <div className="city-clock-label">{label}</div>
      <svg className="clock-face" viewBox="0 0 100 100" aria-label={`${label} ${timeStr}`}>
        <circle cx="50" cy="50" r="46" fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" />
        {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(ang => {
          const rad = (ang - 90) * Math.PI / 180;
          const major = ang % 90 === 0;
          return (
            <line key={ang}
              x1={50 + (major ? 34 : 39) * Math.cos(rad)} y1={50 + (major ? 34 : 39) * Math.sin(rad)}
              x2={50 + 44 * Math.cos(rad)}                 y2={50 + 44 * Math.sin(rad)}
              stroke={major ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.25)'}
              strokeWidth={major ? 2.5 : 1} strokeLinecap="round"
            />
          );
        })}
        <line x1="50" y1="50" x2={px(hourDeg, 24)} y2={py(hourDeg, 24)} stroke="#fff" strokeWidth="4" strokeLinecap="round" />
        <line x1="50" y1="50" x2={px(minDeg,  35)} y2={py(minDeg,  35)} stroke="rgba(255,255,255,0.85)" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="50" cy="50" r="3.5" fill="#fff" />
      </svg>
      <div className="city-clock-info">
        <span className="city-clock-time">{timeStr}</span>
        <span className="city-clock-tz">{tzLabel}</span>
      </div>
    </div>
  );
}

// Home (London / BST) clock — driven by the App clock state string
function HomeClockFace({ clockTime, clockLabel }) {
  const [h, m, s] = clockTime.split(':').map(Number);
  const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return (
    <ClockFace
      label="London"
      timeStr={timeStr}
      tzLabel={clockLabel}
      hourDeg={((h % 12) + m / 60) * 30}
      minDeg={(m + s / 60) * 6}
    />
  );
}

// City local time clock — driven by OWM timezone offset
function CityClockFace({ timezone }) {
  const { timeStr, hourDeg, minDeg, tzStr } = getCityTimeData(timezone);
  return (
    <ClockFace
      label="Local time"
      timeStr={timeStr}
      tzLabel={tzStr}
      hourDeg={hourDeg}
      minDeg={minDeg}
    />
  );
}

function App() {
  const [query, setQuery] = useState('');
  const [weather, setWeather] = useState({});
  const [forecast, setForecast] = useState([]);
  const [error, setError] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isCelsius, setIsCelsius] = useState(true);
  const [locating, setLocating] = useState(false);
  const [splashHidden, setSplashHidden] = useState(false);

  // Geocoding dropdown
  const [geoResults, setGeoResults] = useState([]);
  const [geoOpen, setGeoOpen] = useState(false);
  const [geoHighlight, setGeoHighlight] = useState(-1);
  const searchWrapRef = useRef(null);
  const debounceRef = useRef(null);

  // Saved cities (persisted in localStorage)
  const [savedCities, setSavedCities] = useState(() => {
    try { return JSON.parse(localStorage.getItem('savedCities') || '[]'); }
    catch { return []; }
  });

  // Subtle live BST clock — HH:MM ticking alongside the date
  const getBSTTime = () => new Date().toLocaleTimeString('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const getBSTLabel = () => new Date().toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    timeZoneName: 'short',
  }).split(' ').pop();

  const [clock, setClock] = useState({ time: getBSTTime(), label: getBSTLabel() });

  useEffect(() => {
    const tick = setInterval(() => setClock({ time: getBSTTime(), label: getBSTLabel() }), 1000);
    return () => clearInterval(tick);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Convert temp for display
  const displayTemp = (c) => isCelsius ? Math.round(c) : Math.round(c * 9/5 + 32);
  const tempUnit = isCelsius ? '°C' : '°F';

  // Fetch forecast (5-day / 3-hourly) and extract one reading per day at midday
  const fetchForecast = (param) => {
    fetch(`${api.base}forecast?${param}&units=metric&APPID=${api.key}`)
      .then(res => res.json())
      .then(data => {
        if (!data.list) return;
        // Pick the reading closest to 12:00 for each unique date
        const days = {};
        data.list.forEach(item => {
          const date = item.dt_txt.split(' ')[0];
          const hour = parseInt(item.dt_txt.split(' ')[1]);
          if (!days[date] || Math.abs(hour - 12) < Math.abs(parseInt(days[date].dt_txt.split(' ')[1]) - 12)) {
            days[date] = item;
          }
        });
        setForecast(Object.values(days).slice(1, 6)); // skip today, show next 5
      });
  };

  // Geolocation — load weather for user's current position
  const geoLocate = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        const param = `lat=${lat}&lon=${lon}`;
        fetch(`${api.base}weather?${param}&units=metric&APPID=${api.key}`)
          .then(res => res.json())
          .then(result => {
            setWeather(result);
            setError('');
            setLocating(false);
            setSplashHidden(true);
            fetchForecast(param);
          })
          .catch(() => { setError('Could not fetch weather for your location.'); setLocating(false); setSplashHidden(true); });
      },
      () => { setError('Location access denied.'); setLocating(false); setSplashHidden(true); }
    );
  };

  // Auto-geolocate on first load
  useEffect(() => { geoLocate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Safety-net: always dismiss splash after 7s even if geolocation hangs
  useEffect(() => {
    const t = setTimeout(() => setSplashHidden(true), 7000);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist saved cities to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('savedCities', JSON.stringify(savedCities));
  }, [savedCities]);

  // Geocoding autocomplete — debounce 400 ms, call OWM /geo/1.0/direct
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim() || query.length < 2) { setGeoResults([]); setGeoOpen(false); return; }
    debounceRef.current = setTimeout(() => {
      fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=6&appid=${api.key}`)
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data) && data.length > 0) {
            setGeoResults(data);
            setGeoOpen(true);
            setGeoHighlight(-1);
          } else {
            setGeoResults([]);
            setGeoOpen(false);
          }
        })
        .catch(() => { setGeoResults([]); setGeoOpen(false); });
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown when clicking outside the search area
  useEffect(() => {
    const handler = (e) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) {
        setGeoOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Load weather from a geocode result (lat/lon)
  const loadGeoResult = useCallback((result) => {
    setGeoOpen(false);
    setQuery('');
    const param = `lat=${result.lat}&lon=${result.lon}`;
    fetch(`${api.base}weather?${param}&units=metric&APPID=${api.key}`)
      .then(res => res.json())
      .then(r => {
        if (r.cod === '404' || r.cod === 401) {
          setError(`Could not load "${result.name}".`);
          setWeather({});
        } else {
          setWeather(r);
          setError('');
          fetchForecast(param);
        }
      })
      .catch(() => setError('Network error.'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Saved city helpers
  const saveCurrentCity = useCallback(() => {
    if (!weather.main) return;
    const entry = {
      name: weather.name,
      country: weather.sys.country,
      lat: weather.coord.lat,
      lon: weather.coord.lon,
    };
    setSavedCities(prev => {
      if (prev.some(c => c.lat === entry.lat && c.lon === entry.lon)) return prev;
      return [entry, ...prev];
    });
  }, [weather]);

  const removeSavedCity = useCallback((city) => {
    setSavedCities(prev => prev.filter(c => !(c.lat === city.lat && c.lon === city.lon)));
  }, []);

  const isSaved = weather.main && savedCities.some(
    c => c.lat === weather.coord?.lat && c.lon === weather.coord?.lon
  );

  // Keyboard nav for dropdown
  const handleSearchKeyDown = (e) => {
    if (!geoOpen) { if (e.key === 'Enter') doSearch(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setGeoHighlight(h => Math.min(h + 1, geoResults.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setGeoHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (geoHighlight >= 0) loadGeoResult(geoResults[geoHighlight]); else doSearch(); }
    else if (e.key === 'Escape') { setGeoOpen(false); }
  };

  const presets = [
    { label: '🧊 Ice & Extreme Cold', cities: [
      { name: 'Esperanza, Antarctica', lat: -63.399, lon: -56.999 },
      { name: 'Yakutsk, Russia',        q: 'Yakutsk,RU' },
      { name: 'Barrow, Alaska',         lat: 71.2906, lon: -156.7887 },
      { name: 'Reykjavik, Iceland',     q: 'Reykjavik,IS' },
      { name: 'Nuuk, Greenland',        lat: 64.1835, lon: -51.7216 },
    ]},
    { label: '❄️ Snow & Cold', cities: [
      { name: 'Tromso, Norway',         lat: 69.6489, lon: 18.9551 },
      { name: 'Helsinki, Finland',      q: 'Helsinki,FI' },
      { name: 'Anchorage, Alaska',      q: 'Anchorage,US' },
      { name: 'Montreal, Canada',       q: 'Montreal,CA' },
      { name: 'Ulan Bator, Mongolia',   lat: 47.9077, lon: 106.8832 },
    ]},
    { label: '🌧️ Rain & Storms', cities: [
      { name: 'Bergen, Norway',         q: 'Bergen,NO' },
      { name: 'Mumbai, India',          q: 'Mumbai,IN' },
      { name: 'Seattle, USA',           q: 'Seattle,US' },
      { name: 'Colombo, Sri Lanka',     q: 'Colombo,LK' },
      { name: 'Manaus, Brazil',         q: 'Manaus,BR' },
    ]},
    { label: '☁️ Clouds & Mist', cities: [
      { name: 'London, UK',             q: 'London,GB' },
      { name: 'San Francisco, USA',     lat: 37.7749, lon: -122.4194 },
      { name: 'Brussels, Belgium',      q: 'Brussels,BE' },
      { name: 'Chengdu, China',         q: 'Chengdu,CN' },
      { name: 'Lima, Peru',             q: 'Lima,PE' },
    ]},
    { label: '🌤️ Mild & Warm', cities: [
      { name: 'Lisbon, Portugal',       q: 'Lisbon,PT' },
      { name: 'Sydney, Australia',      q: 'Sydney,AU' },
      { name: 'Johannesburg, S. Africa',q: 'Johannesburg,ZA' },
      { name: 'Barcelona, Spain',       q: 'Barcelona,ES' },
      { name: 'Tokyo, Japan',           q: 'Tokyo,JP' },
    ]},
    { label: '🌶️ Hot & Scorching', cities: [
      { name: 'Dubai, UAE',             q: 'Dubai,AE' },
      { name: 'Riyadh, Saudi Arabia',   q: 'Riyadh,SA' },
      { name: 'Jacobabad, Pakistan',    lat: 28.2769, lon: 68.4514 },
      { name: 'Ahvaz, Iran',            lat: 31.3203, lon: 48.6692 },
      { name: 'Kufra, Libya',           lat: 24.1747, lon: 23.3074 },
    ]},
  ];

  const loadPreset = (city) => {
    setDrawerOpen(false);
    const param = city.lat != null
      ? `lat=${city.lat}&lon=${city.lon}`
      : city.id ? `id=${city.id}` : `q=${city.q}`;
    fetch(`${api.base}weather?${param}&units=metric&APPID=${api.key}`)
      .then(res => res.json())
      .then(result => {
        if (result.cod === '404' || result.cod === 401) {
          setError(`Could not load "${city.name}".`);
          setWeather({});
        } else {
          setWeather(result);
          setError('');
          fetchForecast(param);
        }
        console.log(result);
      })
      .catch(() => setError('Network error.'));
  };

  const doSearch = () => {
    if (!query.trim()) return;
    const param = `q=${query}`;
    fetch(`${api.base}weather?${param}&units=metric&APPID=${api.key}`)
      .then(res => res.json())
      .then(result => {
        if (result.cod === '404' || result.cod === 401) {
          setError(result.cod === 401 ? 'API key error. Check your .env file.' : `City "${query}" not found. Try a research station e.g. McMurdo Station,AQ`);
          setWeather({});
        } else {
          setWeather(result);
          setError('');
          fetchForecast(param);
        }
        setQuery('');
        console.log(result);
        console.log('Weather class applied:', getWeatherClass(result));
      })
      .catch(() => setError('Network error. Check your connection.'));
  }

  const dateBuilder = (d) => {
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  // Converts Unix timestamp + timezone offset (seconds) to local HH:MM
  const timeBuilder = (unixTime, timezoneOffset) => {
    const date = new Date((unixTime + timezoneOffset) * 1000);
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  // Converts wind degrees to compass bearing
  const windDirection = (deg) => {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(deg / 45) % 8];
  }

  const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);

  return (
    <div className={`app${weather.main ? ` ${getWeatherClass(weather)}` : ''}`}>
      {/* ── App Cover Splash ──
          Replace the placeholder gradient with your cover image by adding to .app-splash in index.css:
            background-image: url('./assets/your-cover-image.jpg');
          Place the image in src/assets/ and update the filename above. */}
      <div className={`app-splash${splashHidden ? ' hidden' : ''}`} aria-hidden={splashHidden}>
        <div className="splash-content">
          <img
            className={`splash-orb${locating ? ' orb-loading' : ''}`}
            src={require('./assets/midnightGlowOrb.jpg')}
            alt=""
            aria-hidden="true"
          />
          <h1 className="splash-title">Reflections: Weather</h1>
          <p className="splash-subtitle">A Reflections Experience</p>
          <div className="splash-status">
            {locating && (
              <>
                <svg className="spin" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                Detecting your location…
              </>
            )}
          </div>
        </div>
      </div>
      <main>
        {/* ── Reflections header: orb + wordmark ── */}
        <header className="reflections-header">
          <div className={`reflections-orb${locating ? ' orb-loading' : ''}`} aria-hidden="true" />
          <h1 className="reflections-title">Reflections: Weather</h1>
        </header>
        <div className="search-box" ref={searchWrapRef}>
          <div className="search-pill">
            <button className="geo-btn" onClick={geoLocate} aria-label="Use my location" title="Use my location">
              {locating
                ? <svg className="spin" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                : <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="9" strokeDasharray="2 4"/></svg>
              }
            </button>
            <input
              type="text"
              className="search-bar"
              placeholder="Search city or &quot;Rome, IT&quot;…"
              onChange={e => setQuery(e.target.value)}
              value={query}
              onKeyDown={handleSearchKeyDown}
              autoComplete="off"
            />
            <button className="search-btn" onClick={doSearch} aria-label="Search">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </button>
          </div>
          {geoOpen && geoResults.length > 0 && (
            <ul className="geo-dropdown" role="listbox">
              {geoResults.map((r, i) => (
                <li
                  key={`${r.lat}-${r.lon}`}
                  className={`geo-result${i === geoHighlight ? ' highlighted' : ''}`}
                  role="option"
                  aria-selected={i === geoHighlight}
                  onMouseEnter={() => setGeoHighlight(i)}
                  onMouseDown={(e) => { e.preventDefault(); loadGeoResult(r); }}
                >
                  <span className="geo-flag">{flag(r.country)}</span>
                  <span className="geo-name">{r.name}{r.state ? `, ${r.state}` : ''}</span>
                  <span className="geo-country">{r.country}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          className={`drawer-toggle${drawerOpen ? ' open' : ''}`}
          onClick={() => setDrawerOpen(o => !o)}
          aria-label="Explore cities"
        >
          <span className="drawer-toggle-icon">{drawerOpen ? '✕' : '🌍'}</span>
          <span className="drawer-toggle-label">{drawerOpen ? 'Close' : 'Explore'}</span>
        </button>
        {drawerOpen && (
          <div className="city-drawer">
            <div className="city-drawer-inner">
              {savedCities.length > 0 && (
                <div className="city-group">
                  <div className="city-group-label">⭐ Saved Cities</div>
                  <div className="city-list">
                    {savedCities.map(city => (
                      <div key={`${city.lat}-${city.lon}`} className="saved-chip-wrap">
                        <button
                          className="city-chip"
                          onClick={() => { loadGeoResult(city); setDrawerOpen(false); }}
                        >
                          {flag(city.country)} {city.name}, {city.country}
                        </button>
                        <button
                          className="saved-chip-remove"
                          onClick={() => removeSavedCity(city)}
                          aria-label={`Remove ${city.name}`}
                        >✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {presets.map(group => (
                <div key={group.label} className="city-group">
                  <div className="city-group-label">{group.label}</div>
                  <div className="city-list">
                    {group.cities.map(city => (
                      <button
                        key={city.name}
                        className="city-chip"
                        onClick={() => loadPreset(city)}
                      >
                        {city.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {error && (
          <div className="error-message">{error}</div>
        )}
        {(typeof weather.main != "undefined") ? (
        <div>
          <div className="location-box">
            <div className="location">
              {weather.name}, {weather.sys.country}
              <button
                className={`save-btn${isSaved ? ' saved' : ''}`}
                onClick={isSaved ? () => removeSavedCity({ lat: weather.coord.lat, lon: weather.coord.lon }) : saveCurrentCity}
                aria-label={isSaved ? 'Remove from saved' : 'Save city'}
                title={isSaved ? 'Remove from saved' : 'Save city'}
              >{isSaved ? '★' : '☆'}</button>
            </div>
            <div className="date">
              {dateBuilder(new Date())}
              <span className="date-clock"> · {clock.time} <span className="date-tz">{clock.label}</span></span>
            </div>
          </div>
          <div className="clocks-row">
            <HomeClockFace clockTime={clock.time} clockLabel={clock.label} />
            <CityClockFace timezone={weather.timezone} />
          </div>
          <TimeOfDayBadge weather={weather} />
          <div className="weather-box">
            <img
              className="weather-icon"
              src={`https://openweathermap.org/img/wn/${weather.weather[0].icon}@2x.png`}
              alt={weather.weather[0].description}
            />
            <div className="temp-row">
              <div className="temp">
                {displayTemp(weather.main.temp)}{tempUnit}
              </div>
              <button
                className="unit-toggle"
                onClick={() => setIsCelsius(c => !c)}
                aria-label="Toggle temperature unit"
              >
                {isCelsius ? '°F' : '°C'}
              </button>
            </div>
            <div className="weather">{capitalize(weather.weather[0].description)}</div>
            <div className="feels-like">Feels like {displayTemp(weather.main.feels_like)}{tempUnit}</div>
            <div className="temp-range">
              ↑ {displayTemp(weather.main.temp_max)}{tempUnit} &nbsp; ↓ {displayTemp(weather.main.temp_min)}{tempUnit}
            </div>
          </div>
          <div className="extra-info">
            <div className="info-tile">
              <div className="info-label">Humidity</div>
              <div className="info-value">{weather.main.humidity}%</div>
            </div>
            <div className="info-tile">
              <div className="info-label">Wind</div>
              <div className="info-value">{Math.round(weather.wind.speed * 3.6)} km/h {windDirection(weather.wind.deg)}</div>
            </div>
            <div className="info-tile">
              <div className="info-label">Visibility</div>
              <div className="info-value">{(weather.visibility / 1000).toFixed(1)} km</div>
            </div>
            <div className="info-tile">
              <div className="info-label">Pressure</div>
              <div className="info-value">{weather.main.pressure} hPa</div>
            </div>
            <div className="info-tile">
              <div className="info-label">Cloud Cover</div>
              <div className="info-value">{weather.clouds.all}%</div>
            </div>
            <div className="info-tile">
              <div className="info-label">Sunrise</div>
              <div className="info-value">{timeBuilder(weather.sys.sunrise, weather.timezone)}</div>
            </div>
            <div className="info-tile">
              <div className="info-label">Sunset</div>
              <div className="info-value">{timeBuilder(weather.sys.sunset, weather.timezone)}</div>
            </div>
          </div>
          {forecast.length > 0 && (
            <div className="forecast-strip">
              {forecast.map(day => (
                <div key={day.dt} className="forecast-card">
                  <div className="forecast-day">
                    {new Date(day.dt * 1000).toLocaleDateString('en-GB', { weekday: 'short' })}
                  </div>
                  <img
                    className="forecast-icon"
                    src={`https://openweathermap.org/img/wn/${day.weather[0].icon}@2x.png`}
                    alt={day.weather[0].description}
                  />
                  <div className="forecast-desc">{capitalize(day.weather[0].main)}</div>
                  <div className="forecast-temp">{displayTemp(day.main.temp_max)}{tempUnit}</div>
                  <div className="forecast-low">{displayTemp(day.main.temp_min)}{tempUnit}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        ) : ('')}
      </main>
    </div>
  );
}

export default App;
