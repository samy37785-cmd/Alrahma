const { join } = require('path');

// Keep Chromium inside the project so the path resolves identically during
// `npm install` (download) and `npm run build` (prerender) on Vercel.
module.exports = {
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
