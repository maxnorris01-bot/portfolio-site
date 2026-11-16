// The glue between the editor and the vendored engine. One Session is one open document with its live preview: the preview is built from the
// ORIGINAL source and the ordered edit list is replayed on it, so the preview, the panel values and the export all come from the engine's own
// result. A new edit is applied to the live preview (the engine's DOM operations); anything that is not "one more edit" (Undo, Redo, Reset,
// a merged move) replays the list on a fresh preview.
import * as engine from './vendor/engine.js'
import type { Edit, EditResult, EditState, ElementNode, Model, Preview, ScaleNote } from './vendor/engine.js'
import type { Doc } from './intake.ts'
import type { Viewport } from './devices.ts'

export interface Session {
  doc: Doc
  preview: Preview
  state: EditState
  /** Every file's text as it would be exported now. */
  files: Record<string, string>
  /** The page's phone breakpoint B: Phone is up to B, Desktop from B + 1. */
  breakpoint: number
  /** Stylesheets the page links to that were not supplied. */
  missing: string[]
  /** The screen's height when it has one (Tablet, Phone); null on Desktop, where the frame grows to the page's height. */
  fixedHeight: number | null
}

/** The preview is at least this tall (CSS px); it grows to the page's height so the host, not the frame, scrolls. */
export const PREVIEW_MIN_HEIGHT = 800

export type Opened = { ok: true; session: Session; results: EditResult[] } | { ok: false; message: string }

/** Build a preview of the original document and replay `edits` on it. Never throws: a failure is a message. */
export async function openSession(doc: Doc, edits: Edit[], host: HTMLElement, vp: Viewport): Promise<Opened> {
  let preview: Preview | null = null
  try {
    const model = engine.createModel(doc.source, doc.kind, doc.companions, doc.file)
    preview = await engine.createPreview(model, host, { width: vp.width, height: vp.height ?? PREVIEW_MIN_HEIGHT })
    preview.iframe.title = 'Preview'
    const run = engine.applyEditSteps(preview, edits, engine.emptyState())
    const bad = run.results.find((r) => !r.ok)
    if (bad && !bad.ok) {
      preview.dispose()
      return { ok: false, message: bad.refusal.message }
    }
    const session: Session = { doc, preview, state: run.state, files: run.files, breakpoint: engine.breakpointOf(model), missing: model.missingStylesheets, fixedHeight: vp.height }
    fitHeight(session)
    return { ok: true, session, results: run.results }
  } catch (e) {
    preview?.dispose()
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

/** On Desktop the preview's height follows the page's: the frame never scrolls (the pointer layer covers it), the host does. A device keeps its screen height. */
export function fitHeight(s: Session): void {
  if (s.fixedHeight !== null) {
    s.preview.iframe.style.height = `${s.fixedHeight}px`
    return
  }
  const root = s.preview.doc.documentElement
  const h = Math.max(PREVIEW_MIN_HEIGHT, Math.ceil(root.getBoundingClientRect().height), s.doc.kind === 'svg' ? 0 : root.scrollHeight)
  s.preview.iframe.style.height = `${h}px`
}

export type Applied = { ok: true; notes: ScaleNote[]; placement: string } | { ok: false; message: string }

/** One more edit on the live preview. A refusal changes nothing (the engine decides before it touches anything). */
export function applyOne(s: Session, edit: Edit): Applied {
  try {
    const run = engine.applyEditSteps(s.preview, [edit], s.state)
    const r = run.results[0]
    if (!r || !r.ok) return { ok: false, message: r && !r.ok ? r.refusal.message : 'the engine gave no answer' }
    s.state = run.state
    s.files = run.files
    fitHeight(s)
    return { ok: true, notes: r.notes ?? [], placement: r.placement }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

/** Another size for the same preview: Desktop grows to the page, a device keeps its own screen height. */
export const setViewport = (s: Session, vp: Viewport): void => {
  s.fixedHeight = vp.height
  s.preview.setWidth(vp.width)
  fitHeight(s)
}

export const closeSession = (s: Session | null): void => s?.preview.dispose()

// ---- elements ----

export const elementAt = (s: Session, index: number): ElementNode | undefined => s.preview.model.primary.elements[index]
export const pathOf = (model: Model, index: number): string => engine.describe(model, index)
export const indexOfPath = (model: Model, path: string): number => engine.select(model, path)

/** "h1 #headline", "div .card", "rect #bar-tue": the tag, then the id, else the first class. */
export function labelOf(s: Session, index: number): string {
  const el = s.preview.elements[index]
  if (!el) return ''
  const id = el.getAttribute('id')
  const cls = el.getAttribute('class')?.trim().split(/\s+/)[0]
  return `${el.localName}${id ? ` #${id}` : cls ? ` .${cls}` : ''}`
}

/** Where a Move up or Move down goes: the sibling to place the element before or after, and the element's path once it has moved. Null when there is no such sibling. */
export function moveTarget(model: Model, index: number, dir: 'up' | 'down'): { sibling: number; placement: 'before' | 'after'; pathAfter: string } | null {
  const el = model.primary.elements[index]
  const parent = el?.parent
  if (!el || !parent) return null
  const kids = parent.children
  const i = kids.indexOf(el)
  const j = dir === 'up' ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= kids.length) return null
  const order = kids.map((k) => k.ltag)
  ;[order[i], order[j]] = [order[j], order[i]]
  const n = order.slice(0, j + 1).filter((t) => t === el.ltag).length
  return { sibling: kids[j].index, placement: dir === 'up' ? 'before' : 'after', pathAfter: `${engine.describe(model, parent.index)}/${el.ltag}[${n}]` }
}

const SVG_NS = 'http://www.w3.org/2000/svg'
export const isSvgElement = (el: Element): boolean => el.namespaceURI === SVG_NS

/** Whether the element has the handles that change width and height: any HTML element, and the SVG elements that have a width and a height of their own. */
export const canResize = (el: Element): boolean => !isSvgElement(el) || ['rect', 'image', 'svg', 'foreignobject'].includes(el.localName.toLowerCase())
