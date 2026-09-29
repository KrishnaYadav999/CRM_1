import { build } from 'vite'
import { viteConfig } from './vite.shared.mjs'

const outDir = String(process.env.CRM_FRONTEND_OUT_DIR || '').trim()

await build({
  ...viteConfig,
  build: {
    ...(viteConfig.build || {}),
    ...(outDir ? { outDir } : {})
  }
})
