import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom']
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'framer-motion', 'react-countup']
  },
  server: {
    port: 6173,
    proxy: {
      '/api': 'http://localhost:6000'
    }
  }
})
