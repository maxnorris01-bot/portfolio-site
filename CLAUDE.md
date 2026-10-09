# CLAUDE.md

## Browser checks

- Run browser checks and screenshots headless: no visible window, and never use Max's Chrome
  profile. Use headless Chromium in a fresh context (e.g. Playwright with `headless: true`, plus
  `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist` so WebGL renders),
  and save screenshots to disk.
- Open a visible browser only when Max explicitly asks for one.
- Headless WebGL is software-rendered: report frame rates from it as relative, not as real-device
  performance.
