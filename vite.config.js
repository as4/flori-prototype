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
  },
});
