// The option icons: one SVG per key in this folder (the drawings arrive in a separate branch). The panel loads them through <img>, never inline.
// `_placeholder.svg` exists only for tests: it can be rendered but is not in the set of keys the service may use.
const files = import.meta.glob('./*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

const urls = new Map<string, string>()
for (const [path, url] of Object.entries(files)) urls.set(path.replace(/^\.\//, '').replace(/\.svg$/, ''), url)

/** The icon keys available to the service (every drawing here except the test placeholder). */
export const iconKeys: ReadonlySet<string> = new Set([...urls.keys()].filter((k) => !k.startsWith('_')))

/** Whether a drawing exists for this key. */
export const hasIcon = (key: string): boolean => urls.has(key === 'placeholder' ? '_placeholder' : key)

/** The file URL of a key's drawing, or null when there is none. */
export const iconUrl = (key: string): string | null => urls.get(key === 'placeholder' ? '_placeholder' : key) ?? null
