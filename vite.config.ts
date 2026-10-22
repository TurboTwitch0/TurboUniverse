import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { releasePlugin } from './build/release-plugin';

export default defineConfig({
  plugins: [react(), releasePlugin()],
  server: {
    host: '127.0.0.1',
    proxy: { '/api': 'http://127.0.0.1:3001', '/uploads': 'http://127.0.0.1:3001' },
  },
});
