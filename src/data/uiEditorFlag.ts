// The UI Editor is hidden until release: the build-time Vite variable VITE_SHOW_UI_EDITOR turns it on, and exactly 'true' does.
// Unset, empty or anything else is OFF. Kept as a function of the value so tests can exercise both states. The flag hides the
// page, not the code: merged code is visible in this public repository (see README.md).

export const isUiEditorOn = (value: string | undefined): boolean => value === 'true'

// Typed here (not through vite/client) because the node tests import this module too, where import.meta.env does not exist.
const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env

/** The flag for this build. With it OFF there is no route, nav link or Home planet, and the page's chunk is never requested. */
export const UI_EDITOR_ON = isUiEditorOn(env?.VITE_SHOW_UI_EDITOR)
