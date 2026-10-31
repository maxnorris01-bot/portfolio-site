import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { closeServer, loadModule } from './helpers/ssr.ts'

after(closeServer)

const nav = async (location: string) => {
  const { default: NavBar } = await loadModule<{ default: ComponentType }>('/src/components/NavBar.tsx')
  return renderToStaticMarkup(createElement(StaticRouter, { location }, createElement(NavBar)))
}
const link = (html: string, label: string) => html.match(new RegExp(`<a [^>]*>(?:(?!</a>).)*${label}(?:(?!</a>).)*</a>`))?.[0] ?? ''

test('the nav lists Shop after the other tabs and links to /shop', async () => {
  const html = await nav('/')
  const labels = [...html.matchAll(/class="nav-link[^"]*"[^>]*>(.*?)<\/a>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''))
  assert.equal(labels.at(-1), 'Shop')
  assert.deepEqual(labels.slice(0, 2), ['Home', 'Resume'])
  assert.match(link(html, 'Shop'), /href="\/shop"/)
})

test('Shop is the active tab on /shop (aria-current) and only there', async () => {
  const onShop = await nav('/shop')
  assert.match(link(onShop, 'Shop'), /class="nav-link is-active"/)
  assert.match(link(onShop, 'Shop'), /aria-current="page"/)
  assert.doesNotMatch(link(onShop, 'Resume'), /is-active/)
  assert.doesNotMatch(link(await nav('/resume'), 'Shop'), /is-active/)
})
