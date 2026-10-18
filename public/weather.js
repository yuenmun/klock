/*
 * Weather data from Open-Meteo (free, no API key) and line-art icons.
 * Plain ES2017 for Safari 12: no optional chaining, no `??`, no AbortController.
 */
window.KlockWeather = (function () {
  'use strict';

  var TIMEOUT_MS = 15000;

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('timeout')); }, ms);
      promise.then(
        function (value) { clearTimeout(timer); resolve(value); },
        function (err) { clearTimeout(timer); reject(err); }
      );
    });
  }

  function getJSON(url) {
    return withTimeout(fetch(url), TIMEOUT_MS).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function search(name) {
    var lang = (navigator.language || 'en').slice(0, 2);
    var url = 'https://geocoding-api.open-meteo.com/v1/search?count=6&format=json' +
      '&language=' + encodeURIComponent(lang) +
      '&name=' + encodeURIComponent(name);
    return getJSON(url).then(function (data) {
      return (data.results || []).map(function (r) {
        return {
          name: r.name,
          region: [r.admin1, r.country].filter(Boolean).join(', '),
          latitude: r.latitude,
          longitude: r.longitude
        };
      });
    });
  }

  function fetchReading(location, units) {
    var url = 'https://api.open-meteo.com/v1/forecast?timezone=auto&forecast_days=1' +
      '&latitude=' + location.latitude +
      '&longitude=' + location.longitude +
      '&current=temperature_2m,weather_code,is_day' +
      '&daily=temperature_2m_max,temperature_2m_min' +
      '&temperature_unit=' + units;
    return getJSON(url).then(function (data) {
      return {
        temp: data.current.temperature_2m,
        code: data.current.weather_code,
        isDay: data.current.is_day === 1,
        high: data.daily.temperature_2m_max[0],
        low: data.daily.temperature_2m_min[0],
        fetchedAt: Date.now()
      };
    });
  }

  // Icon paths adapted from Feather / Lucide (MIT / ISC), 24x24 stroke icons.
  var ICONS = {
    sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 1.5v2M12 20.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M1.5 12h2M20.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
    moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
    partlyDay: '<path d="M12 2v2M4.93 4.93l1.41 1.41M20 12h2M19.07 4.93l-1.41 1.41M15.95 12.65a4 4 0 0 0-5.93-4.13"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6z"/>',
    partlyNight: '<path d="M13 16a3 3 0 1 1 0 6H7a5 5 0 1 1 4.9-6z"/><path d="M10.1 9A6 6 0 0 1 16 4a4 4 0 0 0 6 6 6 6 0 0 1-3 5.2"/>',
    cloud: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
    fog: '<path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2"/><path d="M5 17h14M7 21h10"/>',
    drizzle: '<path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/><path d="M8 19v2M8 13v2M16 19v2M16 13v2M12 21v2M12 15v2"/>',
    rain: '<path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/><path d="M16 13v8M8 13v8M12 15v8"/>',
    snow: '<path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><path d="M8 16h.01M8 20h.01M12 18h.01M12 22h.01M16 16h.01M16 20h.01"/>',
    thunder: '<path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/><path d="M13 11l-4 6h6l-4 6"/>'
  };

  // WMO weather interpretation codes -> icon name.
  function iconName(code, isDay) {
    if (code <= 1) return isDay ? 'sun' : 'moon';
    if (code === 2) return isDay ? 'partlyDay' : 'partlyNight';
    if (code === 3) return 'cloud';
    if (code === 45 || code === 48) return 'fog';
    if (code >= 51 && code <= 57) return 'drizzle';
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if (code >= 95) return 'thunder';
    return 'cloud';
  }

  function deg(n) { return Math.round(n) + '°'; }

  function html(reading) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[iconName(reading.code, reading.isDay)] + '</svg>' +
      '<span class="temp">' + deg(reading.temp) + '</span>' +
      '<span class="range">H ' + deg(reading.high) + '&nbsp;&nbsp;L ' + deg(reading.low) + '</span>';
  }

  return { search: search, fetchReading: fetchReading, html: html };
})();
