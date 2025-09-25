# ONLUYEN.VN HOMEWORK SOLVER

This repository contains a single-file prototype (in `solver.js`) that demonstrates a browser-driven approach to scraping question text, building prompts for an LLM proxy, and simulating UI interactions to submit answers. The code is intentionally generic, but selectors and small behaviors were tuned and tested against onluyen.vn during development. It is NOT limited to that site — however, site-specific selectors or timing may need adjustments for other platforms.

## Quickstart: How to Use the Homework Solver

This guide will show you how to easily run the Homework Solver in your web browser. You have two options: a simple copy-and-paste method, or a convenient one-line command using the hosted script.

### Option 1: Copy and Paste (No Setup Required)

This is the quickest way to get started.

1. **Go to Your Homework Page**: Open the website where your homework questions are located (for example, `onluyen.vn`).
2. **Open Your Browser's Console**:
    * Right-click anywhere on the page.
    * Select "Inspect" or "Inspect Element" from the menu.
    * Click on the "Console" tab in the window that appears.
3. **Enter Your API Key**: In the Console, type the following line and press Enter. Make sure to replace `'YOUR_API_KEY_HERE'` with your actual API key (you can find information on where to get one below).

    ```js
    window.__HW_SOLVER_POLL_KEY__ = 'YOUR_API_KEY_HERE';
    ```

4. **Load the Solver Script**:
    * Go to the `solver.js` file in this repository.
    * Copy **all** the code from that file.
    * Paste the copied code directly into your browser's Console and press Enter.
5. **Start Solving!**: Now the solver is ready. You must explicitly tell it to start:

    ```js
    hwSolver.start(); // This will make the solver automatically try to answer questions one by one.
    // OR, if you only want to solve the current question:
    // hwSolver.solveOnce();
    ```

    * (Optional) If you want the solver to show its "thinking process" before giving an answer, type `hwSolver.toggleThinkBeforeAnswer();` into the console before `hwSolver.start()`.

> **Troubleshooting Tip**: If your browser prevents you from pasting or running the script directly (sometimes due to security settings), you might need to use your browser's "Snippets" feature (found in the "Sources" tab of the Developer Tools) or save `solver.js` as a local file and load it from there.

### Option 2: One-Line Fetch (Using GitHub Pages)

This method is even faster and more convenient, as the project is already hosted on GitHub Pages.

1. **Go to Your Homework Page**: Open the website with your homework questions (e.g., `onluyen.vn`).
2. **Open Your Browser's Console** (Right-click > Inspect > Console).
3. **Enter Your API Key**: Just like in Option 1, type this line and press Enter, replacing `'YOUR_API_KEY_HERE'` with your API key:

    ```js
    window.__HW_SOLVER_POLL_KEY__ = 'YOUR_API_KEY_HERE';
    ```

4. **Load and Run the Solver**: Paste this single line into the Console and press Enter. This command will fetch the `solver.js` script directly from the project's GitHub Pages and run it.

    ```js
    fetch('https://the-lazybone.github.io/ONLUYEN-HOMEWORK-AUTO-SOLVER/solver.js')
      .then(response => response.text())
      .then(scriptText => eval(scriptText))
      .catch(error => console.error('Failed to load or run solver script:', error));
    ```

5. **Start Solving!**: After the script loads, you must explicitly tell it to start:

    ```js
    hwSolver.start(); // Or hwSolver.solveOnce();
    ```

> **Important Security Note**: The `eval()` command executes code directly from the internet. Only use this method with scripts from sources you completely trust. The error handling in the one-liner helps catch issues, but always be careful.

## Tested browsers

* Microsoft Edge (Chromium)
* Google Chrome
* Brave

## Where to get an API key

This project was tested with the Pollinations proxy. You can request a key at [auth.pollinations.ai](https://auth.pollinations.ai). Keep the key private.

## Model Names

Model names used in `solver.js` (e.g., `deepseek-reasoning`, `openai-reasoning`) can be found at [text.pollinations.ai/models](https://text.pollinations.ai/models). Refer to this link if you wish to change the default models used by the solver.

## How the code reads the API key

Priority order:

* `window.__HW_SOLVER_POLL_KEY__` (runtime injection — preferred)
* `process.env.HW_SOLVER_POLL_KEY` when available (for local Node checks / builds)

See `.env.example` for the variable name if you run local checks.

## Contributing & safety

Important safety and scope notes:

* This is a research/proof-of-concept tool. It is not a turnkey bot for every site. Different sites use different DOM structures, event models, and protections (CSP, anti-bot measures). You will likely need to update CSS selectors (Scraper and UIController) to match the target site.
* Always obtain permission before running automated interactions on third-party platforms. Running automation against a live site without consent can violate terms of service and local laws.
* Keep API keys private and do not commit them to source control. Use `.env` files or runtime injection per the README instructions.

## Credits

Developed and tested using the Pollinations.ai proxy. Thanks to [Pollinations](https://pollinations.ai) for providing the API/proxy used during development.

## License & disclaimer

* Add a LICENSE (MIT recommended) before publishing with your name.
* Ethics: "Research / automation testing only — do not use to facilitate academic dishonesty."
