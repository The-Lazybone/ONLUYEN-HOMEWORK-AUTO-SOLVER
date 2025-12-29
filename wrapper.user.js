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
        "https://the-lazybone.github.io/ONLUYEN-HOMEWORK-AUTO-SOLVER/solver.js";

    console.log("[AI Solver] Loading core logic from GitHub...");

    fetch(SCRIPT_URL)
        .then((response) => {
            if (!response.ok) throw new Error("Network response was not ok");
            return response.text();
        })
        .then((code) => {
            eval(code);
            console.log("[AI Solver] Core logic loaded successfully.");
        })
        .catch((error) => {
            console.error("[AI Solver] Failed to load core logic:", error);
        });
})();
