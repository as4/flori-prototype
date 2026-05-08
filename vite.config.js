import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {defineConfig} from 'vite';
import svgr from 'vite-plugin-svgr';

////////////////////////////////////////////////////////////////////////////////

export default defineConfig({
  plugins: [
    svgr({
      svgrOptions: {
        titleProp: true,
        svgProps: {role: 'img'},
      },
    }),
    react(),
    tailwindcss(),
    basicSsl(),
  ],
  server: {
    host: true,
    proxy: {
      // Forward /api/* to wrangler pages dev (run via `npm run dev:functions`)
      // so the password unlock endpoint works under the vite dev server.
      // Production: Cloudflare Pages routes /api/* to the Function natively.
      '/api': 'http://localhost:8788',
    },
  },
});
