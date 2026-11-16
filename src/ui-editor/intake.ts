// What Paste and Upload accept, and the plain warnings about what was given. Pure (tests/uieditorintake.test.ts).
import { MAX_BYTES, messages } from '../data/uiEditor.ts'

export type Kind = 'html' | 'svg'

/** One open document: the primary file and the companion stylesheets that its links name (by the href the page uses). */
export interface Doc {
  /** Shown in messages and used for the download name. */
  name: string
  kind: Kind
  /** The primary file's name and text. */
  file: string
  source: string
  /** Companion stylesheets by the href the page uses. */
  companions: Record<string, string>
}

const ext = (name: string) => /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase() ?? ''
const base = (path: string) => path.split(/[?#]/)[0].split('/').pop() ?? path

export type Incoming = { name: string; text: string; bytes: number }

export type Intake = { ok: true; doc: Doc; warnings: string[] } | { ok: false; message: string }

/** Whether pasted text is an SVG (an optional XML declaration and comments, then an <svg> root) or HTML. */
export const kindOfText = (text: string): Kind => (/^\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!doctype\s+svg[^>]*>\s*)?<svg[\s>]/i.test(text) ? 'svg' : 'html')

/** The hrefs of the stylesheets a page links to (rel contains "stylesheet"), as written. */
export function stylesheetLinks(html: string): string[] {
  const out: string[] = []
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = /\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag)
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag)
    const relText = (rel?.[1] ?? rel?.[2] ?? rel?.[3] ?? '').toLowerCase()
    const hrefText = href?.[1] ?? href?.[2] ?? href?.[3]
    if (hrefText && relText.split(/\s+/).includes('stylesheet')) out.push(hrefText)
  }
  return out
}

/** Whether the text has a script element or an inline event handler attribute. */
export const hasScript = (text: string): boolean => /<script[\s>]/i.test(text)

function warningsFor(doc: Doc, unusedCss: string[]): string[] {
  const out: string[] = []
  if (hasScript(doc.source)) out.push(messages.script)
  if (doc.kind === 'html') for (const href of stylesheetLinks(doc.source)) if (!(href in doc.companions)) out.push(messages.missingCss(href))
  for (const name of unusedCss) out.push(messages.unusedCss(name))
  return out
}

/**
 * Files chosen with Upload: one .html, .htm or .svg and at most one .css, together under the size limit. The stylesheet is matched to the
 * page's link by file name (the href may have folders in front of it).
 */
export function fromFiles(files: Incoming[]): Intake {
  if (files.reduce((n, f) => n + f.bytes, 0) > MAX_BYTES) return { ok: false, message: messages.tooBig }
  if (files.some((f) => !['html', 'htm', 'svg', 'css'].includes(ext(f.name)))) return { ok: false, message: messages.badType }
  const markup = files.filter((f) => ext(f.name) !== 'css'), css = files.filter((f) => ext(f.name) === 'css')
  if (markup.length > 1 || css.length > 1) return { ok: false, message: messages.tooMany }
  if (markup.length === 0) return { ok: false, message: css.length ? messages.needMarkup : messages.badType }
  const m = markup[0]
  const kind: Kind = ext(m.name) === 'svg' ? 'svg' : 'html'
  const companions: Record<string, string> = {}
  const unused: string[] = []
  if (css[0]) {
    const href = kind === 'html' ? stylesheetLinks(m.text).find((h) => base(h).toLowerCase() === css[0].name.toLowerCase()) : undefined
    if (href !== undefined) companions[href] = css[0].text
    else unused.push(css[0].name)
  }
  const doc: Doc = { name: m.name, kind, file: m.name, source: m.text, companions }
  return { ok: true, doc, warnings: warningsFor(doc, unused) }
}

/** Pasted code, and optionally pasted CSS (used for the page's only stylesheet link). */
export function fromPaste(markup: string, css: string): Intake {
  if (new TextEncoder().encode(markup + css).length > MAX_BYTES) return { ok: false, message: messages.tooBig }
  if (markup.trim() === '') return { ok: false, message: messages.nothingPasted }
  const kind = kindOfText(markup)
  const file = kind === 'svg' ? 'pasted.svg' : 'pasted.html'
  const companions: Record<string, string> = {}
  const unused: string[] = []
  if (css.trim() !== '') {
    const links = kind === 'html' ? stylesheetLinks(markup) : []
    if (links.length === 1) companions[links[0]] = css
    else unused.push('the pasted CSS')
  }
  const doc: Doc = { name: file, kind, file, source: markup, companions }
  return { ok: true, doc, warnings: warningsFor(doc, unused) }
}

/** The name a download gets: "-edited" before the extension for the page itself; a companion stylesheet keeps its own name so the page's link still works. */
export const downloadName = (file: string, isPrimary: boolean): string => {
  const name = base(file)
  if (!isPrimary) return name
  const i = name.lastIndexOf('.')
  return i <= 0 ? `${name}-edited` : `${name.slice(0, i)}-edited${name.slice(i)}`
}
