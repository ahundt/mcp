import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/extension/manifest.json';

export default defineConfig({
  plugins: [crx({ manifest })],
  root: 'src/extension',
  build: {
    outDir: '../dist-crx',
    emptyOutDir: true,
  },
});
