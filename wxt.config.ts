import { loadEnv } from 'vite';
import { defineConfig } from 'wxt';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const env = loadEnv('development', process.cwd(), 'VITE_');

const SIGNALING_URL = env.VITE_SIGNALING_URL || 'https://smartid2-signaling.fly.dev';
const SIGNALING_WS_URL = SIGNALING_URL.replace(/^https?/, (match) =>
  match === 'https' ? 'wss' : 'ws',
);
const CSP_CONNECT_SRC = ["'self'", SIGNALING_URL, SIGNALING_WS_URL].filter(Boolean).join(' ');
const CSP = `connect-src ${CSP_CONNECT_SRC}`;

export default defineConfig({
  modules: ['@wxt-dev/module-react'],

  vite: () => ({
    plugins: [tailwindcss(), react()],
  }),

  manifest: {
    name: 'SmartID2',
    version: '1.0.0',
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAttg73RbMji2rzH+ltq5zbmW+hVBCskDiIz3vObBo9UH48/rSNOLSR5Tj+cn1CsVhH0eIvp+zHI7uz1jt3p1NfAxMO1qHFjNNOjazAlC5kPx14fUlx1gyKd5HjhBeAS6ppYqIq9A+A+3NI5pySJT1exKBMQqK349lmn+aq0qgr/xrW0hXG1oneBqusWvaSfuPKiI5l8yzed/kaX+ckLKI1VvDZmNV6GvCTQFlshXf6e1aYu5M4eTMVIctNxwatQJ4biB63OjMB2ILrkeav+93kJ9VCgr94AW3LOtO5PZmUExggdORuLFCpf1WVliojxdxUv3CsuN7ILnFcbu2xnHW/QIDAQAB',

    permissions: ['storage', 'activeTab', 'alarms', 'offscreen', 'idle', 'scripting'],

    action: {
      default_popup: 'popup.html',
    },

    host_permissions: ['http://*/*', 'https://*/*'],

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
