import { createServer } from 'vite'
import { viteConfig } from './vite.shared.mjs'

const server = await createServer({
  ...viteConfig,
  server: {
    port: 6173,
    proxy: {
      '/api': 'http://localhost:6000'
    }
  }
})

await server.listen()
server.printUrls()
