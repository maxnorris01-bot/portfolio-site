import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, test } from 'node:test'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { closeServer, loadModule } from './helpers/ssr.ts'

after(closeServer)

const page = async () => {
  const { default: Resume } = await loadModule<{ default: ComponentType }>('/src/pages/Resume.tsx')
  return renderToStaticMarkup(createElement(StaticRouter, { location: '/resume' }, createElement(Resume)))
}
const css = readFileSync(new URL('../src/pages/Resume.css', import.meta.url), 'utf8')

test('the rail: Santa Cruz only, the GitHub link, no email link, no project meta tags', async () => {
  const html = await page()
  assert.match(html, /<dd>Santa Cruz, CA<\/dd>/)
  assert.ok(!html.includes('Oregon'))
  assert.ok(html.includes('href="https://github.com/maxnorris01-bot"'))
  assert.ok(!html.includes('mailto:'))
  assert.ok(!html.includes('>Live<') && !html.includes('Agentic pipeline'))
})

test('the sections run Profile, Applied AI Projects, Experience, with a rule between them and no line-length cap', async () => {
  const html = await page()
  const order = ['>Profile<', '>Applied AI Projects<', '>Experience<'].map((h) => html.indexOf(h))
  assert.ok(order[0] > 0 && order[0] < order[1] && order[1] < order[2], order.join(','))
  assert.match(css, /\.resume-main > section \+ section \{[^}]*border-top: 1px solid var\(--color-border\)/)
  assert.ok(!css.includes('measure-text'))
})

test('Experience is the owner\'s wording as two-level lists', async () => {
  const html = await page()
  const top = (t: string) => assert.ok(html.includes(`<li>${t}<ul class="resume-job-sub">`), t)
  top('Responsible for Weight and CG management for S4 Program')
  top('Mass Properties process development and execution')
  top('Flight Test and Operations support')
  top('One of main focal points for Conceptual Design Mass Properties within Advanced Flight Sciences Division')
  top('Extensive Detailed Design Experience')
  top('Production Vehicle Mass Properties Experience')
  for (const sub of ['IPT mass target development', 'Program mass tracking, reporting, forecasting', 'Mass reduction effort coordination', 'Database development, ANSI-S120A implementation', 'Mass Properties Reporting per SAWE-PR7/8', 'Produced aircraft weighing procedures, introduced the use of Form B / F, Chart A / C / E', 'MDO Mass Properties Lead', 'Contributed to multiple contract captures', 'Weight &amp; CG Management, Reporting, Forecasting', 'Database Development &amp; Management', 'F/A-18, F-35A/B/C, Other']) {
    assert.ok(html.includes(`<li>${sub}</li>`), sub)
  }
  assert.equal(html.match(/<ul class="resume-job-sub">/g)?.length, 6)
})
