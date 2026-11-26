// Types for engine.js, the vendored UI Editor engine (see README.md). Written by hand from the engine's own source (ui-editor repo,
// commit 02b946673684aa26e5699fefcde49ad673a4888d: engine/src/types.ts, dom.ts, edit.ts, responsive.ts, views.ts, model.ts, patch.ts, index.ts).
// Strict: no `any`. Offsets are UTF-16 code unit indexes into the ORIGINAL source string of the file they belong to.

export type Kind = 'html' | 'svg' | 'css'

/** A text patch against the original text of one file: replace [start, end) with `text`. */
export interface Patch {
  file: string
  start: number
  end: number
  text: string
}

export interface Attr {
  /** Name exactly as written in the source (case preserved). */
  name: string
  /** Lower-case name, for lookups. */
  lname: string
  /** Whole attribute, name through end of value. */
  start: number
  end: number
  /** null when the attribute has no `=value` part. */
  value: string | null
  valueStart: number
  valueEnd: number
  quote: '"' | "'" | ''
}

export interface ElementNode {
  /** Pre-order index among all elements of the document (implied elements included for HTML). */
  index: number
  /** Tag name as written in the source; for implied elements, the parser's lower-case name. */
  tag: string
  ltag: string
  namespace: 'html' | 'svg' | 'other'
  /** True for html/head/body/tbody etc. that the parser created without source text. */
  implied: boolean
  /** Start of `<`; -1 when implied. */
  start: number
  end: number
  startTagEnd: number
  /** Start of the end tag, or -1 when there is none. */
  endTagStart: number
  selfClosing: boolean
  attrs: Attr[]
  parent: ElementNode | null
  children: ElementNode[]
}

export interface Decl {
  prop: string
  lprop: string
  value: string
  important: boolean
  start: number
  contentEnd: number
  end: number
  valueStart: number
  valueEnd: number
  hasSemicolon: boolean
  before: string
  between: string
}

export interface Container {
  decls: Decl[]
  bodyStart: number
  bodyEnd: number
}

export interface RuleNode extends Container {
  file: string
  selector: string
  selectors: string[]
  start: number
  end: number
  /** Inside a conditional at-rule (@media, @supports, @container...). */
  conditional: boolean
  /** The at-rule preludes wrapping this rule, outermost first. */
  conditions: string[]
  /** Cascade order across all stylesheets of the model. */
  order: number
}

export interface Sheet {
  file: string
  /** Element in the primary document that carries this sheet (<style> or <link>), or -1. */
  elementIndex: number
  rules: RuleNode[]
}

export interface ParsedFile {
  file: string
  kind: Kind
  source: string
  /** All elements in pre-order (HTML/SVG); empty for CSS. */
  elements: ElementNode[]
  /** Rules (CSS files only). */
  rules: RuleNode[]
  parseErrors: number
  /** Every comment node of an HTML/SVG file in source order (empty for CSS). */
  comments: CommentInfo[]
}

/** One comment node: its source range, the text between `<!--` and `-->`, and the element it directly precedes. */
export interface CommentInfo {
  start: number
  end: number
  data: string
  /** Index of the element the comment sits in, or -1 at document level. */
  parent: number
  /** Index of the element that follows with only whitespace between, or -1. */
  precedes: number
}

export interface Model {
  primary: ParsedFile
  /** Companion CSS files by the href used in the document. */
  companions: Record<string, ParsedFile>
  /** Stylesheets in cascade (document) order. */
  sheets: Sheet[]
  /** Companion hrefs that were referenced but not supplied. */
  missingStylesheets: string[]
}

/** The view an edit was made in. Desktop edits are linked (scaled across widths); Phone and Tablet edits are always custom to their own range. */
export type Environment = 'desktop' | 'tablet' | 'phone'

/** Fields every edit may carry. `environment` defaults to 'desktop', `link` to true. For 'phone' and 'tablet' `link` is ignored: the edit is custom to that view. */
export interface EditScope {
  environment?: Environment
  /** Desktop only: true (the default) scales the edit across widths; false applies it only above the phone breakpoint and pins it. */
  link?: boolean
}

/** The kinds of element `insert` can add (HTML only). */
export type InsertKind = 'text' | 'rect' | 'rounded' | 'ellipse' | 'button'

export type ElementEdit =
  | ({ op: 'set'; target: number; properties: Record<string, string> } & EditScope)
  | ({ op: 'offset'; target: number; dx: number; dy: number } & EditScope)
  | ({ op: 'reorder'; target: number; placement: 'before' | 'after'; sibling: number } & EditScope)

/** Content edits: they apply at every screen width, ignore `environment` and `link`, and make no pins. */
export type ContentEdit =
  | ({ op: 'insert'; kind: InsertKind; anchor: number; placement: 'before' | 'after' | 'first-child' | 'last-child' } & EditScope)
  | ({ op: 'text'; target: number; text: string } & EditScope)
  | ({ op: 'remove'; target: number } & EditScope)
  /** `target` is an element index, or 'page' for the whole-page note; blank text deletes the note. */
  | ({ op: 'note'; target: number | 'page'; text: string } & EditScope)

export type Edit = ElementEdit | ContentEdit

/** A custom value pinned in one environment (an edit made in Phone or Tablet, or an unlinked Desktop edit). */
export interface Pin {
  /** Stable element path (see `describe`). */
  selector: string
  property: string
  environment: Environment
  value: string
}

/** Edit-list state: replaying the same ordered list from an empty state always gives the same export. */
export interface EditState {
  pins: Pin[]
}

