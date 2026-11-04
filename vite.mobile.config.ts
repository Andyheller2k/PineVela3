import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

/** A separate static client build. Express, private runtime data and .env files
 * are never inputs, and the website's build configuration stays independent. */
export default defineConfig({
  base: '/',
  publicDir: false,
  envDir: false,
  envPrefix: '__PINEVELA_NO_PUBLIC_ENV__',
  define: {
    __PINEVELA_NATIVE_PREVIEW__: String(process.env.PINEVELA_NATIVE_PREVIEW === '1'),
    __PINEVELA_NATIVE_APP__: 'true',
  },
  plugins: [
    {
      name: 'native-local-fonts',
      enforce: 'pre',
      transform(source, id) {
        if (id.split('?')[0] !== path.resolve('src/index.css')) return;
        return source.replace(/^@import\s+url\(['"]https:\/\/fonts\.googleapis\.com\/[^\n]*\);\s*$/m, '');
      },
    },
    react(), tailwindcss(),
  ],
  resolve: { alias: { '@': path.resolve('.') } },
  build: {
    outDir: 'dist-mobile',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: { input: path.resolve('mobile/index.html') },
  },
});
