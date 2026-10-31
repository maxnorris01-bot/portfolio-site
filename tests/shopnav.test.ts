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

test('the nav tabs are Home, Resume, SatPOV and ShopAI; ShopAI links to /shop and SatPOV keeps its route', async () => {
  const html = await nav('/')
  const labels = [...html.matchAll(/class="nav-link[^"]*"[^>]*>(.*?)<\/a>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''))
  assert.deepEqual(labels, ['Home', 'Resume', 'SatPOV', 'ShopAI'])
    assert.match(link(html, 'ShopAI'), /href="\/shop"/)
  assert.match(link(html, 'SatPOV'), /href="\/satellite-conjunction-screening"/)
})

test('ShopAI is the active tab on /shop (aria-current) and only there; SatPOV is active on its route', async () => {
  const onShop = await nav('/shop')
  assert.match(link(onShop, 'ShopAI'), /class="nav-link is-active"/)
  assert.match(link(onShop, 'ShopAI'), /aria-current="page"/)
  assert.doesNotMatch(link(onShop, 'Resume'), /is-active/)
  assert.doesNotMatch(link(await nav('/resume'), 'ShopAI'), /is-active/)
})

test('SatPOV is active on the satellite tool route and ShopAI is not', async () => {
  const html = await nav('/satellite-conjunction-screening')
  assert.match(link(html, 'SatPOV'), /class="nav-link is-active"/)
  assert.doesNotMatch(link(html, 'ShopAI'), /is-active/)
})
