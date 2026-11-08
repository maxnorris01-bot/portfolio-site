import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Serves the Vercel functions in api/ from the Vite dev server, so `npm run dev`
// works without `vercel dev`. GET handlers, and POST ones (the body is passed on).
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
          const method = req.method ?? 'GET'
          const handler = mod[method]
          if ((method !== 'GET' && method !== 'POST') || typeof handler !== 'function') return next()
          let body: Buffer | undefined
          if (method === 'POST') {
            const chunks: Buffer[] = []
            for await (const chunk of req) chunks.push(chunk as Buffer)
            body = Buffer.concat(chunks)
          }
          const headers = new Headers()
          for (const [key, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(key, value)
          const response: Response = await handler(new Request(url, { method, headers, body: body ? new Uint8Array(body) : undefined }))
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

// Which commit a build is: Vercel's system variable on Vercel, else the local
// git HEAD. Shown in the site footer, so a page shows which build is live.
function buildCommit(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA
  if (sha) return sha.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'unknown'
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), apiRoutes()],
  define: {
    __BUILD_COMMIT__: JSON.stringify(buildCommit()),
    __BUILD_ENV__: JSON.stringify(process.env.VERCEL_ENV ?? 'local'),
  },
  // satellite.js's entry also re-exports its WASM build, whose worker uses
  // top-level await; only ES-module workers can bundle that. The globe uses
  // the plain-JS API, so the worker is emitted but never loaded.
  worker: { format: 'es' },
})
