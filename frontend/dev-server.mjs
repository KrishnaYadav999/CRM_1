import { createServer } from 'vite'
import { viteConfig } from './vite.shared.mjs'

const server = await createServer({
  ...viteConfig,
  server: {
    port: 4173,
    proxy: {
      '/api': 'http://localhost:4000'
    }
  }
})

await server.listen()
server.printUrls()
