// @ts-check
import { defineConfig } from 'astro/config';

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
});
