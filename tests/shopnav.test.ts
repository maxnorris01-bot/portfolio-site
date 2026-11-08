import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

test('the nav tabs are Home, Résumé, Contact (a button), SatPOV and ShopAI; ShopAI links to /shop and SatPOV keeps its route', async () => {
  const html = await nav('/')
  const labels = [...html.matchAll(/class="nav-(?:link|tool)[^"]*"[^>]*>(.*?)<\/(?:a|button)>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''))
  assert.deepEqual(labels, ['Home', 'Résumé', 'Contact', 'SatPOV', 'ShopAI'])
  // Home and Résumé are links next to the name; the two tools are the buttons at the right.
  assert.match(html, /<ul class="nav-links">.*Home.*Résumé.*<\/ul><ul class="nav-tools">.*SatPOV.*ShopAI.*<\/ul>/)
    assert.match(link(html, 'ShopAI'), /href="\/shop"/)
  assert.match(link(html, 'SatPOV'), /href="\/satellite-conjunction-screening"/)
})

test('ShopAI is the active tab on /shop (aria-current) and only there; SatPOV is active on its route', async () => {
  const onShop = await nav('/shop')
  assert.match(link(onShop, 'ShopAI'), /class="nav-tool is-active"/)
  assert.match(link(onShop, 'ShopAI'), /aria-current="page"/)
  assert.doesNotMatch(link(onShop, 'Résumé'), /is-active/)
  assert.doesNotMatch(link(await nav('/resume'), 'ShopAI'), /is-active/)
})

test('SatPOV is active on the satellite tool route and ShopAI is not', async () => {
  const html = await nav('/satellite-conjunction-screening')
  assert.match(link(html, 'SatPOV'), /class="nav-tool is-active"/)
  assert.doesNotMatch(link(html, 'ShopAI'), /is-active/)
})

test('Résumé is the active link on /resume, with the accent underline class, and the tools are not', async () => {
  const html = await nav('/resume')
  assert.match(link(html, 'Résumé'), /class="nav-link is-active"/)
  assert.match(link(html, 'Résumé'), /href="\/resume"/)
  assert.doesNotMatch(link(html, 'SatPOV'), /is-active/)
})

test('the site header is frozen at the top on every page: sticky, above page content and below the modals; its height is shared for scroll-to', async () => {
  const css = readFileSync(new URL('../src/components/NavBar.css', import.meta.url), 'utf8')
  const rule = css.match(/(?:^|\n)\.nav \{([^}]*)\}/)?.[1] ?? ''
  assert.match(rule, /position: sticky;/)
  assert.match(rule, /top: 0;/)
  const z = Number(rule.match(/z-index: (\d+);/)?.[1])
  assert.ok(z > 30 && z < 100, `z-index ${z} is above the conjunctions menu (30) and below the modals (100)`)
  assert.match(rule, /background: var\(--color-bg\)/)
  assert.match(rule, /border-bottom: 1px solid var\(--color-border\)/)
  const tsx = readFileSync(new URL('../src/components/NavBar.tsx', import.meta.url), 'utf8')
  assert.match(tsx, /--site-header-height/)
  assert.match(tsx, /<header ref=\{headerRef\} className="nav">/)
  for (const f of ['pages/Shop.css', 'pages/SatelliteTool.css']) assert.match(readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8'), /scroll-margin-top: calc\(var\(--site-header-height, 0px\) \+ 8px\)/, f)
})
