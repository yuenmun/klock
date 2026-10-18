/*
 * Klock: a full-screen clock for an old iPad.
 * Plain ES2017 for Safari 12 (iOS 12): no optional chaining, no `??`,
 * no Object.fromEntries, no AbortController. `npm run check` enforces syntax.
 */
(function () {
  'use strict';

  var SETTINGS_KEY = 'klock.settings';
  var WEATHER_KEY = 'klock.weather';
  var WEATHER_REFRESH_MS = 30 * 60 * 1000;
  var WEATHER_RETRY_MS = 5 * 60 * 1000;
  var WEATHER_STALE_MS = 2 * 60 * 60 * 1000;
  var RELOAD_HOUR = 3;
  var RELOAD_RETRY_MS = 10 * 60 * 1000;
  var GEAR_VISIBLE_MS = 5000;

  var DEFAULTS = {
    theme: 'dark',        // 'dark' | 'light' | 'flip'
    hour12: false,
    showSeconds: false,
    showDate: true,
    showWeather: false,
    units: 'celsius',     // 'celsius' | 'fahrenheit'
    location: null        // { name, region, latitude, longitude }
  };

  var $ = function (id) { return document.getElementById(id); };
  var clockEl = $('clock');
  var infoEl = $('info');
  var dateEl = $('date');
  var weatherEl = $('weather');
  var gearEl = $('gear');
  var settingsEl = $('settings');

  // ---------- Storage ----------

  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }

  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }

  function loadSettings() {
    var stored = load(SETTINGS_KEY) || {};
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      out[k] = stored.hasOwnProperty(k) ? stored[k] : DEFAULTS[k];
    });
    return out;
  }

  var settings = loadSettings();

  // ---------- Time ----------

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function timeParts(d) {
    var h = d.getHours();
    var ampm = '';
    var hours;
    if (settings.hour12) {
      ampm = h < 12 ? 'AM' : 'PM';
      hours = String(h % 12 || 12);
    } else {
      hours = pad(h);
    }
    return { h: hours, m: pad(d.getMinutes()), s: pad(d.getSeconds()), ampm: ampm };
  }

  // ---------- Renderers ----------
  // Each renderer builds DOM once per "shape" and then updates in place.

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  var textRenderer = {
    build: function (p) {
      clockEl.className = 'clock';
      clockEl.innerHTML = '';
      this.hm = el('span', 'hm');
      clockEl.appendChild(this.hm);
      this.ampm = this.sec = null;
      if (p.ampm || settings.showSeconds) {
        var side = el('span', 'side');
        this.ampm = el('span', 'ampm', p.ampm);
        side.appendChild(this.ampm);
        if (settings.showSeconds) {
          this.sec = el('span', 'sec');
          side.appendChild(this.sec);
        }
        clockEl.appendChild(side);
      }
    },
    update: function (p) {
      setText(this.hm, p.h + ':' + p.m);
      if (this.ampm) setText(this.ampm, p.ampm);
      if (this.sec) setText(this.sec, p.s);
    }
  };

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  function makeCard(digit) {
    var card = el('div', 'card');
    card.innerHTML =
      '<div class="half top"><span></span></div>' +
      '<div class="half bottom"><span></span></div>' +
      '<div class="half top flap"><span></span></div>' +
      '<div class="half bottom flap"><span></span></div>';
    var spans = card.querySelectorAll('span');
    card.staticTop = spans[0];
    card.staticBottom = spans[1];
    card.flapTop = spans[2];
    card.flapBottom = spans[3];
    card.value = digit;
    card.staticTop.textContent = card.staticBottom.textContent = digit;
    card.lastChild.addEventListener('animationend', function () {
      card.staticBottom.textContent = card.value;
      card.classList.remove('flipping');
    });
    return card;
  }

  function flipCard(card, digit) {
    if (card.value === digit) return;
    var old = card.value;
    card.value = digit;
    card.staticTop.textContent = digit;
    card.staticBottom.textContent = old;
    card.flapTop.textContent = old;
    card.flapBottom.textContent = digit;
    card.classList.remove('flipping');
    void card.offsetWidth; // restart the CSS animation
    card.classList.add('flipping');
  }

  function cardGroup(str) {
    var group = el('div', 'group');
    var cards = str.split('').map(function (ch) {
      var c = makeCard(ch);
      group.appendChild(c);
      return c;
    });
    return { node: group, cards: cards };
  }

  function updateGroup(group, str) {
    str.split('').forEach(function (ch, i) { flipCard(group.cards[i], ch); });
  }

  var flipRenderer = {
    build: function (p) {
      clockEl.className = 'clock flip';
      clockEl.innerHTML = '';
      this.hours = cardGroup(p.h);
      this.minutes = cardGroup(p.m);
      var sep = el('div', 'sep');
      sep.innerHTML = '<i></i><i></i>';
      clockEl.appendChild(this.hours.node);
      clockEl.appendChild(sep);
      clockEl.appendChild(this.minutes.node);
      this.ampm = this.seconds = null;
      if (p.ampm || settings.showSeconds) {
        var side = el('div', 'side');
        this.ampm = el('span', 'ampm', p.ampm);
        side.appendChild(this.ampm);
        if (settings.showSeconds) {
          this.seconds = cardGroup(p.s);
          side.appendChild(this.seconds.node);
        }
        clockEl.appendChild(side);
      }
    },
    update: function (p) {
      updateGroup(this.hours, p.h);
      updateGroup(this.minutes, p.m);
      if (this.ampm) setText(this.ampm, p.ampm);
      if (this.seconds) updateGroup(this.seconds, p.s);
    }
  };

  // ---------- Layout ----------

  // Scale the clock to fill the screen, leaving room for date/weather.
  function fitClock() {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var hasInfo = !dateEl.hidden || !weatherEl.hidden;
    clockEl.style.fontSize = '100px';
    var w = clockEl.offsetWidth;
    var h = clockEl.offsetHeight;
    var maxW = vw * (vw > vh ? 0.78 : 0.88);
    var maxH = vh * (hasInfo ? 0.52 : 0.72);
    var size = Math.floor(100 * Math.min(maxW / w, maxH / h));
    clockEl.style.fontSize = size + 'px';
    var infoSize = Math.min(size * 0.13, Math.min(vw, vh) * 0.06);
    infoEl.style.fontSize = Math.round(Math.max(16, infoSize)) + 'px';
  }

  // ---------- Render loop ----------

  var shape = '';
  var renderer = null;

  function render(now) {
    var p = timeParts(now);
    var nextShape = [settings.theme, settings.hour12, settings.showSeconds, p.h.length].join('|');
    if (nextShape !== shape) {
      shape = nextShape;
      renderer = settings.theme === 'flip' ? flipRenderer : textRenderer;
      renderer.build(p);
      renderer.update(p);
      renderDate(now);
      fitClock();
    } else {
      renderer.update(p);
      renderDate(now);
    }
  }

  function renderDate(now) {
    var show = settings.showDate;
    if (dateEl.hidden === show) {
      dateEl.hidden = !show;
      fitClock();
    }
    if (show) {
      setText(dateEl, now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }));
    }
  }

  function tick() {
    var now = new Date();
    render(now);
    if (now.getSeconds() === 0 || !tick.started) {
      tick.started = true;
      maybeRefreshWeather(now.getTime());
      renderWeather();
      maybeReload(now.getTime());
    }
    setTimeout(tick, 1000 - new Date().getMilliseconds() + 10);
  }

  // ---------- Weather ----------

  var weather = load(WEATHER_KEY);
  var weatherInFlight = false;
  var lastWeatherAttempt = 0;

  function weatherKey() {
    var loc = settings.location;
    return loc ? [loc.latitude, loc.longitude, settings.units].join(',') : null;
  }

  function maybeRefreshWeather(now, force) {
    if (!settings.showWeather || !settings.location || weatherInFlight) return;
    var fresh = weather && weather.key === weatherKey() && now - weather.fetchedAt < WEATHER_REFRESH_MS;
    if (fresh && !force) return;
    if (!force && now - lastWeatherAttempt < WEATHER_RETRY_MS) return;
    weatherInFlight = true;
    lastWeatherAttempt = now;
    var key = weatherKey();
    KlockWeather.fetchReading(settings.location, settings.units).then(function (reading) {
      reading.key = key;
      weather = reading;
      save(WEATHER_KEY, reading);
    }).catch(function () {
      // Keep the last reading; renderWeather() hides it once stale.
    }).then(function () {
      weatherInFlight = false;
      renderWeather();
    });
  }

  function renderWeather() {
    var show = !!(settings.showWeather && weather && weather.key === weatherKey() &&
      Date.now() - weather.fetchedAt < WEATHER_STALE_MS);
    if (show) {
      var markup = KlockWeather.html(weather);
      if (weatherEl.innerHTML !== markup) weatherEl.innerHTML = markup;
    }
    if (weatherEl.hidden === show) {
      weatherEl.hidden = !show;
      fitClock();
    }
  }

  // ---------- Daily reload ----------
  // Reload at 03:00 to free memory and pick up new deploys, but only if the
  // server is reachable: reloading offline would leave a dead error page.

  function nextReloadTime(from) {
    var d = new Date(from);
    d.setHours(RELOAD_HOUR, 0, 0, 0);
    if (d.getTime() <= from) d.setDate(d.getDate() + 1);
    return d.getTime();
  }

  var reloadAt = nextReloadTime(Date.now());
  var reloadChecking = false;

  function maybeReload(now) {
    if (now < reloadAt || reloadChecking) return;
    reloadChecking = true;
    fetch(location.pathname + '?ping=' + now, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      location.reload();
    }).catch(function () {
      reloadChecking = false;
      reloadAt = now + RELOAD_RETRY_MS;
    });
  }

  // ---------- Gear + settings panel ----------

  var gearTimer = null;

  function showGear() {
    gearEl.classList.add('visible');
    clearTimeout(gearTimer);
    gearTimer = setTimeout(hideGear, GEAR_VISIBLE_MS);
  }

  function hideGear() {
    clearTimeout(gearTimer);
    gearEl.classList.remove('visible');
  }

  function openSettings() {
    hideGear();
    syncControls();
    settingsEl.hidden = false;
    settingsEl.scrollTop = 0;
  }

  function closeSettings() {
    document.activeElement.blur();
    settingsEl.hidden = true;
    $('city-results').innerHTML = '';
  }

  function syncControls() {
    var segs = settingsEl.querySelectorAll('.segmented');
    Array.prototype.forEach.call(segs, function (seg) {
      var value = String(settings[seg.getAttribute('data-setting')]);
      Array.prototype.forEach.call(seg.querySelectorAll('button'), function (btn) {
        btn.classList.toggle('active', btn.getAttribute('data-value') === value);
      });
    });
    Array.prototype.forEach.call(settingsEl.querySelectorAll('.switch'), function (sw) {
      sw.checked = !!settings[sw.getAttribute('data-setting')];
    });
    $('weather-settings').hidden = !settings.showWeather;
    var loc = settings.location;
    $('city-current').textContent = loc
      ? 'Showing weather for ' + loc.name + (loc.region ? ', ' + loc.region : '')
      : 'No city set yet.';
  }

  function applySettings() {
    save(SETTINGS_KEY, settings);
    document.body.className = 'theme-' + settings.theme;
    shape = '';
    syncControls();
    render(new Date());
    maybeRefreshWeather(Date.now(), true);
    renderWeather();
    fitClock();
  }

  function parseValue(raw) {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return raw;
  }

  settingsEl.addEventListener('click', function (e) {
    if (e.target === settingsEl) { closeSettings(); return; }
    var btn = e.target.closest('.segmented button');
    if (btn) {
      var key = btn.parentNode.getAttribute('data-setting');
      settings[key] = parseValue(btn.getAttribute('data-value'));
      applySettings();
      return;
    }
    var pick = e.target.closest('.city-results button');
    if (pick) {
      settings.location = JSON.parse(pick.getAttribute('data-location'));
      $('city-results').innerHTML = '';
      $('city-input').value = '';
      applySettings();
    }
  });

  settingsEl.addEventListener('change', function (e) {
    if (e.target.classList.contains('switch')) {
      settings[e.target.getAttribute('data-setting')] = e.target.checked;
      applySettings();
    }
  });

  $('city-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = $('city-input');
    var query = input.value.trim();
    var results = $('city-results');
    if (!query) return;
    input.blur();
    results.innerHTML = '<li class="hint">Searching…</li>';
    KlockWeather.search(query).then(function (list) {
      if (!list.length) {
        results.innerHTML = '<li class="hint">No cities found.</li>';
        return;
      }
      results.innerHTML = '';
      list.forEach(function (loc) {
        var li = el('li');
        var btn = el('button');
        btn.type = 'button';
        btn.setAttribute('data-location', JSON.stringify(loc));
        btn.appendChild(document.createTextNode(loc.name + ' '));
        btn.appendChild(el('small', null, loc.region));
        li.appendChild(btn);
        results.appendChild(li);
      });
    }).catch(function () {
      results.innerHTML = '<li class="hint">Search failed. Check the connection and try again.</li>';
    });
  });

  $('done').addEventListener('click', closeSettings);
  gearEl.addEventListener('click', openSettings);
  $('stage').addEventListener('click', showGear);

  // ---------- Kiosk hardening ----------

  // Block pinch-zoom and rubber-band scrolling outside the settings panel.
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('touchmove', function (e) {
    if (!e.target.closest('.settings')) e.preventDefault();
  }, { passive: false });

  window.addEventListener('resize', fitClock);
  window.addEventListener('orientationchange', function () { setTimeout(fitClock, 300); });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { shape = ''; render(new Date()); }
  });

  // ---------- Start ----------

  document.body.className = 'theme-' + settings.theme;
  tick();
})();
