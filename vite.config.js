import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  base: './',
  // lore.json is emitted as JSON.parse("…"), which browsers parse much faster than an object literal
  json: { stringify: true },
  build: {
    rollupOptions: {
      // libraries in their own chunk, so a data update doesn't make visitors re-download them
      output: { manualChunks: (id) => (id.includes('node_modules') ? 'vendor' : undefined) },
    },
  },
})
