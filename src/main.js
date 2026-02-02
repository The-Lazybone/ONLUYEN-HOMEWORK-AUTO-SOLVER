import { logger } from './logger.js';
import { CONFIG } from './constants.js';
import { HomeworkSolver } from './core/homework-solver.js';

logger.info("Initializing Homework Solver (Modular Version)...");
const solver = new HomeworkSolver();

// Expose controls to the window
window.hwSolver = {
    start: solver.start.bind(solver),
    stop: solver.stop.bind(solver),
    solveOnce: solver.solveOnce.bind(solver),
    config: CONFIG,
    logger: logger,
    scraper: solver.scraper,
    toggleInstantMode: () => {
        CONFIG.INSTANT_MODE = !CONFIG.INSTANT_MODE;
        localStorage.setItem("HW_SOLVER_INSTANT_MODE", CONFIG.INSTANT_MODE);
        logger.info(`Instant Mode toggled: ${CONFIG.INSTANT_MODE ? "ON" : "OFF"}`);
        return `Instant Mode is now ${CONFIG.INSTANT_MODE ? "ON" : "OFF"}`;
    },
    toggleThinkBeforeAnswer: () => {
        CONFIG.THINK_BEFORE_ANSWER = !CONFIG.THINK_BEFORE_ANSWER;
        localStorage.setItem("HW_SOLVER_THINK_BEFORE_ANSWER", CONFIG.THINK_BEFORE_ANSWER);
        logger.info(`Think-Before-Answer toggled: ${CONFIG.THINK_BEFORE_ANSWER ? "ON" : "OFF"}`);
        return `Think-Before-Answer is now ${CONFIG.THINK_BEFORE_ANSWER ? "ON" : "OFF"}`;
    },
    isThinkBeforeAnswerEnabled: () => !!CONFIG.THINK_BEFORE_ANSWER,
    help: () => {
        console.log("hwSolver helper — quick commands:");
        console.log("  hwSolver.solveOnce()       — run one solve cycle");
        console.log("  hwSolver.start()           — start scheduler (repeats)");
        console.log("  hwSolver.stop()            — stop scheduler");
        console.log("  hwSolver.toggleInstantMode() — toggle fast typing mode");
        console.log("  hwSolver.toggleThinkBeforeAnswer() — toggle reasoning");
        console.log("  hwSolver.config            — read/write configuration");
        console.log("  hwSolver.logger.history    — view logs");
        return "See console for hwSolver commands";
    },
};

// Guardian Loop for UI Persistence
const startGuardian = (solverInstance) => {
    logger.debug("Guardian Loop started.");
    const performCheck = () => {
        const overlay = document.getElementById("hw-solver-overlay");
        const styles = document.getElementById("hw-solver-styles");
        if (!overlay || !styles) {
            logger.warn("Guardian detected missing UI components. Restoring...");
            solverInstance.overlay.init();
        }
    };
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.removedNodes) {
                if (node.id === "hw-solver-overlay" || node.id === "hw-solver-styles") {
                    performCheck();
                    return;
                }
            }
        }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setInterval(performCheck, 1500);
    window.addEventListener("popstate", performCheck);
    window.addEventListener("hashchange", performCheck);
};

startGuardian(solver);
