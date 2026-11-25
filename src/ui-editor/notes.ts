// Notes for an AI (insert round 1, stage 2): the header the engine writes, what the Include comments switch removes, and the rows of the Notes list. Pure, so it runs under node
// (tests/uieditorinsert1.test.ts). The notes themselves are comments in the code, written and read by the engine (`note` edits, `listNotes`).
import { parse, type NoteList } from './vendor/engine.js'

/** The header comment the engine writes once, while at least one note exists (word for word; the page only recognises it). */
export const HEADER_TEXT = 'Exported from UI Editor. Comments starting "NOTE FOR AI:" are the designer\'s instructions for the element that follows. Implement them.'

/** How many notes there are, the whole-page note included. */
export const noteCount = (list: NoteList): number => list.notes.length + (list.page ? 1 : 0)

/**
 * The code without its notes and without the header: every comment whose data starts ` NOTE FOR AI` or is the header, taken out; a comment that has its line to itself goes with its
 * indent and its line break, any other only itself. This is the engine's own rule for the same list without its note edits (`docs/insert-comments-rules.md`, section 2), so Include
 * comments OFF equals the export of the edit list with the note edits left out. A stylesheet has no notes and is returned as it is.
 */
export function stripNotes(text: string, kind: 'html' | 'svg' | 'css'): string {
  if (kind === 'css') return text
  const comments = parse(text, kind, 'notes').comments.filter((c) => c.data.startsWith(' NOTE FOR AI') || c.data === ` ${HEADER_TEXT} `)
  let out = text
  for (const c of [...comments].sort((a, b) => b.start - a.start)) {
    let a = c.start
    let b = c.end
    const lineStart = out.lastIndexOf('\n', a - 1) + 1
    const nl = out.indexOf('\n', b)
    const lineEnd = nl < 0 ? out.length : nl
    if (out.slice(lineStart, a).trim() === '' && out.slice(b, lineEnd).trim() === '') {
      a = lineStart
      b = nl < 0 ? out.length : nl + 1
    }
    out = out.slice(0, a) + out.slice(b)
  }
  return out
}

/** The kind of a file by its name, for `stripNotes`. */
export const kindOfFile = (file: string): 'html' | 'svg' | 'css' => (/\.svg$/i.test(file) ? 'svg' : /\.css$/i.test(file) ? 'css' : 'html')

export interface NoteRow {
  /** The pin's number: 1, 2, ... in document order. */
  n: number
  /** The element's index in the preview. */
  index: number
  text: string
}

/** The rows of the Notes list under the page row, numbered like the pins. */
export const noteRows = (list: NoteList): NoteRow[] => list.notes.map((n, i) => ({ n: i + 1, index: n.index, text: n.text }))
