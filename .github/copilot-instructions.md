# Copilot instructions — Unified HW Solver

This repository is a single-file browser automation prototype: `solver.js`.
The file implements a modular, class-based architecture (Logger, APIClient, Scraper, UIController, Scheduler, HomeworkSolver) inside an IIFE. It is intended to be loaded/executed in a browser console or injected into a page.

Keep edits minimal, focused, and runtime-validated. Use `node --check` for syntax validation and test changes by pasting the file into a page console.

## Big picture
- Entry: Immediately-invoked function expression (IIFE) wraps everything. The script exposes a runtime API on `window.hwSolver`.
- Major components:
  - `CONFIG` — top-level configuration object. Change feature flags and timeouts here.
  - `Logger` — structured logging with levels and in-memory history (`logger.history`). Use `logger.debug/info/warn/error` in code.
  - `APIClient` — prepares requests to `CONFIG.PROXY_URL` and accepts `prompt` + `images[]`. Payload may include `seed` (clamped to 32-bit integer).
  - `Scraper` — DOM-first scraping and MathJax aria-label cleaning (`_getCleanedText`). Edit selectors here when the target site changes (e.g. `.row.text-left.options .question-option`).
  - `UIController` — simulated clicks and typing. Uses event dispatch for stability and supports `CONFIG.INSTANT_MODE`.
  - `Scheduler` — jitter + exponential backoff scheduler driving repeated runs.
  - `HomeworkSolver` — orchestrator tying scraping → prompt building → API call → parsing → UI actions.

## Runtime API (important)
- `hwSolver.start()` / `hwSolver.stop()` — start/stop scheduler.
- `hwSolver.solveOnce()` — run a single solve cycle.
- `hwSolver.config` — live reference to `CONFIG` for quick tuning (e.g., `hwSolver.config.HUMAN_DELAY_MIN = 500`).
- `hwSolver.logger` — runtime logger object; check `hwSolver.logger.history`.
- `hwSolver.toggleInstantMode()` — toggles quick typing mode.
- `hwSolver.toggleThinkBeforeAnswer()` — instructs the model to internally reason and output only a `FINAL:`-prefixed answer.
- `hwSolver.isThinkBeforeAnswerEnabled()` — check current mode.

Example quick test in browser console:
```js
// Toggle reasoning mode, then run once
hwSolver.toggleThinkBeforeAnswer();
hwSolver.solveOnce().then(ok => console.log('solveOnce ok=', ok));
```

## Prompt & parser conventions
- Prompt builders live in `HomeworkSolver` (`_buildMCQPrompt`, `_buildFillPrompt`, `_buildTrueFalsePrompt`). When `CONFIG.THINK_BEFORE_ANSWER` is true, prompts instruct the model to internally reason and to return a `FINAL:` marker with the answer.
- Parsers look for `FINAL:` explicitly and fall back to extracting text from `response?.choices?.[0]?.message?.content`, `response.answer`, or a raw string.
- When editing prompt text, preserve the `FINAL:` contract unless you also update all parsers.

## MathJax & special parsing
- `_getCleanedText` rewrites verbose MathJax aria-labels into concise math symbols (fractions, powers, Greek letters, etc.). If tests fail on math questions, adjust transformations here.

## External integration points
- `CONFIG.PROXY_URL` and `CONFIG.POLL_KEY` (API key) are the main external integration points. The `APIClient` uses `fetch()` + `AbortController` and supports image URLs passed as an `images` array.
- Avoid committing real API keys. Prefer placeholders or environment-driven injection before publishing.

## Editing & debugging workflow for agents
1. Make small, single-concern edits to `solver.js`.
2. Run `node --check solver.js` to catch syntax errors.
3. For behavior testing, paste the file into a browser console on a sample question page and use `hwSolver.solveOnce()` or `hwSolver.start()`.
4. Use `hwSolver.logger.history` to inspect runtime logs; add `logger.debug(...)` for temporary diagnostics.
5. When changing prompts, update parsers (`_parseLetter`, `_parseFill`, `_parseTrueFalse`) if you alter the `FINAL:` shape.

## Project-specific conventions & gotchas
- Single-file design: prefer minimal, localized changes rather than multi-file refactors. The IIFE structure must remain intact to keep `hwSolver` export semantics.
- Scheduler/backoff: the scheduler treats a `false` return from `solveOnce()` as a failure and increases backoff.
- Input simulation: UIController uses event dispatch rather than direct property setting when possible; preserve these patterns for compatibility with complex frontends.
- Logging: use the `Logger` class and levels, don't call console.* directly.

## Tests / CI / builds
- There are no build scripts or tests in the repo. Use `node --check` for syntax. For full behavior tests, create a small HTML fixture and run the script in a headless browser (JSDOM or Playwright).

## Files to inspect when making changes
- `solver.js` — single source of truth. Key line ranges:
  - CONFIG and flags (top of file)
  - Prompt builders / parsers (`HomeworkSolver` methods)
  - `_getCleanedText` (MathJax cleaning)
  - `APIClient.call` (payload format, headers, seed handling)

## Safety / ethics note for agents
- The project automates interactions with third-party educational platforms. Avoid producing modifications or docs that facilitate academic dishonesty. When adding examples or READMEs, prefer phrasing like "research / automation testing" and include a disclaimer.

---
If any part of this guidance is unclear or you'd like more examples (for example, a minimal Playwright test to exercise `solveOnce()`), tell me which area to expand and I will iterate.
