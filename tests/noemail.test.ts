import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

// The owner's address is assembled here so this file does not contain it.
const ADDRESS = ['maxnorris01', 'gmail.com'].join('@')
const root = new URL('..', import.meta.url).pathname

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) files(path, out)
    else out.push(path)
  }
  return out
}

const hits = (paths: string[]) => paths.filter((p) => readFileSync(p, 'latin1').toLowerCase().includes(ADDRESS))

test('the owner\'s email address is not in src/, api/ or index.html', () => {
  assert.deepEqual(hits([...files(join(root, 'src')), ...files(join(root, 'api')), join(root, 'index.html')]), [])
})

test('nor in the built site (dist/, when a build is present), the PDF aside', () => {
  const dist = join(root, 'dist')
  if (!existsSync(dist)) return
  assert.deepEqual(hits(files(dist).filter((p) => !p.endsWith('.pdf'))), [])
})
