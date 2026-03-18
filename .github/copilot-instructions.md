# Copilot / LLM Instructions — ONLUYEN AI Homework Solver

This document serves as the primary system architectural reference for AI assistants, Copilot, and LLMs interacting with this repository.

## 1. Project Overview & Rules
This project is an advanced, automated browser script designed to solve homework assignments on educational platforms.
- **Environment:** The final output is bundled as a userscript via Vite (`vite-plugin-monkey`).
- **Code Style:** ES modules, heavily utilizing classes for decoupling.
- **Rule of Thumb:** Keep edits modular. **Do not** introduce global variables. State should remain within object instances (`Scraper`, `APIClient`, etc.).
- **Validation:** Always ensure syntax is valid if suggesting raw `.js` modifications. The script relies heavily on complex DOM interactions.

## 2. Core Architecture & Modules
The application has transitioned away from a single-file script into a decoupled, modular architecture.

- **`src/main.js`**:
  - The entry point. Initializes global `CONFIG` from `constants.js` and the `HomeworkSolver`.
  - Exposes `window.hwSolver` for manual console control and debugging.
  - Implements a **Guardian Loop** (MutationObserver) to persistently enforce the UI overlay against aggressive SPA DOM re-renders.

- **`src/constants.js`**:
  - Holds the mutable `CONFIG` object, which syncs with `localStorage` (e.g., `PROXY_URL`, `POLL_KEY`, timeouts, AI parameters).

- **`src/core/homework-solver.js` (`HomeworkSolver`)**:
  - The main orchestrator. Glues together Scraping, API calling, parsing, and UI interaction within the `solveOnce()` loop.
  - Contains strictly defined, tightly-coupled Prompt Generators (e.g., `_buildMCQPrompt`) and Parsers (e.g., `_parseLetter`).
  - *Crucial restriction: If you alter the prompt output constraints, you MUST update the corresponding parser simultaneously.*

- **`src/api/api-client.js` (`APIClient`)**:
  - Handles communication with the LLM (OpenAI compatible via Pollinations proxy).
  - Implements multi-turn tool-calling loops (e.g., allowing the LLM to call `calculate()` before finalizing).
  - Handles HTTP retries and automatic fallbacks between `max_completion_tokens` and `max_tokens`.

- **`src/scraper/scraper.js` (`Scraper`)**:
  - The DOM-reading engine using heuristic selectors to classify question types (MCQ, Short, Fillable, T/F).
  - Responsible for extracting Text, Images, and Table data.
  - Implements a critical `_getCleanedText` method that intercepts `<mjx-container>` MathJax nodes, suppressing their complex SVG/AssistiveMML structures and replacing them with standardized `[MATHJAX]...[/MATHJAX]` string notation.

- **`src/ui/ui-controller.js` (`UIController`)**:
  - The deeply complex DOM-writing engine simulating human behavior.
  - *WARNING*: Avoid using direct value assignment `el.value = "x"` or `el.click()`. Modern target frameworks (Angular/React) ignore direct DOM mutations.
  - Interactions are carried out via synthesized overlapping `MouseEvent`s and simulated character-by-character `KeyboardEvent`s (`keydown`, `keypress`, `input`, `keyup`) coupled with `CONFIG.HUMAN_DELAY_MIN / MAX` random jitters.

- **`src/core/scheduler.js` (`Scheduler`)**:
  - The interval polling engine operating the automation loop. Implements basic threshold counters and exponential backoff retry states on failures.

- **`src/ui/dashboard.js` (`BasicUI`)**:
  - The injected floating DOM Dashboard (`#hw-solver-overlay`). Handles user state manipulation, API Key configurations, and displays solver progress updates. Re-injected by `main.js`'s guardian if destroyed.

## 3. The `THINK_BEFORE_ANSWER` Paradigm
The `HomeworkSolver` heavily relies on reasoning chains while standardizing output.
- When enabled, `CONFIG.THINK_BEFORE_ANSWER` commands the LLM prompt to heavily output "Chain of Thought" reasoning text first.
- However, the LLM is strictly commanded to finalize its response on a specific delimiter (`FINAL: A`, `FINAL: 42`).
- The parser strictly searches via Regex for the `FINAL: ` substring. Ensure this logic is preserved if tweaking prompts.

## 4. Execution & Testing Workflow
Because this project is no longer a single file `solver.js` but a bundled Vite project, you cannot simply instruct the user to "paste the file into the console."
- **Build Command:** To compile the userscript, run `npm run build`. The output will be located in `dist/solver.user.js` or similar, as defined by `vite-plugin-monkey`.
- **Dev Mode:** Run `npm run dev` to start the Vite dev server for `vite-plugin-monkey`.
- **Testing Changes:** When suggesting changes that the user needs to test, instruct them to either use the Dev server with Tampermonkey, or to build the project and manually copy the output of the bundled file into their Tampermonkey extension or the console. 

## 5. Safety / Ethics Note for Agents
The project automates interactions with third-party educational platforms. Avoid producing modifications or docs that facilitate malicious behavior. When adding examples or READMEs, prefix intent with terminology like "research", "automation testing", or "DOM resilience architecture proof-of-concept".
