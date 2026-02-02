// ==UserScript==
// @name         Intelligent AI Homework Solver (Loader)
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Dynamic loader for the Intelligent AI Homework Solver.
// @author       NGUYEN CONG ANH
// @match        *://*.onluyen.vn/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    "use strict";
    const SCRIPT_URL =
        "https://raw.githubusercontent.com/The-Lazybone/ONLUYEN-HOMEWORK-AUTO-SOLVER/v2-modular/dist/solver.user.js";

    const LOAD_DELAY = 2000; // 2 second delay

    console.log(
        `[AI Solver] Waiting ${LOAD_DELAY}ms for page stabilization...`
    );

    setTimeout(() => {
        console.log("[AI Solver] Loading core logic from GitHub...");

        fetch(SCRIPT_URL)
            .then((response) => {
                if (!response.ok)
                    throw new Error("Network response was not ok");
                return response.text();
            })
            .then((code) => {
                eval(code);
                console.log("[AI Solver] Core logic loaded successfully.");
            })
            .catch((error) => {
                console.error("[AI Solver] Failed to load core logic:", error);
            });
    }, LOAD_DELAY);
})();
