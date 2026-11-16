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
