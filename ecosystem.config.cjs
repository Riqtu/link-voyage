const fs = require('fs');
const path = require('path');

/** @param {string} filePath */
function parseEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    const q =
      val.startsWith('"') && val.endsWith('"')
        ? '"'
        : val.startsWith("'") && val.endsWith("'")
          ? "'"
          : '';
    if (q) val = val.slice(1, -1);
    env[key] = val;
  }
  return env;
}

const root = __dirname;
const apiEnv = parseEnvFile(path.join(root, 'apps/api/.env'));
const webEnv = parseEnvFile(path.join(root, 'apps/web/.env'));

/** Свободные порты локально (не конфликтуют с 3000–3002 hohma/riqtu). */
const API_PORT = 3100;
const WEB_PORT = 3110;

module.exports = {
  apps: [
    {
      name: 'link-voyage-api',
      cwd: path.join(root, 'apps/api'),
      script: 'dist/main.js',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        ...apiEnv,
        PORT: String(API_PORT),
        WEB_ORIGIN: 'https://link-voyage.ru,https://www.link-voyage.ru',
      },
    },
    {
      name: 'link-voyage-web',
      cwd: path.join(root, 'apps/web'),
      script: './node_modules/next/dist/bin/next',
      args: `start -p ${WEB_PORT} -H 127.0.0.1`,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '800M',
      env: {
        NODE_ENV: 'production',
        ...webEnv,
        NEXT_PUBLIC_API_URL: 'https://link-voyage.ru',
      },
    },
  ],
};
