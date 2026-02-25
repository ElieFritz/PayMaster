const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const cacheDir =
  (process.env.PUPPETEER_CACHE_DIR || '').trim() || path.join(process.cwd(), '.cache', 'puppeteer');

fs.mkdirSync(cacheDir, { recursive: true });

const env = {
  ...process.env,
  PUPPETEER_CACHE_DIR: cacheDir,
};

console.log(`[install-browser] PUPPETEER_CACHE_DIR=${cacheDir}`);
const result = spawnSync('npx puppeteer browsers install chrome', {
  env,
  stdio: 'inherit',
  shell: true,
});

if (result.error) {
  throw result.error;
}

if (typeof result.status === 'number' && result.status !== 0) {
  process.exit(result.status);
}
