import { existsSync } from 'node:fs'
import { join } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Serves the Vercel functions in api/ from the Vite dev server, so `npm run dev`
// works without `vercel dev`. Only GET handlers are needed so far.
function apiRoutes(): Plugin {
  return {
    name: 'api-routes',
    configureServer(server) {
      server.middlewares.use('/api/', async (req, res, next) => {
        const url = new URL(req.originalUrl ?? req.url ?? '/', 'http://localhost')
        const file = `${url.pathname.replace(/\/$/, '')}.ts`
        if (!existsSync(join(server.config.root, file))) return next()
        try {
          const mod = await server.ssrLoadModule(file)
          if (req.method !== 'GET' || typeof mod.GET !== 'function') return next()
          const response: Response = await mod.GET(new Request(url))
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (err) {
          next(err)
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), apiRoutes()],
})
