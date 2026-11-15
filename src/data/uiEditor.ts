// Every name and string of the UI Editor page, in one place, so a rename is one line (like satelliteTool.ts for the satellite tool).
// The page is behind a flag (uiEditorFlag.ts) until Max releases it.

export interface UiEditorInfo {
  /** The tool's name: the nav button, the Home planet, the page title and the tab title. */
  name: string
  /** The page's address. */
  route: string
  /** Two sentences, in the style of the other Home cards (Max approves the wording before release). */
  planet: { text: string; compact: string }[]
  /** Where the "View on GitHub" button goes; null (no button) while the engine repository is private. */
  repoUrl: string | null
  /** The browser tab title and meta description while the page is open. */
  pageTitle: string
  pageDescription: string
}

export const uiEditor: UiEditorInfo = {
  name: 'UI Editor',
  route: '/ui-editor',
  planet: [
    {
      text: 'UI Editor lets you paste or upload your own HTML or SVG, click an element and change its text, size, colours or position from a side panel or by dragging.',
      compact: 'UI Editor lets you paste your own HTML or SVG, click an element and change it from a side panel or by dragging.',
    },
    {
      text: 'It writes each change back into your own code and leaves every other line as you wrote it, then you copy or download the updated code. Everything runs in your browser.',
      compact: 'It writes each change back into your code and leaves every other line alone. Everything runs in your browser.',
    },
  ],
  repoUrl: null,
  pageTitle: 'UI Editor — Max Norris',
  pageDescription: 'Paste or upload your own HTML or SVG, click an element and change it from a side panel or by dragging, then copy the updated code. Runs entirely in your browser.',
}
