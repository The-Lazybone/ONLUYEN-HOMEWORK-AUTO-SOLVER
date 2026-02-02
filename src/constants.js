export const CONFIG = {
    PROXY_URL:
        localStorage.getItem("HW_SOLVER_PROXY_URL") ||
        "https://gen.pollinations.ai/v1/chat/completions",
    POLL_KEY:
        localStorage.getItem("HW_SOLVER_API_KEY") ||
        (typeof globalThis !== "undefined" &&
            globalThis.__HW_SOLVER_POLL_KEY__) ||
        "",
    DEFAULT_MODEL:
        localStorage.getItem("HW_SOLVER_DEFAULT_MODEL") || "gemini",
    VISION_MODEL:
        localStorage.getItem("HW_SOLVER_VISION_MODEL") || "gemini",
    RETRIES: 3,
    PROXY_TIMEOUT_MS: 300000,
    LOOP_INTERVAL_MS: 4000,
    HUMAN_DELAY_MIN: 200,
    HUMAN_DELAY_MAX: 800,
    LOG_LEVEL: localStorage.getItem("HW_SOLVER_LOG_LEVEL") || "INFO",
    LOG_HISTORY_LIMIT: 100,
    INSTANT_MODE: localStorage.getItem("HW_SOLVER_INSTANT_MODE") === "true",
    THINK_BEFORE_ANSWER:
        localStorage.getItem("HW_SOLVER_THINK_BEFORE_ANSWER") !== "false", // Default to true
    IDLE_THRESHOLD:
        parseInt(localStorage.getItem("HW_SOLVER_IDLE_THRESHOLD"), 10) ||
        10,
};
