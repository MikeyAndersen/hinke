import {
  defineConfig,
  minimal2023Preset,
} from '@vite-pwa/assets-generator/config';

// Genererer PWA-ikoner ud fra Hinkes emblem (public/icon-source.png) →
// pwa-192x192.png, pwa-512x512.png, maskable-icon-512x512.png,
// apple-touch-icon-180x180.png, favicon.ico.
export default defineConfig({
  preset: minimal2023Preset,
  images: ['public/icon-source.png'],
});
