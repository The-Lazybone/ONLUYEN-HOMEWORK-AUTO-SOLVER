import { CONFIG } from '../constants.js';
import { logger } from '../logger.js';

export class UIController {
    _simulateClick(el) {
        if (!el) return;
        try {
            el.scrollIntoView({ block: "center", inline: "center" });
        } catch (e) {
            logger.debug("Scroll into view failed:", e);
        }
        try {
            el.focus?.();
        } catch (e) {
            logger.debug("Focus failed:", e);
        }
        try {
            el.click();
        } catch (e) {
            logger.debug("Click failed:", e);
        }
        try {
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
        } catch (e) {
            logger.debug("Dispatch event failed:", e);
        }
        logger.debug("Simulated click on", el);
    }

    async _simulateTyping(element, text) {
        if (!element || !text) return;

        element.dispatchEvent(
            new MouseEvent("mouseover", { bubbles: true, composed: true }),
        );
        element.dispatchEvent(
            new MouseEvent("mouseenter", { bubbles: true, composed: true }),
        );

        element.focus();
        element.value = "";

        const minDelay = CONFIG.INSTANT_MODE ? 0 : CONFIG.HUMAN_DELAY_MIN;
        const maxDelay = CONFIG.INSTANT_MODE ? 50 : CONFIG.HUMAN_DELAY_MAX;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const charCode = char.charCodeAt(0);
            const keyCode = charCode < 32 ? 0 : charCode;

            element.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: char,
                    keyCode: keyCode,
                    charCode: charCode,
                    bubbles: true,
                    composed: true,
                }),
            );
            element.dispatchEvent(
                new KeyboardEvent("keypress", {
                    key: char,
                    keyCode: keyCode,
                    charCode: charCode,
                    bubbles: true,
                    composed: true,
                }),
            );

            element.value += char;
            element.dispatchEvent(
                new InputEvent("input", {
                    data: char,
                    inputType: "insertText",
                    bubbles: true,
                    composed: true,
                }),
            );

            element.dispatchEvent(
                new KeyboardEvent("keyup", {
                    key: char,
                    keyCode: keyCode,
                    charCode: charCode,
                    bubbles: true,
                    composed: true,
                }),
            );

            if (i < text.length - 1) {
                await new Promise((r) =>
                    setTimeout(
                        r,
                        minDelay + Math.random() * (maxDelay - minDelay),
                    ),
                );
            }
        }

        element.dispatchEvent(new Event("change", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 100));
        element.blur();
        logger.debug(`Simulated ${CONFIG.INSTANT_MODE ? "fast" : "human"} typing: "${text}"`);
    }

    selectOption(option) {
        if (!option || !option.element) return false;
        this._simulateClick(option.element);
        const inputEl = option.element.querySelector("input");
        if (inputEl) {
            inputEl.checked = true;
            inputEl.dispatchEvent(new Event("change", { bubbles: true }));
        }
        logger.debug("Selected option", option.letter);
        return true;
    }

    async fillBlank(blank, text) {
        if (!blank || !blank.element) return false;
        const el = blank.element;
        try {
            await this._simulateTyping(el, text);
            if (el.value !== text) {
                logger.warn("Failed to set input value via typing simulation.");
                return false;
            }
            logger.debug("Filled blank with:", text);
            return true;
        } catch (e) {
            logger.error("fillBlank error", e);
            return false;
        }
    }

    selectTrueFalse(subQuestion, value) {
        if (!subQuestion) return false;
        const targetElement = value
            ? subQuestion.trueElement
            : subQuestion.falseElement;
        if (!targetElement) {
            logger.warn(`True/False element not found for sub-question ${subQuestion.char} with value ${value}.`);
            return false;
        }
        this._simulateClick(targetElement);

        if (targetElement.tagName === "INPUT") {
            targetElement.checked = true;
            targetElement.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
            targetElement.classList.add("active-answer");
            targetElement.dispatchEvent(new Event("click", { bubbles: true }));
        }

        logger.debug(`Selected ${value ? "True" : "False"} for sub-question ${subQuestion.char || ""}`);
        return true;
    }

    async clickSubmit() {
        const candidates = Array.from(
            document.querySelectorAll('button, input[type="button"], input[type="submit"]')
        ).filter((b) => !b.disabled);
        const selectors = [
            (b) => (b.innerText || b.value || "").trim() === "Trả lời",
            (b) => b.matches("button.btn.btn-lg.btn-block.ripple.btn-primary"),
            (b) => b.matches("button.btn-primary"),
            (b) => /trả lời|tra loi/i.test(b.innerText || b.value || ""),
            (b) => (b.innerText || b.value || "").trim() === "Bỏ qua" || b.matches("button.btn-gray"),
            (b) => (b.innerText || b.value || "").trim() === "Submit",
            (b) => (b.innerText || b.value || "").trim() === "Check Answer",
            (b) => /submit/i.test(b.innerText || b.value || ""),
            (b) => b.matches('input[type="submit"]'),
        ];

        let submitButton = null;
        for (const selector of selectors) {
            submitButton = candidates.find(selector);
            if (submitButton) break;
        }

        if (!submitButton) {
            logger.warn("Submit button not found");
            return false;
        }

        this._simulateClick(submitButton);
        logger.debug("Clicked submit button");
        await new Promise((r) => setTimeout(r, 800));
        return true;
    }

    async clickSkip() {
        const candidates = Array.from(
            document.querySelectorAll('button, input[type="button"], input[type="submit"]')
        ).filter((b) => !b.disabled);
        const selectors = [
            (b) => (b.innerText || b.value || "").trim() === "Bỏ qua",
            (b) => b.matches("button.btn-gray"),
            (b) => /skip|bỏ qua/i.test(b.innerText || b.value || ""),
        ];

        let skipButton = null;
        for (const selector of selectors) {
            skipButton = candidates.find(selector);
            if (skipButton) break;
        }

        if (!skipButton) {
            logger.warn("Skip button not found.");
            return false;
        }

        this._simulateClick(skipButton);
        logger.info("Clicked skip button.");
        await new Promise((r) => setTimeout(r, 2000));
        return true;
    }

    clearAllAnswers() {
        logger.info("Clearing all answers on page...");
        document.querySelectorAll("input[type='text'], textarea").forEach((el) => {
            if (el.closest("#hw-solver-overlay")) return;
            el.value = "";
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
        });

        document.querySelectorAll("input[type='radio'], input[type='checkbox']").forEach((el) => {
            if (el.closest("#hw-solver-overlay")) return;
            el.checked = false;
            el.dispatchEvent(new Event("change", { bubbles: true }));
        });

        const classesToRemove = ["active-answer", "selected", "done", "highlighed", "highlighted", "active", "checked", "active-answer-item"];
        document.querySelectorAll(classesToRemove.map((c) => `.${c}`).join(", ")).forEach((el) => {
            if (el.closest("#hw-solver-overlay")) return;
            el.classList.remove(...classesToRemove);
        });

        document.querySelectorAll(".answer-sheet .option, .mobile-bottom-bar .number").forEach((el) => el.classList.remove("done"));
        document.querySelectorAll(".text-answered, .answer-label-checked").forEach((el) => el.remove());

        window._lastQNum = -1;
        window._lastQId = -1;

        logger.info("All answers cleared.");
        return true;
    }
}
