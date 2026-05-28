
import React, { useState, useEffect, useRef, useCallback } from 'react';
import './index.js';
import './index.css';

// Per-weather-class image pools — multiple images rotate every 60s with a 1.8s crossfade.
const IMAGE_POOLS = {
  extreme:      [require('./assets/extreme.jpg'), require('./assets/extreme02.jpg'), require('./assets/extreme3.jpg')],
  thunderstorm: [require('./assets/thunderstorm.jpg'), require('./assets/thunderstorm-navi--IA90Li4PYM-unsplash.jpg')],
  'heavy-rain': [require('./assets/rain.jpg'), require('./assets/rain-stainless-images-JzCf5Y3XmFU-unsplash.jpg')],
  rain:         [require('./assets/rain.jpg'), require('./assets/rain-stainless-images-JzCf5Y3XmFU-unsplash.jpg')],
  snow:         [require('./assets/snow.jpg'), require('./assets/snow-aaron-burden-5AiWn2U10cw-unsplash.jpg'), require('./assets/snow-AdobeStock_468560656.jpeg')],
  ice:          [require('./assets/ice.jpg'), require('./assets/ice0.jpg')],
  clouds:       [require('./assets/clouds.jpg'), require('./assets/clouds-carlos-torres-MHNjEBeLTgw-unsplash.jpg'), require('./assets/clouds-wolf-zimmermann-6sf5rf8QYFE-unsplash.jpg')],
  mist:         [require('./assets/mist.jpg'), require('./assets/mist-cool-antoine-rault-IhWRrZx4-kk-unsplash.jpg')],
  scorching:    [require('./assets/scorching.jpg'), require('./assets/scorching-monir-hossain-FAlMcMtmpEw-unsplash.jpg'), require('./assets/scorching-muhammad-usman-hsrz7xgMENg-unsplash.jpg')],
  hot:          [require('./assets/hot.jpg')],
  warm:         [require('./assets/warm.jpg')],
  moderate:     [require('./assets/moderate-simon-henrotte-HSGUMuJoTAA.jpg'), require('./assets/moderate-jeremy-bishop-EwKXn5CapA4-unsplash.jpg'), require('./assets/moderate-inside-dreamatorium-HpVjCnD3pqs-unsplash.jpg')],
  cold:         [require('./assets/cold.jpg'), require('./assets/cold-pasqualino-capobianco-YPrpSi9Wbxs-unsplash.jpg')],
  midnight:     [require('./assets/night.jpg'), require('./assets/midnight-paul-lichtblau-qVotvbsuM_c-unsplash.jpg'), require('./assets/midnight-tony-dearwester-s2HFSEfOilA-unsplash.jpg')],
  night:        [require('./assets/night.jpg'), require('./assets/night-clouds-gregoire-jeanneau-9sxeKzuCVoE-unsplash.jpg')],
  sunrise:      [require('./assets/sunrise.jpg'), require('./assets/sunrise0.jpg')],
  sunset:       [require('./assets/sunset.jpg'), require('./assets/sunset-vivaan-trivedii-BhydQXA-sio-unsplash.jpg')],
  clear:        [require('./assets/clear.jpg')],
};

// Splash screen slideshow — cycles through weather types while no city is loaded.
const SPLASH_SEQUENCE = [
  require('./assets/night.jpg'),
  require('./assets/sunrise.jpg'),
  require('./assets/warm.jpg'),
  require('./assets/clouds.jpg'),
  require('./assets/rain.jpg'),
  require('./assets/sunset.jpg'),
  require('./assets/snow.jpg'),
  require('./assets/thunderstorm.jpg'),
];

// Returns the correct background image URL for the current weather class
function getBackgroundImageUrl(weather, weatherClass) {
  const pool = IMAGE_POOLS[weatherClass] || [];
  if (!pool.length) return '';
  // Rotate images every 60s based on city, weather, and time
  const city = weather?.name || '';
  const id = weather?.weather?.[0]?.id || 0;
  const temp = Math.round(weather?.main?.temp || 0);
  const timezone = weather?.timezone || 0;
  const localUnix = Math.floor(Date.now() / 1000) + timezone;
  const minuteBlock = Math.floor(localUnix / 60);
  const seed = `${city}-${id}-${temp}-${minuteBlock}`;
  const idx = [...seed].reduce((total, char) => total + char.charCodeAt(0), 0) % pool.length;
  return pool[idx];
}

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
  if (condition === 'Extreme') return 'extreme';
  if (condition === 'Thunderstorm') return 'thunderstorm';
  if (condition === 'Rain' && id >= 502) return 'heavy-rain';
  if (condition === 'Rain' || condition === 'Drizzle') return 'rain';
  if (condition === 'Snow' && temp < 1) return 'ice';
  if (condition === 'Snow') return 'snow';
  // Clouds — temperature extremes first, then time-of-day
  if (condition === 'Clouds') {
    if (temp < 1) return 'ice';
    if (temp <= 5) return 'cold';
    if (temp >= 40) return 'scorching';
    if (temp > 30) return 'hot';
    if (temp > 16) return 'warm';
    if (id === 804 || weather.clouds?.all >= 75) return 'storm-clouds';
    return 'clouds';
  }
  if (['Mist', 'Fog', 'Haze', 'Smoke'].includes(condition)) return 'mist';

  // For all other conditions — check local time of day at searched city
  const now = Math.floor(Date.now() / 1000);
  const localUnix = now + weather.timezone;
  const sunriseLocal = weather.sys.sunrise + weather.timezone;
  const sunsetLocal = weather.sys.sunset + weather.timezone;
  const goldenWindow = 45 * 60;
  const localSecs = ((localUnix % 86400) + 86400) % 86400;
  const localHour = localSecs / 3600;
  const SOCIAL_DUSK_HOUR  = 18.5;
  const SOCIAL_NIGHT_HOUR = 19.5;
  const astroIsNight = localUnix < sunriseLocal - goldenWindow || localUnix > sunsetLocal + goldenWindow;
  const isSocialNight = !astroIsNight && localHour >= SOCIAL_NIGHT_HOUR;
  const isSocialDusk  = !astroIsNight && !isSocialNight && localHour >= SOCIAL_DUSK_HOUR;
  const isNight   = astroIsNight || isSocialNight;
  const isSunrise = !isNight && localUnix < sunriseLocal + goldenWindow;
  const isSunset  = !isNight && !isSunrise && (localUnix > sunsetLocal - goldenWindow || isSocialDusk);
  const isMidnight = localHour >= 23 || localHour < 3;

  // Extreme temps override time-of-day entirely
  if (temp < 1) return 'ice';
  if (temp >= 40) return 'scorching';

  if (isNight && isMidnight) return 'midnight';
  if (isNight) return 'night';
  if (isSunrise) return 'sunrise';
  if (isSunset) return 'sunset';

  // Daytime temperature-based
  if (temp > 30) return 'hot';
  if (temp > 16) return 'warm';
  if (temp > 5) return 'moderate';
  return 'cold';
}