/** A value the engine would not scale and left as the page wrote it (never guessed). */
export interface ScaleNote {
  property: string
  /** The media condition chain the value sits in, or "(base)" / "(all widths)". */
  condition: string
  value: string
  reason: string
}

export type DomOp =
  | { type: 'style'; index: number; props: [string, string][] }
  | { type: 'attr'; index: number; name: string; value: string }
  | { type: 'html'; index: number; html: string }
  | { type: 'css'; index: number; text: string }
  | { type: 'css-remove'; index: number; text: string }
  | { type: 'insert'; index: number; position: 'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend'; html: string }
  | { type: 'remove'; index: number }

/** The refusal code of a Tablet edit on a page whose own Phone breakpoint is 768 px: the Tablet width is already a phone width, so there is no Tablet range. */
export type TabletRefusalCode = 'tablet-covered-by-phone'

export interface Refusal {
  /** A short code; `TabletRefusalCode` is the one the page reads, the rest are shown through `message`. */
  code: string
  message: string
}

export type EditResult =
  | {
      ok: true
      patches: Patch[]
      dom: DomOp[]
      warnings: string[]
      placement: string
      notes?: ScaleNote[]
      state?: EditState
      /** `insert`: index of the new element in the model of the PATCHED text, and its class name. */
      selected?: number
      className?: string
    }
  | { ok: false; refusal: Refusal; warnings: string[] }

/** What the engine needs to know from a live document. Implemented over the preview iframe. */
export interface Probe {
  matches(selector: string): number[]
  computed(index: number, prop: string, width?: number): string
  screenMatrix(index: number): [number, number, number, number, number, number] | null
  parentScreenMatrix(index: number): [number, number, number, number, number, number] | null
}

export interface Preview {
  iframe: HTMLIFrameElement
  doc: Document
  /** DOM element for each model element index (pre-order). */
  elements: Element[]
  probe: Probe
  model: Model
  /** Resize the preview viewport (the iframe) so media queries re-evaluate at that width. */
  setWidth(width: number): void
  dispose(): void
}

export interface PreviewOptions {
  width?: number
  height?: number
}

export interface UnlinkedItem {
  selector: string
  property: string
  environment: Environment
  value: string
}

export interface Scaled {
  value: string
  /** Reasons a part of the value was not scaled (calc, clamp, var, keywords). */
  reasons: string[]
}

export interface Block {
  start: number
  end: number
  line: boolean
}

export function applyEdit(model: Model, edit: Edit, probe: Probe, state?: EditState): EditResult
export function blockOf(src: string, el: ElementNode): Block

export function createPreview(model: Model, container: HTMLElement, opts?: PreviewOptions): Promise<Preview>
export function applyDomOps(preview: Preview, ops: DomOp[]): void
export function retag(preview: Preview, model: Model): void
export function tagDocument(model: Model, doc: Document): Element[]
export function domProbe(doc: Document, elements: Element[]): Probe
export function previewSource(model: Model): string
export function commit(model: Model, patches: Patch[]): { files: Record<string, string>; model: Model }
export function applyEditSteps(
  preview: Preview,
  edits: Edit[],
  state?: EditState,
): { results: EditResult[]; state: EditState; files: Record<string, string>; model: Model }

export function breakpointOf(model: Model): number
export function emptyState(): EditState
/** The media condition of a view's range: Phone `(max-width: Bpx)`, Tablet `(min-width: floor(B)+1px) and (max-width: Tpx)` (`tabletMax` defaults to 1024). */
export function envCondition(env: Environment, breakpoint: number, tabletMax?: number): string
/** Which view a media condition chain matches; with `tabletMax` a chain that matches only the tablet range is 'tablet'. */
export function chainEnv(chain: string[], breakpoint: number, tabletMax?: number): Environment | 'both' | 'none'
/** The page's largest `max-width` condition above 768 px and at most 1100 px, else 1024. The Tablet range runs from `tabletMin` to this width. */
export function tabletMax(model: Model): number
/** The first whole width above the phone breakpoint: floor(breakpoint) + 1. */
export function tabletMin(breakpoint: number): number
/** The edit list without the element edits (set, offset, reorder) made in `env` ('tablet' or 'phone'); for 'desktop' the list unchanged. Content edits are never dropped. */
export function resetView(edits: Edit[], env: Environment): Edit[]
/** The edits `resetView` would drop: the element edits made in `env` (empty for 'desktop'). */
export function customEdits(edits: Edit[], env: Environment): Edit[]
export function chainMatches(chain: string[], width: number): boolean
export function listUnlinked(state: EditState): UnlinkedItem[]
/** A note for an AI found in a file. */
export interface NoteInfo {
  index: number
  path: string
  /** The note text without the leading `NOTE FOR AI: `. */
  text: string
}
export interface NoteList {
  page: { text: string } | null
  notes: NoteInfo[]
}
export function listNotes(model: Model): NoteList
/** The text a note is written with: every run of two or more hyphens gets a space between each pair; NUL removed; CR normalised. */
export function neutralise(text: string): string
export function scaleValue(value: string, ratios: number[]): Scaled

export function createModel(source: string, kind: Exclude<Kind, 'css'>, companions?: Record<string, string>, file?: string): Model
export function describe(model: Model, index: number): string
export function select(model: Model, path: string): number
export function parse(source: string, kind: Kind, file?: string): ParsedFile
export function sources(model: Model): Record<string, string>

export function applyPatches(source: string, patches: Patch[]): string
export function exportFiles(sources: Record<string, string>, patches: Patch[]): Record<string, string>
export function specificity(selector: string): number
export function exportText(source: string, patches: Patch[], file?: string): string
