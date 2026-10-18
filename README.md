# Klock

A full-screen clock web app for an old iPad (iOS 12+), meant to sit in the living room.

- Themes: Minimal Dark, Minimal Light, Flip Clock
- 12/24-hour, optional seconds, date (in the iPad's language), optional weather from [Open-Meteo](https://open-meteo.com/) (no API key)
- Tap anywhere to show the gear icon, then tap it to open settings. Settings are stored on the device.
- Reloads itself daily at 03:00 (only if the server is reachable) to pick up new deploys and free memory

## Develop

Plain HTML/CSS/JS in `public/`, no build step. Code must stay ES2017-compatible for Safari 12:

```bash
npm install
npm run check
```

Vercel runs `npm run build` (the same ES2017 check) on every push and serves `public/`.

## iPad setup

1. Open the site in Safari, tap Share → **Add to Home Screen**, and launch Klock from the icon.
2. Settings → Display & Brightness → **Auto-Lock: Never**.
3. Settings → General → Accessibility → **Guided Access**: turn it on, then triple-click the Home button inside Klock to lock the iPad to the app.
