// The Updated code area has one section per file (round 5): its header says the file and how many changes it has, and its own Copy button is named so a
// reader (and the gate) can tell the files apart. Pure, so it runs under node (tests/uieditorround5.test.ts).

/** "landing.css: 1 change", "landing.html: 2 changes", and just the file's name when nothing in it changed. */
export const sectionHeader = (file: string, changes: number): string => (changes === 0 ? file : `${file}: ${changes} ${changes === 1 ? 'change' : 'changes'}`)

/** The Copy button's accessible name: `Copy code` when the document has one file, `Copy <file>` when it has more. */
export const copyName = (files: string[], file: string): string => (files.length === 1 ? 'Copy code' : `Copy ${file}`)

/** "a", "a and b", "a, b and c". */
export function nameList(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
