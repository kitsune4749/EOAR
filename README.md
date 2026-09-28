# EOAR · Eastern Ontario Air & Allergy (v4.0)

A free web app showing the daily allergy outlook for Eastern Ontario, roughly Pembroke to Hawkesbury and Kingston to Cornwall (64 communities). It includes:

- **Today**: overall allergy outlook, official AQHI air quality, tree/grass/ragweed pollen, mould spores, weather, and tips
- **Forecast**: a 7-day outlook
- **Region**: every community at a glance, sortable, tap to open
- **Journal**: symptom diary that saves the day's conditions and shows your pattern
- **Shots**: immunotherapy injection log with next-due date
- **More**: favourites, backup/restore, CSV export, data sources

Installs to the iPhone home screen and works offline with the last data it loaded.

## Put it online with GitHub Pages (about 5 minutes)

1. Sign in at github.com and click **New repository**. Name it `EOAR`, set it to **Public**, and click **Create repository**.
2. On the new repo page, click **uploading an existing file**. Drag in **everything inside this folder** (the files *and* the `js` and `icons` folders), then click **Commit changes**.
3. Go to **Settings → Pages**. Under *Build and deployment*, choose **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
4. After a minute or two the site is live at `https://YOUR-USERNAME.github.io/EOAR/`.
5. On your iPhone, open that address in **Safari** → **Share** → **Add to Home Screen**.

To update later, upload changed files to the same repo. Phones pick up the new version the next time the app is opened online.

## Data sources

| What | Source | Notes |
|---|---|---|
| Air quality (AQHI) | Environment and Climate Change Canada (api.weather.gc.ca) | Official, nearest station within ~70 km |
| AQHI fallback & 5-day forecast | CAMS model via Open-Meteo | Calculated with Canada's AQHI formula |
| Weather | Open-Meteo | Free for non-commercial use |
| Pollen | Built-in seasonal estimate, adjusted daily for weather | Optional: Google Pollen API (see `config.js`) |
| Mould | Built-in estimate (season, temperature, humidity, rain, snow, leaf litter) | No public mould counts exist for the region |

Journal and shot records never leave the phone. Use **More → Download backup** now and then.

## Files

- `index.html`, `styles.css`: page and look
- `config.js`: settings (default community, optional pollen key)
- `js/communities.js`: the list of communities; add or adjust towns here
- `js/models.js`: pollen, mould and AQHI calculations
- `js/api.js`: data fetching and caching
- `js/app.js`: screens and features
- `service-worker.js`, `manifest.webmanifest`, `icons/`: install and offline support. **If you change any files, bump `CACHE` in `service-worker.js`** (e.g. `eoar-v4.0.1`) so phones pick up the update.

Not medical advice.
