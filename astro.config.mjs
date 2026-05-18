// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import AstroPWA from '@vite-pwa/astro';

export default defineConfig({
  site: 'https://respawn.kz',
  output: 'static',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  devToolbar: {
    enabled: false,
  },
  integrations: [
    sitemap({
      changefreq: 'weekly',
      priority: 0.7,
      filter: (page) => !page.includes('/auth/') && !page.includes('/me/'),
    }),
    AstroPWA({
      registerType: 'autoUpdate',
      injectRegister: null, // we register manually via virtual:pwa-register in BaseLayout
      manifest: false, // already have public/manifest.webmanifest — don't regenerate
      includeManifestIcons: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,webp,woff2,ico}'],
        // Skip pre-caching auth/admin/dashboard/me HTML pages
        globIgnores: ['**/me/**', '**/admin/**', '**/dashboard/**', '**/auth/**'],
        runtimeCaching: [
          {
            // HTML pages: try network, fall back to cache
            urlPattern: ({ request, url }) => {
              if (request.destination !== 'document') return false;
              const path = url.pathname;
              if (
                path.startsWith('/me/') ||
                path.startsWith('/admin/') ||
                path.startsWith('/dashboard/') ||
                path.startsWith('/auth/')
              ) return false;
              return true;
            },
            handler: 'NetworkFirst',
            options: {
              cacheName: 'respawn-html',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            // Supabase API calls: NEVER cache (auth, bookings must be fresh)
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'),
            handler: 'NetworkOnly',
          },
          {
            // Supabase Storage (club photos): stale-while-revalidate
            urlPattern: ({ url }) =>
              url.hostname.endsWith('.supabase.co') &&
              url.pathname.includes('/storage/v1/object/public/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'supabase-storage',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Google Fonts stylesheets
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            // Google Fonts files (long-lived)
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false, // no SW in dev to avoid HMR conflicts
      },
    }),
  ],
});
