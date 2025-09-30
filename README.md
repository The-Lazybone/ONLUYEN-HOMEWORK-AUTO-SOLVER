# 🚀 AI Homework Solver for Web Pages

This tool helps you automatically answer homework questions on websites like `onluyen.vn` using Artificial Intelligence. It works by reading the questions from the webpage, sending them to an AI, and then automatically filling in or selecting the answers for you.

It's designed to be flexible, but you might need to adjust it slightly for different websites.
</nbsp>

## 🔑 Get Your Free AI Key

This project uses the Pollinations AI proxy to connect to powerful AI models. You'll need a key to use their service.

* **Where to get it**: Request a free key at [auth.pollinations.ai](https://auth.pollinations.ai).
* **Keep it private**: Treat your AI key like a password. Don't share it or put it in public code.
</nbsp>

## 📋 Quick Setup Guide: Get Started in Minutes

You have two easy ways to use the Homework Solver in your web browser.
</nbsp>

### Option 1: Copy and Paste (No Downloads Needed!)

This is the fastest way to get started.

1. **Open Your Homework Page**: Go to the website where your homework questions are (e.g., `onluyen.vn`).
2. **Open Your Browser's Console**:
    * Right-click anywhere on the page.
    * Choose "Inspect" or "Inspect Element" from the menu.
    * Click on the "Console" tab in the window that opens.
3. **Enter Your AI Key**: Type the following line into the Console and press `Enter`. Replace `'YOUR_API_KEY_HERE'` with your actual AI key (see "🔑 Get Your Free AI Key" below for how to get one).

    ```js
    window.__HW_SOLVER_POLL_KEY__ = 'YOUR_API_KEY_HERE';
    ```

4. **Load the Solver Script**:
    * Go to the `solver.js` file in this project (you can find it on GitHub).
    * Copy **all** the code from that file.
    * Paste the copied code directly into your browser's Console and press `Enter`.
5. **Start Solving!**: The solver is now ready. You need to tell it to begin:

    ```js
    hwSolver.start(); // This will make the solver automatically try to answer questions one by one.
    // OR, if you only want to solve the current question:
    // hwSolver.solveOnce();
    ```

</nbsp>

### Option 2: One-Line Fetch (Even Faster!)

This method loads the script directly from GitHub, saving you a copy-paste step.

1. **Open Your Homework Page**: Go to the website with your homework questions (e.g., `onluyen.vn`).
2. **Open Your Browser's Console** (Right-click > Inspect > Console).
3. **Enter Your AI Key**: Just like in Option 1, type this line and press `Enter`, replacing `'YOUR_API_KEY_HERE'` with your AI key:

    ```js
    window.__HW_SOLVER_POLL_KEY__ = 'YOUR_API_KEY_HERE';
    ```

4. **Load and Run the Solver**: Paste this single line into the Console and press `Enter`.

    ```js
    fetch('https://the-lazybone.github.io/ONLUYEN-HOMEWORK-AUTO-SOLVER/solver.js')
      .then(response => response.text())
      .then(scriptText => eval(scriptText))
      .catch(error => console.error('Failed to load or run solver script:', error));
    ```

5. **Start Solving!**: After the script loads, tell it to begin:

    ```js
    hwSolver.start(); // Or hwSolver.solveOnce();
    ```

</nbsp>

## 🎮 How to Control the Solver

Once the `solver.js` script is loaded, you can use these commands in your browser's Console:

* `hwSolver.start()`: Starts the solver, which will automatically try to answer questions one by one.
* `hwSolver.stop()`: Stops the automatic solving process.
* `hwSolver.solveOnce()`: Solves only the current question and then stops.
* `hwSolver.toggleInstantMode()`: Switches between fast (instant) typing and human-like typing speeds.
* `hwSolver.toggleThinkBeforeAnswer()`: Toggles whether the AI shows its internal reasoning before giving a final answer.
* `hwSolver.help()`: Shows a list of available commands in the console.
</nbsp>

## ❓ Frequently Asked Questions

* **"My browser blocked the script!"**: Some browsers have strict security. Try using your browser's "Snippets" feature (usually in the "Sources" tab of Developer Tools) or save `solver.js` to your computer and load it as a local file.
* **"The solver isn't working on my homework site."**: This tool was primarily tested on `onluyen.vn`. Other sites might have different layouts. You might need to update the "selectors" (the parts of the code that find buttons and text boxes) in `solver.js`. This usually requires some coding knowledge.
* **"What AI models can I use?"**: The `solver.js` file uses models like `deepseek-reasoning` or `openai-reasoning`. You can find a list of supported models at [text.pollinations.ai/models](https://text.pollinations.ai/models) if you want to change them in the `solver.js` file.
</nbsp>

## ⚠️ Important Notes

* **Security Warning for Option 2 (`eval()` command)**: The one-line fetch method uses `eval()`, which runs code directly from the internet. **Only use this with scripts from sources you completely trust.** While we've included error handling, always be cautious.
* **Permissions & Ethics**: This is a research and testing tool. **Always get permission** before using automated tools on any website. Using automation without consent can violate terms of service and local laws. Do not use this tool to cheat or facilitate academic dishonesty.
* **AI Accuracy Disclaimer**: The AI in this tool is advanced but not infallible—it will not always provide correct answers (never 100% accuracy). Use this solely for educational purposes and verification. Always review and double-check AI-generated responses manually before submitting, as errors can occur.
* **Customization**: This is a prototype. If you want to use it on a new site, you'll likely need to update the CSS selectors (in the `Scraper` and `UIController` classes within `solver.js`) to match that site's specific design.
* **Tested Browsers**:
  * Microsoft Edge (Chromium)
  * Google Chrome
  * Brave
</nbsp>

## 🔧 For Advanced Users & Developers

* **API Key Priority**: The code reads the AI key in this order:
    1. `window.__HW_SOLVER_POLL_KEY__` (injected via browser console - preferred)
    2. `process.env.HW_SOLVER_POLL_KEY` (for local Node.js environments)
* **Contributing**: Feel free to contribute! If you find bugs or want to add features, please open an issue or pull request.
* **License**: This project is open-source. Please add a `LICENSE` file (MIT license is recommended) with your name before publishing or distributing.
</nbsp>

## Credits

Developed and tested using the Pollinations.ai proxy. Special thanks to [Pollinations](https://pollinations.ai) for their API/proxy service.
