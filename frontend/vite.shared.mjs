import react from '@vitejs/plugin-react'

export const viteConfig = {
  configFile: false,
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom']
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'framer-motion', 'react-countup']
  }
}
