// @ts-check
import { defineConfig } from 'astro/config';
import AstroPWA from '@vite-pwa/astro';

// https://astro.build/config
export default defineConfig({
  // Statisk output — hostes på Cloudflare Pages.
  output: 'static',
  integrations: [
    AstroPWA({
      registerType: 'autoUpdate',
      // Lad SW virke i `astro dev`, så offline kan testes uden et fuldt build.
      devOptions: { enabled: true, navigateFallback: '/' },
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Hinke Energi — Installationsskema',
        short_name: 'Hinke Skema',
        description:
          'Offline-first felt-app til udfyldning af varmepumpe-installationsskema.',
        lang: 'da',
        // Brand-teal udtrukket fra Hinkes logo.
        theme_color: '#0e7c73',
        background_color: '#eef2ef',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App-shell precache: alt statisk indhold caches, så app'en loader offline.
        globPatterns: ['**/*.{js,css,html,svg,png,webp,ico,webmanifest,woff,woff2}'],
        // Offline-navigation falder altid tilbage til app-shellen — men aldrig
        // for API-kald (afsendelse skal ramme netværket, ikke app-shellen).
        navigateFallback: '/',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
});
