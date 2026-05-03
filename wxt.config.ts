import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'wxt';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const envPath = resolve('.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    process.env[key] = process.env[key] ?? value;
  }
}

const SIGNALING_URL = process.env.VITE_SIGNALING_URL || 'https://smartid2-signaling.fly.dev';
const SIGNALING_WS_URL = SIGNALING_URL.replace(/^https?/, (match) =>
  match === 'https' ? 'wss' : 'ws',
);
const CSP_CONNECT_SRC = [
  "'self'",
  SIGNALING_URL,
  SIGNALING_WS_URL,
]
  .filter(Boolean)
  .join(' ');
const CSP = `connect-src ${CSP_CONNECT_SRC}`;

export default defineConfig({
  modules: ['@wxt-dev/module-react'],

  vite: () => ({
    plugins: [tailwindcss(), react()],
  }),

  hooks: {
    'build:before': (wxt) => {
      console.error('DEBUG build:before - entrypointsDir:', wxt.config.entrypointsDir);
      console.error('DEBUG build:before - wxtDir:', wxt.config.wxtDir);
    },
    'build:manifestGenerated': (wxt) => {
      console.error('DEBUG build:manifestGenerated - entrypointsDir:', wxt.config.entrypointsDir);
    },
  },

  manifest: {
    name: 'Domain Inspector',
    version: '1.0.0',
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAttg73RbMji2rzH+ltq5zbmW+hVBCskDiIz3vObBo9UH48/rSNOLSR5Tj+cn1CsVhH0eIvp+zHI7uz1jt3p1NfAxMO1qHFjNNOjazAlC5kPx14fUlx1gyKd5HjhBeAS6ppYqIq9A+A+3NI5pySJT1exKBMQqK349lmn+aq0qgr/xrW0hXG1oneBqusWvaSfuPKiI5l8yzed/kaX+ckLKI1VvDZmNV6GvCTQFlshXf6e1aYu5M4eTMVIctNxwatQJ4biB63OjMB2ILrkeav+93kJ9VCgr94AW3LOtO5PZmUExggdORuLFCpf1WVliojxdxUv3CsuN7ILnFcbu2xnHW/QIDAQAB',

    permissions: ['storage', 'activeTab', 'alarms', 'offscreen', 'idle'],

    action: {
      default_popup: 'popup.html',
    },

    // Use optional_host_permissions for runtime permission requests
    // Do NOT use <all_urls> - scope to specific target domains
    host_permissions: [],

    web_accessible_resources: [
      {
        resources: ['auth.html'],
        matches: ['<all_urls>'],
      },
    ],

    content_security_policy: {
      extension_pages: [
        "default-src 'self'",
        "script-src 'self'",
        "object-src 'none'",
        CSP,
        "frame-src 'self'",
        "frame-ancestors 'none'",
      ].join('; '),
    },
  },
});
