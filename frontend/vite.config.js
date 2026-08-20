import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      buffer: 'buffer/',
      string_decoder: 'string_decoder/'
    }
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'framer-motion', 'react-countup', 'buffer', 'string_decoder']
  },
  server: {
    port: 4173,
    proxy: {
      '/api': 'http://localhost:4000'
    }
  }
})
