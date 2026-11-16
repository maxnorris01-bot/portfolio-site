import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { techStack } from '../src/data/uiEditor.ts'

const root = new URL('..', import.meta.url).pathname
const read = (p: string) => readFileSync(join(root, p), 'utf8')

test('the chips under the title are TypeScript, React, parse5 and postcss, in that order, each once', () => {
  assert.deepEqual(techStack, ['TypeScript', 'React', 'parse5', 'postcss'])
  assert.equal(new Set(techStack).size, techStack.length)
})

test('each chip is true: the page is React and TypeScript, and the vendored engine bundles parse5 and postcss', () => {
  const readme = read('src/ui-editor/vendor/README.md')
  assert.match(readme, /parse5/)
  assert.match(readme, /postcss/)
  const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string>; devDependencies: Record<string, string> }
  const all = { ...pkg.dependencies, ...pkg.devDependencies }
  assert.ok('react' in all)
  assert.ok('typescript' in all)
})

test('the page draws the chips in the header like SatPOV and ShopAI (chip-list page-chips) and asks for a full-width lead that the header CSS honours', () => {
  const page = read('src/pages/UiEditor.tsx')
  assert.match(page, /className="chip-list page-chips"/)
  assert.match(page, /titleMeta=/)
  assert.match(page, /\bfullLead\b/)
  assert.match(read('src/components/PageHeader.css'), /\.page-header\.is-lead-full \.page-lede\s*\{\s*max-width:\s*none/)
})

test('no other page asks for a full-width lead, so the new rule changes only the UI Editor header', () => {
  for (const f of ['src/shop/ShopView.tsx', 'src/pages/Resume.tsx', 'src/pages/SatelliteTool.tsx', 'src/pages/NotFound.tsx', 'src/pages/Home.tsx']) {
    try {
      assert.doesNotMatch(read(f), /\bfullLead\b/, f)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw e
    }
  }
})
