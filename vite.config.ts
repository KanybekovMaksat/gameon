import react from '@vitejs/plugin-react'
import { realpathSync } from 'node:fs'
import { defineConfig, loadEnv, searchForWorkspaceRoot } from 'vite'
import { api } from './server/api.ts'

// host: true opens the dev page to phones on the local network.
// OPENROUTER_API_KEY comes from .env.local and stays on the server side.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    // Each checkout keeps its own dependency cache: worktrees share node_modules, so a shared cache goes stale.
    cacheDir: '.vite',
    plugins: [react(), api(env.OPENROUTER_API_KEY)],
    // Worktrees link node_modules from the main checkout; Vite may serve files from its real path.
    server: { host: true, port: 5180, fs: { allow: [searchForWorkspaceRoot(process.cwd()), realpathSync('node_modules')] } },
    preview: { host: true, port: 5180 },
  }
})
