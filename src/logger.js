import { CONFIG } from './constants.js';

export class Logger {
    constructor() {
        this.history = [];
        this.levels = { DEBUG: 1, INFO: 2, WARN: 3, ERROR: 4, NONE: 5 };
    }

    _log(level, ...args) {
        const numericLevel = this.levels[level.toUpperCase()];
        const configLevel =
            this.levels[CONFIG.LOG_LEVEL.toUpperCase()] || this.levels.NONE;
        if (!numericLevel || numericLevel < configLevel) return;

        const timestamp = new Date().toISOString();
        const message = `[HW-Solver][${level.toUpperCase()}]`;

        if (this.history.length >= CONFIG.LOG_HISTORY_LIMIT)
            this.history.shift();
        this.history.push({ timestamp, level, messages: args });

        const logArgs = [message, `(${timestamp})`, ...args];
        switch (level.toUpperCase()) {
            case "WARN":
                console.warn(...logArgs);
                break;
            case "ERROR":
                console.error(...logArgs);
                break;
            case "DEBUG":
                console.debug(...logArgs);
                break;
            default:
                console.log(...logArgs);
                break;
        }
    }

    info(...args) {
        this._log("INFO", ...args);
    }
    warn(...args) {
        this._log("WARN", ...args);
    }
    error(...args) {
        this._log("ERROR", ...args);
    }
    debug(...args) {
        this._log("DEBUG", ...args);
    }
}

export const logger = new Logger();
