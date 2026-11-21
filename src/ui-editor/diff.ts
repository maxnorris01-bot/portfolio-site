// The code view's own line diff: which lines of the updated file are changed or added against the original, where lines were removed, and how
// Previous and Next change walk them. Pure, no dependency (tests/uieditorround2.test.ts); the gate scores it against a diff of its own (hunks.mjs).
// Longest common subsequence over lines; ties are broken by removing an original line first. A change (a hunk) is a maximal run of removed and added
// lines between two matched lines: consecutive changed or added lines are ONE change, and a removal on its own counts too, so it can be reached.

export interface Hunk {
  /** Lines of the original that are gone. */
  removed: number
  /** Lines of the updated file that are new or changed (consecutive). */
  added: number
  /** How many updated lines come before the hunk: its added lines are lines after + 1 to after + added. */
  after: number
}

/** The lines of a file: split on newlines; a final newline does not make an extra empty line. */
export function linesOf(text: string): string[] {
  const l = text.split('\n')
  if (l.length > 1 && l[l.length - 1] === '') l.pop()
  return l
}

export function diffHunks(original: string, updated: string): Hunk[] {
  const x = linesOf(original)
  const y = linesOf(updated)
  const m = x.length
  const n = y.length
  const keep: Uint32Array[] = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1))
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) keep[i][j] = x[i] === y[j] ? keep[i + 1][j + 1] + 1 : Math.max(keep[i + 1][j], keep[i][j + 1])
  const out: Hunk[] = []
  let cur: Hunk | null = null
  let i = 0
  let j = 0
  while (i < m || j < n) {
    if (i < m && j < n && x[i] === y[j]) {
      cur = null
      i++
      j++
      continue
    }
    if (!cur) {
      cur = { removed: 0, added: 0, after: j }
      out.push(cur)
    }
    if (j >= n || (i < m && keep[i + 1][j] >= keep[i][j + 1])) {
      cur.removed++
      i++
    } else {
      cur.added++
      j++
    }
  }
  return out
}

/** The line a change is at: its first added line, or (for a removal on its own) the line after the gap. */
export const firstLine = (h: Hunk): number => h.after + 1

/** The change (1-based) an updated line belongs to, or null for an unchanged line. */
export function changeOfLine(hunks: Hunk[], line: number): number | null {
  const k = hunks.findIndex((h) => h.added > 0 && line >= h.after + 1 && line <= h.after + h.added)
  return k < 0 ? null : k + 1
}

/** Previous (dir -1) or next (dir 1) change from the current one (0: none visited yet), wrapping round. 0 when there are no changes. */
export function stepChange(current: number, count: number, dir: 1 | -1): number {
  if (count <= 0) return 0
  if (dir === 1) return current >= count ? 1 : current + 1
  return current <= 1 ? count : current - 1
}

/** The counter: "No changes yet", or "k of n" (k is 0 before the first jump). */
export const counterText = (current: number, count: number): string => (count === 0 ? 'No changes yet' : `${Math.min(current, count)} of ${count}`)

/** Where change k's tick sits on the change map, as a share (0 to 1) of the strip's height: in proportion to its line number. */
export const tickShare = (h: Hunk, lineCount: number): number => (lineCount > 0 ? h.after / lineCount : 0)

// ---- over several files (round 3): which files changed, the changes in one order across all of them, and which file to show ----

/** One change in the whole export: the file it is in and its number in that file (1-based). */
export interface FileChange {
  file: string
  index: number
}

/** The File selector's text for a file: its name, with the number of changes in it when there are any ("landing.css (2)"). */
export const fileMark = (file: string, count: number): string => (count > 0 ? `${file} (${count})` : file)

/** Every change of every file in one order: files in selector order, changes in line order. */
export const changeOrder = (order: string[], counts: Record<string, number>): FileChange[] =>
  order.flatMap((file) => Array.from({ length: counts[file] ?? 0 }, (_, i) => ({ file, index: i + 1 })))

/** How many changes come before the first change of this file (its changes are numbered offset + 1 and up in the whole walk). */
export function offsetOfFile(order: string[], counts: Record<string, number>, file: string): number {
  let n = 0
  for (const f of order) {
    if (f === file) return n
    n += counts[f] ?? 0
  }
  return n
}

/**
 * The file the code view shows after an edit. A file the visitor chose by hand stays, and so does a file that has changes of its own; a shown file with
 * none gives way to the first file (in selector order) that has some.
 */
export function fileToShow(shown: string, order: string[], counts: Record<string, number>, handPicked: boolean): string {
  if (handPicked || (counts[shown] ?? 0) > 0) return shown
  return order.find((f) => (counts[f] ?? 0) > 0) ?? shown
}
