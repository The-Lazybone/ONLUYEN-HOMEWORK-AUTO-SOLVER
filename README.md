# ONLUYEN.VN HƠMEWORK SOLVER

This repository contains a single-file prototype (in `solver.js`) that demonstrates a browser-driven approach to scraping question text, building prompts for an LLM proxy, and simulating UI interactions to submit answers. The code is intentionally generic, but selectors and small behaviors were tuned and tested against onluyen.vn during development. It is NOT limited to that site — however, site-specific selectors or timing may need adjustments for other platforms.

## Quickstart — run in your browser (easiest)

1. Open the page with the question (e.g., onluyen.vn). Note: this script was tested on onluyen.vn, but it can be adapted to other sites by editing selectors in `solver.js`.
2. In DevTools Console set your API key:

   ```js
   window.__HW_SOLVER_POLL_KEY__ = 'sk-...';
   ```

3. Copy the entire contents of `solver.js` and paste it into the Console, then press Enter.
4. Start the solver:

   ```js
   hwSolver.toggleThinkBeforeAnswer(); // optional
   hwSolver.start(); // scheduler
   // or
   hwSolver.solveOnce(); // run a single cycle
   ```

> If the page blocks inline execution (CSP), use DevTools Snippets or run the script from the Sources panel.

## Tested browsers

- Microsoft Edge (Chromium)
- Google Chrome
- Brave

## Where to get an API key

This project was tested with the Pollinations proxy. You can request a key at [auth.pollinations.ai](https://auth.pollinations.ai). Keep the key private.

## How the code reads the API key

Priority order:

- `window.__HW_SOLVER_POLL_KEY__` (runtime injection — preferred)
- `process.env.HW_SOLVER_POLL_KEY` when available (for local Node checks / builds)

See `.env.example` for the variable name if you run local checks.

## Contributing & safety


Important safety and scope notes:

- This is a research/proof-of-concept tool. It is not a turnkey bot for every site. Different sites use different DOM structures, event models, and protections (CSP, anti-bot measures). You will likely need to update CSS selectors (Scraper and UIController) to match the target site.
- Always obtain permission before running automated interactions on third-party platforms. Running automation against a live site without consent can violate terms of service and local laws.
- Keep API keys private and do not commit them to source control. Use `.env` files or runtime injection per the README instructions.

## Credits

Developed and tested using the Pollinations.ai proxy. Thanks to Pollinations for providing the API/proxy used during development.

## License & disclaimer

- Add a LICENSE (MIT recommended) before publishing with your name.
- Ethics: "Research / automation testing only — do not use to facilitate academic dishonesty."
