import { createServer, type ViteDevServer } from 'vite'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Loads a .tsx module through Vite (the repo's own transform, no extra tooling) and renders it to HTML.
let server: ViteDevServer | null = null

export async function loadModule<T>(path: string): Promise<T> {
  server ??= await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent', optimizeDeps: { noDiscovery: true } })
  return (await server.ssrLoadModule(path)) as T
}

export async function closeServer() {
  await server?.close()
  server = null
}

export const render = <P extends object>(component: ComponentType<P>, props: P) => renderToStaticMarkup(createElement(component, props))
