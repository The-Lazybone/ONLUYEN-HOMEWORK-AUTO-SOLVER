import { logger } from '../logger.js';

/**
 * MathLogic uses the global 'math' object provided by the MathJS CDN.
 */
export class MathLogic {
    constructor() {
        if (typeof math === 'undefined') {
            logger.warn("MathJS library (math) not found. Math functions will be disabled.");
        }
    }

    /**
     * Evaluates a mathematical expression string.
     * @param {string} expr 
     * @returns {any}
     */
    evaluate(expr) {
        try {
            if (typeof math !== 'undefined') {
                return math.evaluate(expr);
            }
            return "MathJS missing";
        } catch (e) {
            logger.error("Math evaluation failed:", e);
            return null;
        }
    }

    /**
     * Simplifies a mathematical expression.
     */
    simplify(expr) {
        try {
            if (typeof math !== 'undefined') {
                return math.simplify(expr).toString();
            }
            return expr;
        } catch (e) {
            return expr;
        }
    }
}

export const mathLogic = new MathLogic();
