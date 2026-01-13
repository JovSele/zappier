import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    fs: {
      // Allow serving files from WASM pkg directory
      allow: ['..']
    }
  },
  optimizeDeps: {
    exclude: ['zapier-lighthouse-wasm']
  }
})
