import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          onlyExplicitManualChunks: true,
          manualChunks(id) {
            if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react-core';
            if (/\/node_modules\/(recharts|victory-vendor|d3-[^/]+|internmap)\//.test(id)) return 'charts';
          },
        },
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        ignored: ['**/data/**', '**/*.json', '**/*.log', '**/*.tmp*', '**/scratch/**'],
      },
    },
  };
});
