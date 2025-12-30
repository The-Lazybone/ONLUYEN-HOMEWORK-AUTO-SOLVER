# 🚀 Intelligent AI Homework Solver (v2.0)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Dynamic DOM](https://img.shields.io/badge/DOM-Adaptive-blueviolet)](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model)
[![AI Powered](https://img.shields.io/badge/AI-Reasoning--Driven-orange)](https://pollinations.ai)

An advanced, agentic browser automation tool engineered to solve complex academic problems on interactive platforms like `onluyen.vn`. Built with a focus on **DOM resilience**, **mathematical precision**, and **multimodal AI integration**.

## ✨ Key Features

*   **🧠 Logic-First Reasoning**: Uses specialized reasoning models (DeepSeek, OpenAI) to solve problems step-by-step before delivering concise answers.
*   **🔢 Multi-Question Sequential Solving**: Automatically detects and solves high-density pages with dozens of questions one-by-one, ensuring no context overflow.
*   **📐 MathJax & LaTeX Support**: High-fidelity extraction of mathematical expressions, converting complex formulas into readable text for the LLM.
*   **🖼️ Multimodal Vision**: Automatically scrapes and analyzes problem-related images (diagrams, graphs, equations) to provide context-aware solutions.
*   **🖥️ Floating UI Dashboard**: A non-intrusive overlay with real-time status updates (`Thinking...`, `Typing...`, `Waiting...`) and dedicated control buttons.
*   **💾 Persistent Configuration**: Integrated API key input field with `localStorage` persistence—no more manual console setup on every reload.
*   **🧹 Smart Reset Loop**: "Clear All" feature that resets all page inputs and specialized status classes (like `done`), allowing for instant re-solving.
*   **️ Resilient Interaction Engine**: 
    *   **Interaction-First Solving**: Proceeds to the next question even on pages without individual "Submit" buttons.
    *   **Adaptive True/False Test Support**: Handles both classic input-based and modern div-based interactive components.
    *   **Fault-Tolerant Scraping**: Built-in validation to skip broken blobs and inaccessible image sources.
*   **✍️ Flexible Answer Formatting**:
    *   Dedicated **Short Answer** logic for Vietnamese math context (decimal commas, integer concatenation).
    *   Simulated human-like typing speeds to avoid anti-bot detection.

---

## 🔑 AI Configuration

This project utilizes the **Pollinations AI** gateway for high-performance model access.

1.  **Get a Key**: Request your free secret at [enter.pollinations.ai](https://enter.pollinations.ai).
2.  **Compatibility**: Supports OpenAI-compatible endpoints and any multimodal model (GPT-4o, DeepSeek, Claude).

---

## 📋 Quick Start guide

### Option 1: Tampermonkey (Recommended)
1. Install a userscript manager like **Tampermonkey**.
2. Create a new script and paste the contents of `wrapper.user.js`.
3. Visit any `onluyen.vn` homework page.
4. The **AI Solver Panel** will appear automatically. Enter your API key once in the portal, and you're ready!

### Option 2: Sniper Fetch (One-Liner)
Open **DevTools (F12) > Console** and run:
```js
fetch('https://the-lazybone.github.io/ONLUYEN-HOMEWORK-AUTO-SOLVER/solver.js')
  .then(r => r.text()).then(eval);
```
*Note: The UI panel will appear automatically.*

---

## 🎮 Command Reference

| Command | Description |
|:---|:---|
| `hwSolver.start()` | Automates the entire page from top to bottom. |
| `hwSolver.stop()` | Halts any active solving processes immediately. |
| `hwSolver.solveOnce()` | Solves the first detected unsolved question. |
| `hwSolver.toggleInstantMode()` | Toggles human-like vs. instant interaction speed. |
| `hwSolver.toggleThinkBeforeAnswer()` | Toggles model reasoning output in logs. |
| `hwSolver.help()` | Displays the full CLI interface documentation. |

---

## 🛠️ Engineering Architecture

This project is built using a decoupled modular architecture:

*   **`Scraper`**: High-resilience engine using heuristic detection to identify question blocks, extract text/images, and detect "Solved" states.
*   **`APIClient`**: Robust wrapper for OpenAI-compatible proxies with multimodal support and error recovery.
*   **`UIController`**: Interaction layer that simulates mouse/keyboard events, handling complex non-standard UI components (div-buttons, custom spans).
*   **`HomeworkSolver`**: The brain of the operation, managing the solve-loop, context management, and rate-limiting.

---

## ⚠️ Disclaimer & Ethics

*   **Educational Use Only**: This tool is a proof-of-concept for browser automation and AI integration. It is intended for study, verification, and research purposes.
*   **Terms of Service**: Automated interaction with websites may violate their Terms of Service. Use responsibly and with permission.
*   **Accuracy**: AI models are statistical; they can hallucinate. Always verify results manually.

## 📝 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---
~~*Developed with ❤️ for the automation community.*~~
*Developed with hate for the school's exercises.*

### ❤️ Special Thanks
This project is powered by [Pollinations.ai](https://pollinations.ai), providing highly accessible and performant AI infrastructure for the automation community. 🚀
