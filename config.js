// App settings you can change without touching the rest of the code.
export const CONFIG = {
  VERSION: '4.1',

  // Optional: measured pollen from Google's Pollen API instead of the
  // built-in seasonal estimate. Leave blank to use the estimate.
  // If you add a key, restrict it in Google Cloud Console to your site
  // (e.g. https://YOURNAME.github.io/*) and to the Pollen API only,
  // because anything in this file is visible to visitors.
  GOOGLE_POLLEN_KEY: '',

  DEFAULT_COMMUNITY: 'embrun',
  DEFAULT_FAVOURITES: ['embrun', 'ottawa'],
};
