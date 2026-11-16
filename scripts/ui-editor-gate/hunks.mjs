// The runner's OWN line diff for the round 2 code-view specs (docs/ui-editor-gate-rules-round2.md, section 4). It never calls the page's diff.
// Longest common subsequence over lines; ties are broken by removing an original line first. A hunk is a maximal run of removed and added
// lines between two matched lines.

/** The lines of a file: split on newlines, a final newline does not make an extra empty line. */
export const linesOf = (text) => {
  const l = text.split('\n')
  if (l.length > 1 && l[l.length - 1] === '') l.pop()
  return l
}

/** [{ removed, added, after }]: `after` is the number of new lines before the hunk; the added lines are new lines after+1 .. after+added. */
export function hunksOf(original, exported) {
  const x = linesOf(original), y = linesOf(exported)
  const m = x.length, n = y.length
  const L = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  const hunks = []
  let cur = null
  let i = 0, j = 0
  const open = () => { if (!cur) { cur = { removed: 0, added: 0, after: j }; hunks.push(cur) } return cur }
  while (i < m || j < n) {
    if (i < m && j < n && x[i] === y[j]) { cur = null; i++; j++ }
    else if (j >= n || (i < m && L[i + 1][j] >= L[i][j + 1])) { open().removed++; i++ }
    else { open().added++; j++ }
  }
  return hunks
}
