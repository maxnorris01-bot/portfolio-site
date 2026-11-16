import { createServer, type ViteDevServer } from 'vite'

// Like ssr.ts, but a server whose build-time flag VITE_SHOW_UI_EDITOR has the given value, so a test can load the same modules with the
// UI Editor's flag on and off in one process. The value is read when the server is created.
const servers = new Map<string, ViteDevServer>()

export async function loadWithFlag<T>(flag: string | undefined, path: string): Promise<T> {
  const key = String(flag)
  let server = servers.get(key)
  if (!server) {
    const before = process.env.VITE_SHOW_UI_EDITOR
    if (flag === undefined) delete process.env.VITE_SHOW_UI_EDITOR
    else process.env.VITE_SHOW_UI_EDITOR = flag
    try {
      server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent', optimizeDeps: { noDiscovery: true } })
    } finally {
      if (before === undefined) delete process.env.VITE_SHOW_UI_EDITOR
      else process.env.VITE_SHOW_UI_EDITOR = before
    }
    servers.set(key, server)
  }
  return (await server.ssrLoadModule(path)) as T
}

export async function closeFlagServers() {
  await Promise.all([...servers.values()].map((s) => s.close()))
  servers.clear()
}
