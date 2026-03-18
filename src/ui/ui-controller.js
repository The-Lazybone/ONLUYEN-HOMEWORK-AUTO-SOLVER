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

        const events = ["mouseenter", "mouseover", "mousedown", "pointerdown", "mouseup", "pointerup", "click"];

        events.forEach(evtType => {
            try {
                const isPointer = evtType.startsWith("pointer");
                const EventClass = isPointer ? PointerEvent : MouseEvent;
                const event = new EventClass(evtType, {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    button: 0,
                    buttons: 1
                });
                el.dispatchEvent(event);
            } catch (e) {
                logger.debug(`Dispatch ${evtType} failed:`, e);
            }
        });

        try {
            el.focus?.();
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
        } catch (e) {
            logger.debug("Final events failed:", e);
        }
        logger.debug("Simulated robust click on", el);
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

        // Support both radio and checkbox, and look deeper
        let inputEl = option.element.querySelector("input");
        if (!inputEl) {
            const container = option.element.closest('.question-option, .select-item, .item-answer, .option');
            if (container) {
                inputEl = container.querySelector("input");
            }
        }

        if (inputEl) {
            inputEl.checked = true;
            inputEl.dispatchEvent(new Event("change", { bubbles: true }));
            inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        }
        logger.debug("Selected option", option.letter);
        return true;
    }

    async fillBlank(blank, text) {
        if (!blank || !blank.element) return false;
        const el = blank.element;

        const isTinyMce = (el.id && el.id.includes('tiny')) || el.closest('app-tinymce-textarea, editor');
        if (isTinyMce) {
            logger.debug("Detected TinyMCE textarea, attempting iframe injection");
            const wrapper = el.closest('app-tinymce-textarea') || el.closest('editor') || el.parentElement;
            if (wrapper) {
                const iframe = wrapper.querySelector('iframe.tox-edit-area__iframe') || wrapper.querySelector('iframe');
                if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
                    const htmlText = `<p>${text}</p>`;
                    iframe.contentDocument.body.innerHTML = htmlText;
                    
                    // Dispatch events inside iframe to notify TinyMCE's internal bindings
                    iframe.contentDocument.body.dispatchEvent(new Event("input", { bubbles: true }));
                    iframe.contentDocument.body.dispatchEvent(new Event("keyup", { bubbles: true }));
                    
                    // Force sync the underlying textarea so Angular picks up the model change
                    el.value = htmlText;
                    el.dispatchEvent(new Event("input", { bubbles: true }));
                    el.dispatchEvent(new Event("change", { bubbles: true }));
                    
                    logger.debug("Filled TinyMCE iframe with:", text);
                    return true;
                } else {
                    logger.warn("TinyMCE iframe found but contentDocument is inaccessible (possibly cross-origin). Falling back...");
                }
            }
        }
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
            // REMOVED "Bỏ qua" and "btn-gray" from here as they are SKIP buttons, not SUBMIT
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