const getWeatherAppClasses = (weather) => {
  if (!weather.main) return '';
  return getWeatherClass(weather);
};

const getWeatherAppStyle = (weather) => {
  if (!weather.main) return undefined;
  const backgroundImageUrl = getBackgroundImageUrl(weather, getWeatherClass(weather));
  return backgroundImageUrl ? { backgroundImage: `url(${backgroundImageUrl})` } : undefined;
};

// Returns true if it is currently night at the searched city
const isNightAtCity = (weather) => {
  if (!weather.sys) return false;
  const now        = Math.floor(Date.now() / 1000);
  const localUnix  = now + weather.timezone;
  const sunrise    = weather.sys.sunrise + weather.timezone;
  const sunset     = weather.sys.sunset  + weather.timezone;
  const localSecs  = ((localUnix % 86400) + 86400) % 86400;
  const localHour  = localSecs / 3600;
  // Social evening: treat 19:30+ as night regardless of astronomical sunset
  return localUnix < sunrise - 30 * 60 || localUnix > sunset + 30 * 60 || localHour >= 19.5;
};

// Returns time-of-day label + icon based on city's local solar position
const getTimeOfDay = (weather) => {
  const now        = Math.floor(Date.now() / 1000);
  const local      = now + weather.timezone;
  const sunrise    = weather.sys.sunrise + weather.timezone;
  const sunset     = weather.sys.sunset  + weather.timezone;
  const dayLen     = sunset - sunrise;
  const golden     = 40 * 60; // 40-minute golden-hour window
  const noonLocal  = sunrise + dayLen / 2;

  const localSecs = ((local % 86400) + 86400) % 86400;
  const localHour  = localSecs / 3600;

  if (local < sunrise - golden)                                    return { label: 'Night',     icon: '🌙' };
  if (local < sunrise)                                             return { label: 'Dawn',      icon: '🌄' };
  if (local < sunrise + golden)                                    return { label: 'Morning',   icon: '🌅' };
  if (local < noonLocal - 60 * 60)                                 return { label: 'Morning',   icon: '☀️' };
  if (local < noonLocal + 60 * 60)                                 return { label: 'Noon',      icon: '🌞' };
  // Social thresholds — dusk at 18:30, evening at 19:30, even before astronomical sunset
  if (localHour >= 19.5 && local < sunset + golden)               return { label: 'Evening',   icon: '🌆' };
  if (localHour >= 18.5 && local < sunset)                        return { label: 'Dusk',      icon: '🌇' };
  if (local < sunset - golden)                                     return { label: 'Afternoon', icon: '🌤️' };
  if (local < sunset)                                              return { label: 'Dusk',      icon: '🌇' };
  if (local < sunset + golden)                                     return { label: 'Evening',   icon: '🌆' };
  return                                                                  { label: 'Night',      icon: '🌙' };
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

// Shared pure helpers — used by summary, hourly and 8-day components
const timeBuilder = (unixTime, timezoneOffset) => {
  const date = new Date((unixTime + timezoneOffset) * 1000);
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

const windDirection = (deg) => {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
};

const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);

// Generates 3 atmospheric, brand-voice sentences from live weather + forecast data.
// No external AI API — pure deterministic narrative built from OWM fields.
const buildWeatherSummary = (weather, forecast) => {
  const city = weather.name;
  const temp = Math.round(weather.main.temp);
  const feelsLike = Math.round(weather.main.feels_like);
  const condition = weather.weather[0].main;
  const id = weather.weather[0].id;
  const humidity = weather.main.humidity;
  const windSpeed = Math.round(weather.wind.speed * 3.6);
  const { label: todLabel } = getTimeOfDay(weather);
  const wClass = getWeatherClass(weather);

  const todPhrase =
    todLabel === 'Night'     ? 'tonight'       :
    todLabel === 'Dawn'      ? 'at dawn'        :
    todLabel === 'Sunrise'   ? 'at sunrise'     :
    todLabel === 'Noon'      ? 'at midday'      :
    todLabel === 'Morning'   ? 'this morning'   :
    todLabel === 'Afternoon' ? 'this afternoon' :
    todLabel === 'Dusk'      ? 'at dusk'        :
    todLabel === 'Evening'   ? 'this evening'   : 'now';

  // ── Opening — atmospheric description of now ──
  let opening;
  if (wClass === 'thunderstorm') {
    opening = `Thunder rolls across ${city}, lightning cutting through sheets of heavy rain.`;
  } else if (wClass === 'extreme') {
    opening = `Severe conditions grip ${city} ${todPhrase} — the atmosphere is unsettled and rapidly changing.`;
  } else if (wClass === 'heavy-rain') {
    opening = `Heavy rain is falling steadily over ${city} ${todPhrase}, the streets running slick with water.`;
  } else if (wClass === 'rain' || condition === 'Drizzle') {
    opening = id >= 300 && id < 400
      ? `A fine drizzle drifts across ${city} ${todPhrase}, soft and quietly persistent.`
      : `Rain moves through ${city} ${todPhrase}, keeping the air cool and the light low.`;
  } else if (wClass === 'snow') {
    opening = `Snow falls quietly over ${city} ${todPhrase}, softening every edge and muffling the world below.`;
  } else if (wClass === 'ice') {
    opening = `A deep freeze has settled over ${city} ${todPhrase}, the cold sharp and unforgiving.`;
  } else if (wClass === 'mist') {
    opening = `A veil of mist hangs over ${city} ${todPhrase}, softening the light and dissolving the distance.`;
  } else if (wClass === 'night') {
    opening = `${city} rests under a quiet night sky ${todPhrase}, still and deep.`;
  } else if (wClass === 'sunrise') {
    opening = `Dawn is breaking over ${city}, the sky warming slowly as the first light arrives.`;
  } else if (wClass === 'sunset') {
    opening = `The day draws to a close over ${city}, the sky painting itself in fading colour.`;
  } else if (wClass === 'clouds') {
    opening = `Clouds drift across ${city} ${todPhrase}, keeping the light soft and the air mild.`;
  } else if (wClass === 'storm-clouds') {
    opening = `Storm clouds gather over ${city} ${todPhrase}, darkening the light without necessarily bringing rain.`;
  } else if (wClass === 'scorching') {
    opening = `An intense heat bears down on ${city} ${todPhrase}, the air shimmering above the ground.`;
  } else if (wClass === 'hot') {
    opening = `Warm, golden light fills ${city} ${todPhrase} beneath open skies.`;
  } else if (wClass === 'warm') {
    opening = `A pleasant warmth settles over ${city} ${todPhrase}, the sky clear and wide.`;
  } else if (wClass === 'moderate') {
    opening = `A moderate, easy temperature settles over ${city} ${todPhrase}, gentle enough for the day to move slowly.`;
  } else if (wClass === 'cold') {
    opening = `Cold, crisp air wraps around ${city} ${todPhrase}, sharp and clean against the skin.`;
  } else {
    opening = `The sky over ${city} ${todPhrase} holds ${weather.weather[0].description}.`;
  }

  // ── Middle — temperature range + texture ──
  const todayLow  = Math.round(weather.main.temp_min);
  const todayHigh = Math.round(weather.main.temp_max);
  const rangePhrase = `a low of ${todayLow}°C to a high of ${todayHigh}°C`;
  let middle;
  const tempDiff = Math.abs(temp - feelsLike);
  if (windSpeed > 50) {
    middle = `Temperatures range from ${rangePhrase}, though winds gusting at ${windSpeed} km/h make it feel far harsher than the numbers suggest.`;
  } else if (windSpeed > 25 && tempDiff >= 3) {
    middle = `Temperatures range from ${rangePhrase}, with the wind pulling the feels-like reading down to ${feelsLike}°C — worth dressing for.`;
  } else if (temp > 30 && humidity > 70) {
    middle = `Temperatures range from ${rangePhrase}, though humidity at ${humidity}% adds a close, heavy weight to the air — the kind you feel in your lungs.`;
  } else if (wClass === 'ice' || temp < -5) {
    middle = `Temperatures range from ${rangePhrase}, feeling like ${feelsLike}°C — exposed skin will feel the bite within moments.`;
  } else if (wClass === 'scorching' || temp >= 38) {
    middle = `Temperatures range from ${rangePhrase}, feeling like ${feelsLike}°C — shade and hydration are not optional today.`;
  } else if (tempDiff >= 4) {
    middle = `Temperatures range from ${rangePhrase}, though it feels closer to ${feelsLike}°C — ${feelsLike < temp ? 'the wind is doing its work' : 'the humidity adds weight to the air'}.`;
  } else {
    middle = `Temperatures range from ${rangePhrase} — ${temp < 10 ? 'cool enough to warrant an extra layer' : temp > 25 ? 'warm and pleasant throughout' : 'comfortable for most of the day'}.`;
  }

  // ── Closing — forecast horizon or reflective note ──
  let closing;
  if (forecast && forecast.length >= 1) {
    const tomorrow = forecast[0];
    const tmrMain = tomorrow.weather[0].main.toLowerCase();
    const tmrHigh = Math.round(tomorrow.main.temp_max);
    const tmrLow  = Math.round(tomorrow.main.temp_min);
    if (tmrMain === 'thunderstorm') {
      closing = `Tomorrow brings thunderstorms — a significant change is already on its way.`;
    } else if (tmrMain === 'rain' || tmrMain === 'drizzle') {
      closing = `Rain is expected tomorrow, with temperatures ranging between ${tmrLow}°C and ${tmrHigh}°C.`;
    } else if (tmrMain === 'snow') {
      closing = `Snow is forecast for tomorrow — conditions will tighten before they ease.`;
    } else if (tmrMain === 'clear') {
      closing = `Clearer skies are ahead tomorrow, with a high of ${tmrHigh}°C.`;
    } else if (tmrMain === 'clouds') {
      closing = `Cloud cover is set to continue into tomorrow, though temperatures should climb to ${tmrHigh}°C.`;
    } else {
      closing = `Tomorrow looks to bring ${tmrMain} conditions, with a high near ${tmrHigh}°C.`;
    }
  } else {
    if (wClass === 'night')                          closing = `A good time to slow down and rest.`;
    else if (wClass === 'sunrise')                   closing = `A new day begins — watch how it unfolds.`;
    else if (wClass === 'rain' || wClass === 'heavy-rain') closing = `The kind of day that calls for staying close to home.`;
    else if (wClass === 'thunderstorm')              closing = `Caution is advised until the storm has passed.`;
    else                                             closing = `Take a moment and look up — the sky always has something to say.`;
  }

  return [opening, middle, closing];
};

function WeatherSummary({ weather, forecast }) {
  const sentences = buildWeatherSummary(weather, forecast);
  return (
    <div className="weather-summary-card">
      <div className="weather-summary-header">
        <span className="weather-summary-icon" aria-hidden="true">✦</span>
        <span className="weather-summary-title">Weather Summary</span>
      </div>
      <p className="weather-summary-body">
        {sentences.join(' ')}
      </p>
    </div>
  );
}

function HourlyForecast({ hourly, timezoneOffset, displayTemp, tempUnit }) {
  return (
    <div className="hourly-section">
      <div className="oc-section-label">Hourly Forecast</div>
      <div className="hourly-strip">
        {hourly.slice(0, 24).map(hour => {
          const d = new Date((hour.dt + timezoneOffset) * 1000);
          const timeStr = `${d.getUTCHours().toString().padStart(2, '0')}:00`;
          const pop = hour.pop ? Math.round(hour.pop * 100) : 0;
          return (
            <div key={hour.dt} className="hourly-card">
              <div className="hourly-time">{timeStr}</div>
              <img
                className="hourly-icon"
                src={`https://openweathermap.org/img/wn/${hour.weather[0].icon}@2x.png`}
                alt={hour.weather[0].description}
              />
              <div className="hourly-temp">{displayTemp(hour.temp)}{tempUnit}</div>
              {pop > 0 && <div className="hourly-pop">💧 {pop}%</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EightDayForecast({ daily, timezoneOffset, displayTemp, tempUnit }) {
  const [openDay, setOpenDay] = useState(null);
  const wDirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

  return (
    <div className="eightday-section">
      <div className="oc-section-label">8-Day Forecast</div>
      <div className="eightday-list">
        {daily.slice(0, 8).map((day, i) => {
          const d = new Date((day.dt + timezoneOffset) * 1000);
          const dayName = i === 0 ? 'Today' : d.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
          const isOpen = openDay === i;
          const pop = day.pop ? Math.round(day.pop * 100) : 0;
          const windKmh = Math.round(day.wind_speed * 3.6);
          const wDir = wDirs[Math.round(day.wind_deg / 45) % 8];
          return (
            <div key={day.dt} className={`eightday-row${isOpen ? ' open' : ''}`}>
              <button
                className="eightday-header"
                onClick={() => setOpenDay(isOpen ? null : i)}
                aria-expanded={isOpen}
              >
                <span className="eightday-dayname">{dayName}</span>
                <img
                  className="eightday-icon"
                  src={`https://openweathermap.org/img/wn/${day.weather[0].icon}@2x.png`}
                  alt={day.weather[0].description}
                />
                <span className="eightday-desc">{capitalize(day.weather[0].main)}</span>
                {pop > 0 && <span className="eightday-pop">💧 {pop}%</span>}
                <span className="eightday-temps">
                  <span className="eightday-high">{displayTemp(day.temp.max)}{tempUnit}</span>
                  <span className="eightday-low">{displayTemp(day.temp.min)}{tempUnit}</span>
                </span>
                <span className={`eightday-chevron${isOpen ? ' open' : ''}`}>›</span>
              </button>
              {isOpen && (
                <div className="eightday-detail">
                  <div className="eightday-detail-grid">
                    <div className="eightday-detail-tile">
                      <div className="eightday-detail-label">Feels like</div>
                      <div className="eightday-detail-value">{displayTemp(day.feels_like.day)}{tempUnit}</div>
                    </div>
                    <div className="eightday-detail-tile">
                      <div className="eightday-detail-label">Humidity</div>
                      <div className="eightday-detail-value">{day.humidity}%</div>
                    </div>
                    <div className="eightday-detail-tile">
                      <div className="eightday-detail-label">Wind</div>
                      <div className="eightday-detail-value">{windKmh} km/h {wDir}</div>
                    </div>
                    <div className="eightday-detail-tile">
                      <div className="eightday-detail-label">UV Index</div>
                      <div className="eightday-detail-value">{Math.round(day.uvi)}</div>
                    </div>
                    <div className="eightday-detail-tile">
                      <div className="eightday-detail-label">Sunrise</div>
                      <div className="eightday-detail-value">{timeBuilder(day.sunrise, timezoneOffset)}</div>
                    </div>
                    <div className="eightday-detail-tile">
                      <div className="eightday-detail-label">Sunset</div>
                      <div className="eightday-detail-value">{timeBuilder(day.sunset, timezoneOffset)}</div>
                    </div>
                    {day.rain != null && (
                      <div className="eightday-detail-tile">
                        <div className="eightday-detail-label">Rain</div>
                        <div className="eightday-detail-value">{day.rain.toFixed(1)} mm</div>
                      </div>
                    )}
                    {day.snow != null && (
                      <div className="eightday-detail-tile">
                        <div className="eightday-detail-label">Snow</div>
                        <div className="eightday-detail-value">{day.snow.toFixed(1)} mm</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Weather alerts (OneCall 3.0) ──
function AlertsBanner({ alerts }) {
  if (!alerts || alerts.length === 0) return null;
  return (
    <div className="alerts-section">
      {alerts.map((alert, i) => (
        <div key={i} className="alert-card">
          <span className="alert-icon" aria-hidden="true">⚠️</span>
          <div className="alert-body">
            <div className="alert-event">{alert.event}</div>
            {alert.sender_name && (
              <div className="alert-source">{alert.sender_name}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Reflections: History placeholder ──
function HistorySection() {
  return (
    <div className="history-section">
      <div className="history-divider" />
      <div className="history-header">
        <span className="history-title">Reflections: History</span>
        <span className="history-tagline">47 Years of Weather Patterns</span>
      </div>
      <p className="history-coming-soon">Coming soon</p>
    </div>
  );
}

// ── Air Quality Index card ────────────────────────────────────────────────────
// Uses OWM /data/2.5/air_pollution — free with any API key, no extra cost.
const AQI_LEVELS = [
  null,
  { label: 'Good',      color: '#4ade80', bg: 'rgba(74, 222, 128, 0.12)'  },
  { label: 'Fair',      color: '#a3e635', bg: 'rgba(163, 230, 53, 0.12)'  },
  { label: 'Moderate',  color: '#facc15', bg: 'rgba(250, 204, 21, 0.12)'  },
  { label: 'Poor',      color: '#fb923c', bg: 'rgba(251, 146, 60, 0.12)'  },
  { label: 'Very Poor', color: '#f87171', bg: 'rgba(248, 113, 113, 0.12)' },
];

function AirPollutionCard({ data }) {
  if (!data) return null;
  const aqi = data.main.aqi;
  const level = AQI_LEVELS[aqi];
  const { co, no2, o3, pm2_5, pm10, so2 } = data.components;
  const pollutants = [
    { label: 'PM2.5', value: pm2_5.toFixed(1), unit: 'μg/m³' },
    { label: 'PM10',  value: pm10.toFixed(1),  unit: 'μg/m³' },
    { label: 'O₃',   value: o3.toFixed(1),    unit: 'μg/m³' },
    { label: 'NO₂',  value: no2.toFixed(1),   unit: 'μg/m³' },
    { label: 'SO₂',  value: so2.toFixed(1),   unit: 'μg/m³' },
    { label: 'CO',   value: (co / 1000).toFixed(2), unit: 'mg/m³' },
  ];
  return (
    <div className="aqi-card">
      <div className="aqi-header">
        <span className="aqi-icon" aria-hidden="true">🌬</span>
        <span className="aqi-title">Air Quality Index</span>
      </div>
      <div className="aqi-index-row">
        <span
          className="aqi-badge"
          style={{ color: level.color, background: level.bg, borderColor: `${level.color}55` }}
        >
          {aqi} &mdash; {level.label}
        </span>
      </div>
      <div className="aqi-components">
        {pollutants.map(({ label, value, unit }) => (
          <div key={label} className="aqi-comp">
            <span className="aqi-comp-label">{label}</span>
            <span className="aqi-comp-value">{value}</span>
            <span className="aqi-comp-unit">{unit}</span>
          </div>
        ))}
      </div>
      <div className="aqi-scale" aria-label={`Air quality: ${level.label}`}>
        {AQI_LEVELS.slice(1).map((l, i) => (
          <div
            key={i}
            className={`aqi-scale-seg${i + 1 === aqi ? ' active' : ''}`}
            style={{ background: l.color }}
            title={l.label}
          />
        ))}
      </div>
    </div>
  );
}

// ── Weather Map card ──────────────────────────────────────────────────────────
// OWM tile overlays are free (1,000 tiles/day). Base map: OpenStreetMap.
const MAP_LAYERS = [
  { id: 'precipitation_new', label: 'Rain' },
  { id: 'clouds_new',        label: 'Clouds' },
  { id: 'wind_new',          label: 'Wind' },
  { id: 'temp_new',          label: 'Temp' },
];

const latLonToTile = (lat, lon, z) => {
  const n = Math.pow(2, z);
  const xf = (lon + 180) / 360 * n;
  const latR = lat * Math.PI / 180;
  const yf = (1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2 * n;
  return { x: Math.floor(xf), y: Math.floor(yf), fx: xf - Math.floor(xf), fy: yf - Math.floor(yf) };
};

function WeatherMapCard({ lat, lon, apiKey }) {
  const [layer, setLayer] = useState('precipitation_new');
  const zoom = 8;
  const { x: tx, y: ty, fx, fy } = latLonToTile(lat, lon, zoom);

  const tiles = [];
  for (let row = -1; row <= 1; row++) {
    for (let col = -1; col <= 1; col++) {
      tiles.push({ tileX: tx + col, tileY: ty + row, left: (col + 1) * 256, top: (row + 1) * 256 });
    }
  }

  // CSS calc centres the exact city lat/lon in the viewport regardless of container width
  const gridStyle = {
    left: `calc(50% - ${(1 + fx) * 256}px)`,
    top:  `calc(50% - ${(1 + fy) * 256}px)`,
  };

  return (
    <div className="weathermap-card">
      <div className="weathermap-header">
        <span className="weathermap-icon" aria-hidden="true">🗺</span>
        <span className="weathermap-title">Weather Map</span>
      </div>
      <div className="weathermap-layers">
        {MAP_LAYERS.map(l => (
          <button
            key={l.id}
            className={`weathermap-layer-btn${layer === l.id ? ' active' : ''}`}
            onClick={() => setLayer(l.id)}
          >{l.label}</button>
        ))}
      </div>
      <div className="weathermap-viewport">
        <div className="weathermap-grid" style={gridStyle}>
          {tiles.map(({ tileX, tileY, left, top }) => (
            <div key={`${tileX}-${tileY}`} className="weathermap-tile" style={{ left, top }}>
              <img
                src={`https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png`}
                alt="" aria-hidden="true" width="256" height="256"
              />
              <img
                src={`https://tile.openweathermap.org/map/${layer}/${zoom}/${tileX}/${tileY}.png?appid=${apiKey}`}
                alt="" aria-hidden="true" width="256" height="256"
                className="weathermap-overlay"
              />
            </div>
          ))}
        </div>
        <div className="weathermap-pin" aria-hidden="true" />
        <div className="weathermap-vignette" />
      </div>
      <p className="weathermap-credit">Map © OpenStreetMap contributors · Weather © OpenWeatherMap</p>
    </div>
  );
}

// ── 10-minute weather cache ──────────────────────────────────────────────────
const CACHE_TTL = 10 * 60 * 1000;

const getWeatherCache = (key) => {
  try {
    const store = JSON.parse(localStorage.getItem('weatherCache') || '{}');
    const entry = store[key];
    if (entry && Date.now() - entry.timestamp < CACHE_TTL) return entry.data;
  } catch { /* */ }
  return null;
};

const setWeatherCache = (key, data) => {
  try {
    const store = JSON.parse(localStorage.getItem('weatherCache') || '{}');
    store[key] = { data, timestamp: Date.now() };
    localStorage.setItem('weatherCache', JSON.stringify(store));
  } catch { /* */ }
};

function App() {
  const [query, setQuery] = useState('');
  const [weather, setWeather] = useState({});
  const [forecast, setForecast] = useState([]);
  const [oneCall, setOneCall] = useState(null);
  const [airPollution, setAirPollution] = useState(null);
  const [error, setError] = useState('');

  // API usage counter — persisted in localStorage, resets daily
  const [apiUsageCount, setApiUsageCount] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('apiUsage')) || {};
      const today = new Date().toISOString().split('T')[0];
      return stored.date === today ? (stored.count || 0) : 0;
    } catch { return 0; }
  });

  const incrementApiUsage = () => {
    const today = new Date().toISOString().split('T')[0];
    const stored = JSON.parse(localStorage.getItem('apiUsage')) || {};
    if (stored.date !== today) { stored.date = today; stored.count = 0; }
    stored.count = (stored.count || 0) + 1;
    localStorage.setItem('apiUsage', JSON.stringify(stored));
    setApiUsageCount(stored.count);
  };
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isCelsius, setIsCelsius] = useState(true);
  const [locating, setLocating] = useState(false);
  const [splashHidden, setSplashHidden] = useState(false);

  // Background crossfade — two slots, JS switches between them for smooth 1.8s fade
  const [bgSlots, setBgSlots] = useState(['', '']);
  const [activeSlot, setActiveSlot] = useState(0);
  const bgPoolRef = useRef([]);
  const bgIndexRef = useRef(0);

  // Splash slideshow — two-slot crossfade, same pattern as bg-layer
  const [splashSlots, setSplashSlots] = useState([SPLASH_SEQUENCE[0], '']);
  const [splashActive, setSplashActive] = useState(0);
  const splashSlideIdxRef = useRef(0);

  // Geocoding dropdown
  const [geoResults, setGeoResults] = useState([]);
  const [geoOpen, setGeoOpen] = useState(false);
  const [geoHighlight, setGeoHighlight] = useState(-1);
  const searchWrapRef = useRef(null);
  const debounceRef = useRef(null);

  // Splash parallax refs — direct DOM manipulation keeps transforms off the render cycle
  const splashRef = useRef(null);
  const splashOrbRef = useRef(null);
  const orbOffsetYRef = useRef(0);
  const touchStartYRef = useRef(null);

  // Header orb parallax ref
  const headerOrbRef = useRef(null);

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

  // Derived weather class — used in crossfade effect and JSX className
  const weatherClass = weather.main ? getWeatherClass(weather) : '';

  // Splash crossfade helper — same two-slot pattern as switchToImage
  const switchSplashImage = useCallback((url) => {
    setSplashActive(prev => {
      const next = 1 - prev;
      setSplashSlots(slots => {
        const updated = [...slots];
        updated[next] = url;
        return updated;
      });
      return next;
    });
  }, []);

  // Stable crossfade helper — writes the new URL into the inactive slot then flips it active
  const switchToImage = useCallback((url) => {
    setActiveSlot(prev => {
      const next = 1 - prev;
      setBgSlots(slots => {
        const updated = [...slots];
        updated[next] = url;
        return updated;
      });
      return next;
    });
  }, []);

  // Weather background — pick pool from IMAGE_POOLS, start at a random image, rotate every 60s
  useEffect(() => {
    if (!weatherClass) return;
    const pool = IMAGE_POOLS[weatherClass] || IMAGE_POOLS.clear;
    bgPoolRef.current = pool;
    bgIndexRef.current = Math.floor(Math.random() * pool.length);
    switchToImage(pool[bgIndexRef.current]);
    if (pool.length <= 1) return;
    const timer = setInterval(() => {
      bgIndexRef.current = (bgIndexRef.current + 1) % bgPoolRef.current.length;
      switchToImage(bgPoolRef.current[bgIndexRef.current]);
    }, 60000);
    return () => clearInterval(timer);
  }, [weatherClass, switchToImage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Splash slideshow — tours all weather types as a preview while no weather is loaded
  useEffect(() => {
    if (splashHidden) return;
    const timer = setInterval(() => {
      splashSlideIdxRef.current = (splashSlideIdxRef.current + 1) % SPLASH_SEQUENCE.length;
      switchSplashImage(SPLASH_SEQUENCE[splashSlideIdxRef.current]);
    }, 5000);
    return () => clearInterval(timer);
  }, [splashHidden, switchSplashImage]);

  // Convert temp for display
  const displayTemp = (c) => isCelsius ? Math.round(c) : Math.round(c * 9/5 + 32);
  const tempUnit = isCelsius ? '°C' : '°F';

  // Fetch forecast (5-day / 3-hourly) and extract one reading per day at midday
  // Returns forecast array — does NOT set state directly
  const fetchForecastData = (param) => {
    incrementApiUsage();
    return fetch(`${api.base}forecast?${param}&units=metric&APPID=${api.key}`)
      .then(res => res.json())
      .then(data => {
        if (!data.list) return [];
        const days = {};
        data.list.forEach(item => {
          const date = item.dt_txt.split(' ')[0];
          const hour = parseInt(item.dt_txt.split(' ')[1]);
          if (!days[date] || Math.abs(hour - 12) < Math.abs(parseInt(days[date].dt_txt.split(' ')[1]) - 12)) {
            days[date] = item;
          }
        });
        return Object.values(days).slice(1, 6);
      })
      .catch(() => []);
  };

  // Returns OneCall data — does NOT set state directly
  const fetchOneCallData = (lat, lon) => {
    incrementApiUsage();
    return fetch(`https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&units=metric&exclude=minutely,alerts&appid=${api.key}`)
      .then(res => res.json())
      .then(data => (data.hourly ? data : null))
      .catch(() => null);
  };

  // Returns Air Pollution data — free with any OWM API key, no extra cost
  const fetchAirPollutionData = (lat, lon) => {
    return fetch(`https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${api.key}`)
      .then(res => res.json())
      .then(data => (data.list && data.list.length > 0 ? data.list[0] : null))
      .catch(() => null);
  };

  // Geolocation — load weather for user's current position (only called on explicit button press)
  const geoLocate = async () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        const cacheKey = `lat:${lat.toFixed(2)}:lon:${lon.toFixed(2)}`;
        const cached = getWeatherCache(cacheKey);
        if (cached) {
          setWeather(cached.weather);
          setForecast(cached.forecast);
          setOneCall(cached.oneCall);
          setAirPollution(cached.airPollution || null);
          setError('');
          setLocating(false);
          setSplashHidden(true);
          return;
        }
        const param = `lat=${lat}&lon=${lon}`;
        incrementApiUsage();
        try {
          const res = await fetch(`${api.base}weather?${param}&units=metric&APPID=${api.key}`);
          const result = await res.json();
          if (result.cod === 401) {
            setError('API key error — check the WEATHER_API_KEY environment variable in Netlify.');
            setLocating(false); setSplashHidden(true); return;
          }
          if (!result.main) {
            setError('Could not fetch weather for your location.');
            setLocating(false); setSplashHidden(true); return;
          }
          const [forecastData, oneCallData, airPollutionData] = await Promise.all([
            fetchForecastData(param),
            fetchOneCallData(lat, lon),
            fetchAirPollutionData(lat, lon),
          ]);
          setWeather(result);
          setForecast(forecastData);
          setOneCall(oneCallData);
          setAirPollution(airPollutionData);
          setError('');
          setLocating(false);
          setSplashHidden(true);
          setWeatherCache(cacheKey, { weather: result, forecast: forecastData, oneCall: oneCallData, airPollution: airPollutionData });
        } catch {
          setError('Could not fetch weather for your location.');
          setLocating(false); setSplashHidden(true);
        }
      },
      () => { setError('Location access denied.'); setLocating(false); setSplashHidden(true); }
    );
  };

  // No auto-fetch on load — weather is fetched only when the user selects a location

  // Safety-net: always dismiss splash after 7s even if geolocation hangs
  useEffect(() => {
    const t = setTimeout(() => setSplashHidden(true), 7000);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Splash parallax — orb drifts upward at 0.35× scroll/swipe speed, fades ~8% at max offset.
  // Direct DOM writes keep transforms off the React render cycle for smooth 60fps compositing.
  useEffect(() => {
    const el = splashRef.current;
    if (!el) return;
    const SPEED = 0.35;
    const MAX_OFFSET = 70; // px upward travel cap
    const FADE_RANGE = 0.08; // opacity reduction at max offset

    const applyTransform = () => {
      if (!splashOrbRef.current) return;
      const y = orbOffsetYRef.current;
      const opacity = 1 - (Math.abs(y) / MAX_OFFSET) * FADE_RANGE;
      splashOrbRef.current.style.transform = `translateY(${y}px)`;
      splashOrbRef.current.style.opacity = opacity;
    };

    const onWheel = (e) => {
      // deltaY > 0 = scroll down → orb drifts up (negative y) but slower
      orbOffsetYRef.current = Math.max(-MAX_OFFSET, Math.min(0, orbOffsetYRef.current - e.deltaY * SPEED));
      applyTransform();
    };

    const onTouchStart = (e) => {
      touchStartYRef.current = e.touches[0].clientY;
    };

    const onTouchMove = (e) => {
      if (touchStartYRef.current === null) return;
      // dy > 0 when finger moves up (scroll-down gesture)
      const dy = touchStartYRef.current - e.touches[0].clientY;
      touchStartYRef.current = e.touches[0].clientY;
      orbOffsetYRef.current = Math.max(-MAX_OFFSET, Math.min(0, orbOffsetYRef.current - dy * SPEED));
      applyTransform();
    };

    const onTouchEnd = () => { touchStartYRef.current = null; };

    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Header orb parallax — drifts down at 0.4× scroll speed, fades gently.
  // Transition duration lengthens in dark/storm conditions for a cinematic feel.
  useEffect(() => {
    const DARK_CLASSES = ['night-mode', 'night', 'thunderstorm', 'extreme', 'heavy-rain', 'ice'];

    const applyTransition = (el) => {
      const appEl = el.closest('.app');
      const isDark = appEl && DARK_CLASSES.some(c => appEl.classList.contains(c));
      const duration = isDark ? '1.2s' : '0.8s';
      el.style.transition = `box-shadow ${duration} ease, filter ${duration} ease`;
    };

    const onScroll = () => {
      if (!headerOrbRef.current) return;
      applyTransition(headerOrbRef.current);
      const y = window.scrollY;
      headerOrbRef.current.style.transform = `translateY(${y * 0.4}px)`;
      headerOrbRef.current.style.opacity = Math.max(0, 1 - y * 0.001);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Persist saved cities to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('savedCities', JSON.stringify(savedCities));
  }, [savedCities]);

  // Time-of-day orb mode — uses API sunrise/sunset for city-local precision.
  // Sets orb--dark (night) or orb--light (day) directly on the element.
  // Also governs transition duration: 1.2s at night (cinematic), 0.8s in daylight.
  useEffect(() => {
    if (!headerOrbRef.current) return;
    const orb = headerOrbRef.current;

    requestAnimationFrame(() => {
      if (!orb) return;

      let isDark;
      if (weather.sys && weather.timezone !== undefined) {
        // Precise: API sunrise/sunset + social dusk threshold (18:30)
        const now = Math.floor(Date.now() / 1000);
        const localUnix    = now                 + weather.timezone;
        const sunriseLocal = weather.sys.sunrise + weather.timezone;
        const sunsetLocal  = weather.sys.sunset  + weather.timezone;
        const localSecs    = ((localUnix % 86400) + 86400) % 86400;
        const localHour    = localSecs / 3600;
        isDark = localUnix < sunriseLocal || localUnix > sunsetLocal || localHour >= 18.5;
      } else {
        // Fallback: device local hour — dusk at 18:30
        const hour = new Date().getHours() + new Date().getMinutes() / 60;
        isDark = hour < 6 || hour >= 18.5;
      }

      orb.classList.toggle('orb--dark',  isDark);
      orb.classList.toggle('orb--light', !isDark);

      const duration = isDark ? '1.2s' : '0.8s';
      orb.style.transition = `box-shadow ${duration} ease, filter ${duration} ease`;
    });
  }, [weather]);

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
  const loadGeoResult = useCallback(async (result) => {
    setGeoOpen(false);
    setQuery('');
    const cacheKey = `lat:${Number(result.lat).toFixed(2)}:lon:${Number(result.lon).toFixed(2)}`;
    const cached = getWeatherCache(cacheKey);
    if (cached) {
      setWeather(cached.weather);
      setForecast(cached.forecast);
      setOneCall(cached.oneCall);
      setAirPollution(cached.airPollution || null);
      setError('');
      return;
    }
    const param = `lat=${result.lat}&lon=${result.lon}`;
    incrementApiUsage();
    try {
      const res = await fetch(`${api.base}weather?${param}&units=metric&APPID=${api.key}`);
      const r = await res.json();
      if (r.cod === '404' || r.cod === 401) {
        setError(`Could not load "${result.name}".`);
        setWeather({});
        setOneCall(null);
        setAirPollution(null);
      } else {
        const [forecastData, oneCallData, airPollutionData] = await Promise.all([
          fetchForecastData(param),
          fetchOneCallData(result.lat, result.lon),
          fetchAirPollutionData(result.lat, result.lon),
        ]);
        setWeather(r);
        setForecast(forecastData);
        setOneCall(oneCallData);
        setAirPollution(airPollutionData);
        setError('');
        setWeatherCache(cacheKey, { weather: r, forecast: forecastData, oneCall: oneCallData, airPollution: airPollutionData });
      }
    } catch { setError('Network error.'); }
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

  const loadPreset = async (city) => {
    setDrawerOpen(false);
    const param = city.lat != null
      ? `lat=${city.lat}&lon=${city.lon}`
      : city.id ? `id=${city.id}` : `q=${city.q}`;
    const cacheKey = city.lat != null
      ? `lat:${Number(city.lat).toFixed(2)}:lon:${Number(city.lon).toFixed(2)}`
      : city.id ? `id:${city.id}` : `q:${city.q.toLowerCase()}`;
    const cached = getWeatherCache(cacheKey);
    if (cached) {
      setWeather(cached.weather);
      setForecast(cached.forecast);
      setOneCall(cached.oneCall);
      setAirPollution(cached.airPollution || null);
      setError('');
      return;
    }
    incrementApiUsage();
    try {
      const res = await fetch(`${api.base}weather?${param}&units=metric&APPID=${api.key}`);
      const result = await res.json();
      if (result.cod === '404' || result.cod === 401) {
        setError(`Could not load "${city.name}".`);
        setWeather({});
        setOneCall(null);
        setAirPollution(null);
      } else {
        const [forecastData, oneCallData, airPollutionData] = await Promise.all([
          fetchForecastData(param),
          fetchOneCallData(result.coord.lat, result.coord.lon),
          fetchAirPollutionData(result.coord.lat, result.coord.lon),
        ]);
        setWeather(result);
        setForecast(forecastData);
        setOneCall(oneCallData);
        setAirPollution(airPollutionData);
        setError('');
        setWeatherCache(cacheKey, { weather: result, forecast: forecastData, oneCall: oneCallData, airPollution: airPollutionData });
      }
    } catch { setError('Network error.'); }
  };

  const doSearch = async () => {
    if (!query.trim()) return;
    const cacheKey = `q:${query.trim().toLowerCase()}`;
    const cached = getWeatherCache(cacheKey);
    if (cached) {
      setWeather(cached.weather);
      setForecast(cached.forecast);
      setOneCall(cached.oneCall);
      setAirPollution(cached.airPollution || null);
      setError('');
      setQuery('');
      return;
    }
    const param = `q=${query}`;
    incrementApiUsage();
    try {
      const res = await fetch(`${api.base}weather?${param}&units=metric&APPID=${api.key}`);
      const result = await res.json();
      if (result.cod === '404' || result.cod === 401) {
        setError(result.cod === 401 ? 'API key error. Check your .env file.' : `City "${query}" not found. Try a research station e.g. McMurdo Station,AQ`);
        setWeather({});
        setOneCall(null);
        setAirPollution(null);
      } else {
        const [forecastData, oneCallData, airPollutionData] = await Promise.all([
          fetchForecastData(param),
          fetchOneCallData(result.coord.lat, result.coord.lon),
          fetchAirPollutionData(result.coord.lat, result.coord.lon),
        ]);
        setWeather(result);
        setForecast(forecastData);
        setOneCall(oneCallData);
        setAirPollution(airPollutionData);
        setError('');
        setWeatherCache(cacheKey, { weather: result, forecast: forecastData, oneCall: oneCallData, airPollution: airPollutionData });
      }
      setQuery('');
    } catch { setError('Network error. Check your connection.'); }
  }

  const dateBuilder = (d) => {
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  // Cinematic grain overlay — active only during British Summer Time (BST = UTC+1),
  // between 18:00 and 21:00 BST, for any weather condition.
  const isCinematicDusk = clock.label === 'BST' && (() => {
    const h = parseInt(clock.time.split(':')[0], 10);
    return h >= 18 && h < 21;
  })();

  return (
    <div className={`app${weatherClass ? ` ${weatherClass}` : ''}${weatherClass && isNightAtCity(weather) ? ' night-mode' : ''}${isCinematicDusk ? ' cinematic-dusk' : ''}`}>
      {/* Background crossfade layers — JS sets backgroundImage + opacity per weather class */}
      <div className="bg-layer" style={{ backgroundImage: bgSlots[0] ? `url(${bgSlots[0]})` : 'none', opacity: activeSlot === 0 ? 1 : 0 }} />
      <div className="bg-layer" style={{ backgroundImage: bgSlots[1] ? `url(${bgSlots[1]})` : 'none', opacity: activeSlot === 1 ? 1 : 0 }} />
      {/* ── App Cover Splash ── */}
      <div ref={splashRef} className={`app-splash${splashHidden ? ' hidden' : ''}`} aria-hidden={splashHidden}>
        <div className="splash-bg-layer" style={{ backgroundImage: splashSlots[0] ? `url(${splashSlots[0]})` : 'none', opacity: splashActive === 0 ? 1 : 0 }} />
        <div className="splash-bg-layer" style={{ backgroundImage: splashSlots[1] ? `url(${splashSlots[1]})` : 'none', opacity: splashActive === 1 ? 1 : 0 }} />
        <div className="splash-content">
          <img
            ref={splashOrbRef}
            className={`splash-orb${locating ? ' orb-loading' : ''}`}
            src={require('./assets/midnightGlowOrb.jpg')}
            alt=""
            aria-hidden="true"
          />
          <h1 className="splash-title">Reflections: Weather Atmosphere</h1>
          <p className="splash-subtitle">A Reflections Experience</p>
          <p className="splash-hint">Search any city &nbsp;·&nbsp; or tap&nbsp;◎&nbsp;to reveal your local conditions</p>
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
          <img
            ref={headerOrbRef}
            className={`reflections-orb${locating ? ' orb-loading' : ''}`}
            src={require('./assets/midnightGlowOrb.jpg')}
            alt=""
            aria-hidden="true"
          />
          <h1 className="reflections-title">Reflections: Weather Atmosphere</h1>
        </header>
        <div className="search-box" ref={searchWrapRef}>
          <div className="search-pill">
            <button className="geo-btn geo-btn--labeled" onClick={geoLocate} aria-label="Use my location" title="Use my location">
              {locating
                ? <svg className="spin" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                : <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="9" strokeDasharray="2 4"/></svg>
              }
              {!locating && <span className="geo-btn-text">My location</span>}
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
              <span className="temp-range-label">H:</span> {displayTemp(weather.main.temp_max)}{tempUnit}
              <span className="temp-range-sep"> &nbsp; </span>
              <span className="temp-range-label">L:</span> {displayTemp(weather.main.temp_min)}{tempUnit}
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
          <WeatherSummary weather={weather} forecast={forecast} />
          {oneCall && (
            <>
              <HourlyForecast
                hourly={oneCall.hourly}
                timezoneOffset={oneCall.timezone_offset}
                displayTemp={displayTemp}
                tempUnit={tempUnit}
              />
              <EightDayForecast
                daily={oneCall.daily}
                timezoneOffset={oneCall.timezone_offset}
                displayTemp={displayTemp}
                tempUnit={tempUnit}
              />
              <AlertsBanner alerts={oneCall.alerts} />
            </>
          )}
          <AirPollutionCard data={airPollution} />
          {weather.coord && (
            <WeatherMapCard
              lat={weather.coord.lat}
              lon={weather.coord.lon}
              apiKey={api.key}
            />
          )}
        </div>
        ) : ('')}
        <HistorySection />
        <footer className="api-usage-footer">
          API usage today: {apiUsageCount} / 2,000
        </footer>
      </main>
    </div>
  );
}

export default App;
