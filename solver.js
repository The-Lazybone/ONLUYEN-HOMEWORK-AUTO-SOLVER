// === Unified Auto-solver (MCQ + Fill-in) ===
// NOTE: This is a generic, single-file prototype intended for research and
// testing. During development it was tuned and tested against onluyen.vn —
// but it is NOT limited to that site. Selectors, timings, and small UI
// interactions are site-specific and must be adjusted for other platforms.
// Always obtain permission before running automated interactions against
// third-party websites.
// A modular, multi-class implementation for better readability and maintenance.

(function () {
    "use strict";

    // -------------- CONFIGURATION --------------
    const CONFIG = {
        PROXY_URL: "https://text.pollinations.ai/openai",
        // Replace the POLL_KEY at runtime or build-time. Defaults to empty to avoid leaking secrets.
        POLL_KEY:
            (typeof globalThis !== "undefined" &&
                globalThis.__HW_SOLVER_POLL_KEY__) ||
            (typeof globalThis !== "undefined" &&
                globalThis.process &&
                globalThis.process.env &&
                globalThis.process.env.HW_SOLVER_POLL_KEY) |
            "",
        DEFAULT_MODEL: "openai-reasoning", // Default model for text-only prompts
        VISION_MODEL: "openai-reasoning", // Model for prompts with images
        RETRIES: 3,
        PROXY_TIMEOUT_MS: 300000,
        LOOP_INTERVAL_MS: 4000,
        HUMAN_DELAY_MIN: 200,
        HUMAN_DELAY_MAX: 800,
        LOG_LEVEL: "DEBUG", // 'DEBUG', 'INFO', 'WARN', 'ERROR', 'NONE'
        LOG_HISTORY_LIMIT: 100,
        INSTANT_MODE: false, // New flag for instant typing
        THINK_BEFORE_ANSWER: true, // When true, instruct model to think step-by-step and return a FINAL: answer
    };

    // -------------- LOGGER CLASS --------------
    class Logger {
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
    const logger = new Logger();

    // -------------- API CLIENT CLASS --------------
    class APIClient {
        async call(prompt, images = []) {
            if (!CONFIG.PROXY_URL) throw new Error("Proxy not configured");

            const userContent = [{ type: "text", text: prompt }];
            images.forEach((imgSrc) => {
                userContent.push({
                    type: "image_url",
                    image_url: { url: imgSrc },
                });
            });

            const modelToUse =
                images.length > 0 ? CONFIG.VISION_MODEL : CONFIG.DEFAULT_MODEL;
            logger.debug(
                `Using model: ${modelToUse} for prompt with ${images.length} images.`
            );

            const payload = {
                model: modelToUse,
                "reasoning-effort": "high",
                messages: [
                    {
                        role: "system",
                        content:
                            "You are a precise assistant. Reply exactly as asked.",
                    },
                    { role: "user", content: userContent },
                ],
                max_tokens: 64,
                temperature: 1, // Changed to 1 as required by the model
            };

            // Optionally include a seed but ensure it's a safe 32-bit integer (some proxies validate this)
            try {
                const rawSeed = Date.now();
                // Clamp to 32-bit signed integer
                const seed = rawSeed & 0x7fffffff;
                payload.seed = seed;
                logger.debug("Using seed for request:", seed);
            } catch (e) {
                logger.debug(
                    "Seed generation failed, omitting seed from payload.",
                    e
                );
            }

            const headers = { "Content-Type": "application/json" };
            if (CONFIG.POLL_KEY)
                headers["Authorization"] = `Bearer ${CONFIG.POLL_KEY}`;

            const controller = new AbortController();
            const timeoutId = setTimeout(
                () => controller.abort(),
                CONFIG.PROXY_TIMEOUT_MS
            );

            try {
                const res = await fetch(CONFIG.PROXY_URL, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(payload),
                    signal: controller.signal,
                });

                if (!res.ok) {
                    const txt = await res.text().catch(() => "");
                    throw new Error(`HTTP ${res.status}: ${txt}`);
                }

                const rawText = await res.text();
                try {
                    return JSON.parse(rawText);
                } catch {
                    logger.debug("Received non-JSON response:", rawText);
                    return rawText;
                }
            } finally {
                clearTimeout(timeoutId);
            }
        }
    }

    // -------------- SCRAPER CLASS --------------
    class Scraper {
        _normalize(s) {
            return (s || "").replace(/\s+/g, " ").trim();
        }

        _convertNumberWordToDigit(word) {
            const wordMap = {
                zero: 0,
                one: 1,
                two: 2,
                three: 3,
                four: 4,
                five: 5,
                six: 6,
                seven: 7,
                eight: 8,
                nine: 9,
                ten: 10,
                eleven: 11,
                twelve: 12,
                thirteen: 13,
                fourteen: 14,
                fifteen: 15,
                sixteen: 16,
                seventeen: 17,
                eighteen: 18,
                nineteen: 19,
                twenty: 20,
                thirty: 30,
                forty: 40,
                fifty: 50,
                sixty: 60,
                seventy: 70,
                eighty: 80,
                ninety: 90,
                hundred: 100,
                hundreds: 100,
                thousand: 1000,
                thousands: 1000,
                million: 1000000,
                millions: 1000000,
            };
            return wordMap[word.toLowerCase()];
        }

        _convertFractionWordToDenominator(word) {
            const fractionMap = {
                half: 2,
                halves: 2,
                halfs: 2,
                third: 3,
                thirds: 3,
                fourth: 4,
                fourths: 4,
                quarter: 4,
                quarters: 4,
                fifth: 5,
                fifths: 5,
                sixth: 6,
                sixths: 6,
                seventh: 7,
                sevenths: 7,
                eighth: 8,
                eighths: 8,
                ninth: 9,
                ninths: 9,
                tenth: 10,
                tenths: 10,
                // Add more as needed for expandability
            };
            return fractionMap[word.toLowerCase()];
        }

        _getQuestionContainers() {
            // Return all potential question containers
            return Array.from(
                document.querySelectorAll(".question-name, #step")
            ).filter((el) => el.offsetParent !== null); // Filter out elements not currently visible/in document flow
        }

        _getCleanedText(element) {
            if (!element) return "";
            const clone = element.cloneNode(true);
            clone.querySelectorAll("mjx-container").forEach((mjx) => {
                let mathContent = "";
                const ariaLabel = mjx.getAttribute("aria-label");
                const assistiveMml = mjx.querySelector("mjx-assistive-mml");

                if (ariaLabel) {
                    // Prefer aria-label for its semantic richness
                    mathContent = ariaLabel;
                    logger.debug("Original MathJax aria-label:", ariaLabel);
                } else if (assistiveMml) {
                    // Fallback to assistive-mml's innerText
                    mathContent = assistiveMml.innerText.trim();
                    logger.debug("Original MathJax assistive-mml (fallback):", mathContent);
                }

                if (mathContent) {
                    // Remove invisible times character (U+2062) early
                    mathContent = mathContent.replace(/\u2062/g, "");
                    let cleanedLabel = mathContent;

                    // Basic essential replacements (from previous versions)
                    cleanedLabel = cleanedLabel
                        .replace(/\bleft bracket\b/gi, "[")
                        .replace(/\bright bracket\b/gi, "]")
                        .replace(/\bleft parenthesis\b/gi, "(")
                        .replace(/\bright parenthesis\b/gi, ")")
                        .replace(/\bsemicolon\b/gi, ";")
                        .replace(/\bequals\b/gi, "=")
                        .replace(/\bplus\b/gi, "+")
                        .replace(/\bminus\b/gi, "-")
                        .replace(/\btimes\b/gi, "*")
                        .replace(/\bdivided by\b/gi, "/")
                        .replace(/\binfinity\b/gi, "∞")
                        .replace(/\bmin\b/gi, "min")
                        .replace(/\bmax\b/gi, "max");

                    // Handle "squared" and "cubed"
                    cleanedLabel = cleanedLabel
                        .replace(/squared/g, "^2")
                        .replace(/cubed/g, "^3");

                    // Handle "to the power of X"
                    cleanedLabel = cleanedLabel.replace(/to the power of (\d+)/gi, "^$1");

                    // Handle "upper J", "upper K" etc. - remove "upper"
                    cleanedLabel = cleanedLabel.replace(/\bupper\s+/gi, "");

                    // Handle "degrees C" to "°C"
                    cleanedLabel = cleanedLabel.replace(/(\d+)\s*degrees\s*C/gi, "$1°C");
                    // Handle "o C" or "0 C" (digit zero) to "°C"
                    cleanedLabel = cleanedLabel.replace(/(\d+)\s*(?:o|0)\s*C/gi, "$1°C");

                    // Handle "period" to "."
                    cleanedLabel = cleanedLabel.replace(/\bperiod\b/gi, ".");

                    // Handle "comma" to ","
                    cleanedLabel = cleanedLabel.replace(/\bcomma\b/gi, ",");

                    // Handle "divided by" to "/"
                    cleanedLabel = cleanedLabel.replace(/\bdivided by\b/gi, "/");

                    // Handle negative and positive to - and +
                    cleanedLabel = cleanedLabel
                        .replace(/\bnegative\b/gi, "-")
                        .replace(/\bpositive\b/gi, "+");

                    // Convert number words to digits
                    const numberWords = [
                        "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
                        "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
                        "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety", "hundred", "thousand", "million"
                    ];
                    numberWords.forEach((word) => {
                        const digit = this._convertNumberWordToDigit(word);
                        if (digit !== undefined) {
                            const regex = new RegExp(`\\b${word}\\b`, "gi");
                            cleanedLabel = cleanedLabel.replace(regex, digit.toString());
                        }
                    });

                    // Handle basic fraction words (e.g., "3 halves")
                    cleanedLabel = cleanedLabel.replace(
                        /(\d+)\s+halves\b/gi,
                        "$1/2"
                    );

                    // Specific handling for scientific notation like "3.8 times 10 to the power of 2"
                    cleanedLabel = cleanedLabel.replace(/(\d+)\.(\d+)\s*times\s*10\^(\d+)/gi, "$1,$2 * 10^$3");
                    cleanedLabel = cleanedLabel.replace(/(\d+),(\d+)\s*times\s*10\^(\d+)/gi, "$1,$2 * 10^$3");

                    // Final pass for decimal separator: convert periods to commas in numbers, but not in units.
                    // This regex converts periods to commas only if they are between digits and not followed by a letter.
                    cleanedLabel = cleanedLabel.replace(/(\d+)\.(\d+)(?![a-zA-Z])/g, "$1,$2");

                    // !CRITICAL: HANDLE EVEN MORE CASES FR

                    logger.debug("Cleaned MathJax label:", cleanedLabel);
                    mjx.replaceWith(
                        document.createTextNode(` ${cleanedLabel} `)
                    );
                } else {
                    mjx.remove(); // Remove if no relevant content found
                }
            });
            return this._normalize(clone.innerText);
        }

        _scrapeImages(container) {
            if (!container) return [];
            return Array.from(container.querySelectorAll("img")).map(
                (img) => img.src
            );
        }

        _scrapeTable(container) {
            if (!container) return null;
            const table = container.querySelector(".table-material-question");
            return table ? table.outerHTML : null;
        }

        detectQuestionType() {
            const containers = this._getQuestionContainers();
            for (const container of containers) {
                logger.debug(
                    "Attempting to detect question type in container with class:",
                    container.className || container.tagName
                );
                const mcq = this.scrapeMCQ(container);
                if (mcq.options.length) return mcq;
                const fill = this.scrapeFillable(container);
                if (fill.blanks.length) return fill;
                const trueFalse = this.scrapeTrueFalse(container);
                if (trueFalse.subQuestions.length) return trueFalse;
            }
            return { type: "unknown" };
        }

        scrapeMCQ(container) {
            if (!container)
                return { type: "mcq", question: "", options: [], images: [] };

            const qNode =
                container.querySelector(".fadein") ||
                container.querySelector(".question-text") ||
                container;
            logger.debug("scrapeMCQ: qNode found:", qNode);
            const questionText = this._getCleanedText(qNode);
            logger.debug("scrapeMCQ: questionText:", questionText);
            const images = this._scrapeImages(qNode);

            const nodes = Array.from(
                container.querySelectorAll(
                    // Use container.querySelectorAll here
                    ".row.text-left.options .question-option, .list-selection .select-item"
                )
            );
            const options = nodes
                .map((node) => {
                    let letter, text, contentNode;
                    if (node.matches(".question-option")) {
                        // Legacy format
                        logger.debug("Processing legacy MCQ option format.");
                        letter =
                            node
                                .querySelector(".question-option-label")
                                ?.innerText.trim() || null;
                        contentNode = node.querySelector(
                            ".question-option-content"
                        );
                        text = this._getCleanedText(contentNode);
                    } else {
                        // New format for .select-item
                        logger.debug("Processing new MCQ option format.");
                        letter =
                            node
                                .querySelector(".number-item")
                                ?.innerText.trim()
                                .toUpperCase() || null;
                        contentNode = node.querySelector("label");
                        text = this._getCleanedText(contentNode);
                    }

                    return {
                        letter,
                        text,
                        images: contentNode
                            ? this._scrapeImages(contentNode)
                            : [],
                        element: node,
                    };
                })
                .filter((o) => o.letter);

            return { type: "mcq", question: questionText, options, images };
        }

        scrapeFillable(container) {
            if (!container)
                return {
                    type: "fillable",
                    question: "",
                    blanks: [],
                    images: [],
                };

            const qNode =
                container.querySelector(".fadein") ||
                container.querySelector(".question-text") ||
                container;
            const inputs = Array.from(
                container.querySelectorAll("input[type='text'], textarea")
            );
            // Clear existing values in the actual DOM inputs before scraping
            inputs.forEach((el) => {
                el.value = "";
                el.dispatchEvent(new Event("input", { bubbles: true }));
                el.dispatchEvent(new Event("change", { bubbles: true }));
            });
            const blanks = inputs.map((el, i) => ({ index: i, element: el }));

            let questionText = "";
            if (qNode) {
                const clone = qNode.cloneNode(true);
                clone
                    .querySelectorAll("input[type='text'], textarea")
                    .forEach((el) => {
                        const parent = el.parentNode;
                        // Remove the span that displays the pre-filled answer if present
                        const ansSpan =
                            parent.querySelector(".ans-span-second");
                        ansSpan?.remove();
                        // Replace input with [BLANK]
                        parent.replaceChild(
                            document.createTextNode(" [BLANK] "),
                            el
                        );
                    });
                questionText = this._getCleanedText(clone);
            }
            const images = this._scrapeImages(qNode);

            return { type: "fillable", question: questionText, blanks, images };
        }

        scrapeTrueFalse(container) {
            if (!container)
                return {
                    type: "truefalse",
                    question: "",
                    subQuestions: [],
                    images: [],
                    table: null,
                };

            const qNode =
                container.querySelector(".fadein") ||
                container.querySelector(".question-text") ||
                container;
            const questionText = this._getCleanedText(qNode);
            const images = this._scrapeImages(qNode);
            const table = this._scrapeTable(qNode);

            const subQuestionNodes = Array.from(
                container.querySelectorAll(".question-child .child-content")
            );
            const subQuestions = subQuestionNodes
                .map((node) => ({
                    char:
                        node
                            .querySelector(".option-char")
                            ?.innerText.trim()
                            .replace(")", "")
                            .replace(".", "") || null,
                    text: this._getCleanedText(node.querySelector(".fadein")),
                    trueElement: node.querySelector('input[value="true"]'),
                    falseElement: node.querySelector('input[value="false"]'),
                }))
                .filter((sq) => sq.char);

            return {
                type: "truefalse",
                question: questionText,
                subQuestions,
                images,
                table,
            };
        }
    }

    // -------------- UI CONTROLLER CLASS --------------
    class UIController {
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

            // Simulate mouse hover before typing
            element.dispatchEvent(
                new MouseEvent("mouseover", { bubbles: true, composed: true })
            );
            element.dispatchEvent(
                new MouseEvent("mouseenter", { bubbles: true, composed: true })
            );

            element.focus();
            element.value = ""; // Clear existing value

            // Always type char-by-char for authenticity, with delays based on instant mode
            const minDelay = CONFIG.INSTANT_MODE ? 0 : CONFIG.HUMAN_DELAY_MIN;
            const maxDelay = CONFIG.INSTANT_MODE ? 50 : CONFIG.HUMAN_DELAY_MAX;

            for (let i = 0; i < text.length; i++) {
                const char = text[i];
                const charCode = char.charCodeAt(0);
                const keyCode = charCode < 32 ? 0 : charCode; // Handle non-printable chars

                // Simulate full key sequence
                element.dispatchEvent(
                    new KeyboardEvent("keydown", {
                        key: char,
                        keyCode: keyCode,
                        charCode: charCode,
                        bubbles: true,
                        composed: true,
                    })
                );
                element.dispatchEvent(
                    new KeyboardEvent("keypress", {
                        key: char,
                        keyCode: keyCode,
                        charCode: charCode,
                        bubbles: true,
                        composed: true,
                    })
                );

                element.value += char;
                element.dispatchEvent(
                    new InputEvent("input", {
                        data: char,
                        inputType: "insertText",
                        bubbles: true,
                        composed: true,
                    })
                );

                element.dispatchEvent(
                    new KeyboardEvent("keyup", {
                        key: char,
                        keyCode: keyCode,
                        charCode: charCode,
                        bubbles: true,
                        composed: true,
                    })
                );

                // Add delay between characters (except after last char)
                if (i < text.length - 1) {
                    await new Promise((r) =>
                        setTimeout(
                            r,
                            minDelay + Math.random() * (maxDelay - minDelay)
                        )
                    );
                }
            }

            // Dispatch final events
            element.dispatchEvent(new Event("change", { bubbles: true }));

            // Introduce a small delay before blurring to allow processing
            await new Promise((r) => setTimeout(r, 100));

            element.blur();
            const logMode = CONFIG.INSTANT_MODE
                ? "fast typing"
                : "human typing";
            logger.debug(`Simulated ${logMode}: "${text}"`);
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
                    logger.warn(
                        "Failed to set input value via typing simulation."
                    );
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
                logger.warn(
                    `True/False element not found for sub-question ${subQuestion.char} with value ${value}.`
                );
                return false;
            }
            this._simulateClick(targetElement);
            targetElement.checked = true;
            targetElement.dispatchEvent(new Event("change", { bubbles: true }));
            logger.debug(
                `Selected ${value ? "True" : "False"} for sub-question ${
                    subQuestion.char
                }`
            );
            return true;
        }

        async clickSubmit() {
            const candidates = Array.from(
                document.querySelectorAll(
                    'button, input[type="button"], input[type="submit"]'
                )
            ).filter((b) => !b.disabled);
            const selectors = [
                (b) => (b.innerText || b.value || "").trim() === "Trả lời",
                (b) =>
                    b.matches("button.btn.btn-lg.btn-block.ripple.btn-primary"),
                (b) => b.matches("button.btn-primary"),
                (b) => /trả lời|tra loi/i.test(b.innerText || b.value || ""),
                (b) =>
                    (b.innerText || b.value || "").trim() === "Bỏ qua" ||
                    b.matches("button.btn-gray"),
                (b) => (b.innerText || b.value || "").trim() === "Submit",
                (b) => (b.innerText || b.value || "").trim() === "Check Answer",
                (b) => /submit/i.test(b.innerText || b.value || ""),
                (b) => b.matches('input[type="submit"]'),
            ];

            let submitButton = null;
            for (const selector of selectors) {
                submitButton = candidates.find(selector);
                if (submitButton) {
                    break;
                }
            }

            if (!submitButton) {
                logger.warn("Submit button not found");
                return false;
            }

            this._simulateClick(submitButton);
            logger.debug("Clicked submit button");
            await new Promise((r) => setTimeout(r, 1000)); // Delay for UI change

            const postText = (
                submitButton.innerText ||
                submitButton.value ||
                ""
            ).trim();
            logger.info(`Post-submit button text: "${postText}"`);

            // Removed "Kết thúc" button check as per user request.
            // The question ID/number check will handle the end of the quiz.

            logger.debug("Post-submit action completed.");
            return true; // Indicate successful submission
        }

        async clickSkip() {
            const candidates = Array.from(
                document.querySelectorAll(
                    'button, input[type="button"], input[type="submit"]'
                )
            ).filter((b) => !b.disabled);
            const selectors = [
                (b) => (b.innerText || b.value || "").trim() === "Bỏ qua",
                (b) => b.matches("button.btn-gray"),
                (b) => /skip|bỏ qua/i.test(b.innerText || b.value || ""),
            ];

            let skipButton = null;
            for (const selector of selectors) {
                skipButton = candidates.find(selector);
                if (skipButton) {
                    break;
                }
            }

            if (!skipButton) {
                logger.warn("Skip button ('Bỏ qua') not found.");
                return false;
            }

            this._simulateClick(skipButton);
            logger.info("Clicked skip button ('Bỏ qua').");
            await new Promise((r) => setTimeout(r, 2000)); // Increased delay for UI change

            const postSkipText = (
                skipButton.innerText ||
                skipButton.value ||
                ""
            ).trim();
            logger.info(`Post-skip button text: "${postSkipText}"`);

            // Removed "Kết thúc" button check as per user request.
            // The question ID/number check will handle the end of the quiz.

            logger.debug("Post-skip action completed.");
            return true;
        }
    }

    // -------------- SCHEDULER CLASS --------------
    class Scheduler {
        constructor(task, solver) {
            this.task = task;
            this.solver = solver;
            this.timer = null;
            this.active = false;
            this.failureCount = 0;
        }

        start() {
            if (this.active) return;
            this.active = true;
            this.failureCount = 0;
            logger.info("Scheduler started.");
            this._scheduleNext(true);
        }

        stop() {
            if (!this.active) return;
            this.active = false;
            clearTimeout(this.timer);
            this.timer = null;
            logger.info("Scheduler stopped.");
        }

        _scheduleNext(isSuccess) {
            if (!this.active) return;

            if (isSuccess) {
                this.failureCount = 0;
            } else {
                this.failureCount++;
                if (this.failureCount >= CONFIG.RETRIES) {
                    logger.warn(
                        `Max retries (${CONFIG.RETRIES}) reached for current question. Attempting to skip...`
                    );
                    this.failureCount = 0;
                    // Schedule an async skip action
                    this.timer = setTimeout(async () => {
                        try {
                            const skipped =
                                await this.solver.skipCurrentQuestion();
                            if (skipped) {
                                logger.info("Successfully skipped question.");
                            } else {
                                logger.warn(
                                    "Could not find skip button, proceeding to next question."
                                );
                            }
                            // Treat as success to advance
                            this._scheduleNext(true);
                        } catch (e) {
                            logger.error("Skip attempt failed:", e);
                            this._scheduleNext(true);
                        }
                    }, 0);
                    return;
                }
            }

            const baseInterval = CONFIG.LOOP_INTERVAL_MS;
            const jitter = Math.random() * 400;
            let backoff = 0;
            if (this.failureCount > 0) {
                backoff = Math.min(
                    1000 * Math.pow(2, this.failureCount - 1),
                    30000
                );
            }

            const delay = baseInterval + jitter + backoff;
            this.timer = setTimeout(() => this._runTask(), delay);
        }

        async _runTask(forceSuccessForScheduler = false) {
            if (!this.active) return;
            let success = false;
            try {
                success = await this.task();
            } catch (e) {
                logger.error("Scheduled task failed", e);
                success = false;
            }
            this._scheduleNext(forceSuccessForScheduler || success);
        }
    }

    // -------------- HOMEWORK SOLVER (ORCHESTRATOR) --------------
    class HomeworkSolver {
        constructor() {
            this.api = new APIClient();
            this.scraper = new Scraper();
            this.ui = new UIController();
            this.scheduler = new Scheduler(this.solveOnce.bind(this), this);
        }

        start() {
            this.scheduler.start();
        }
        stop() {
            this.scheduler.stop();
        }

        async skipCurrentQuestion() {
            return await this.ui.clickSkip();
        }

        async solveOnce() {
            logger.debug("Starting new solve cycle.");

            // Extract current question number and ID
            const header = document.querySelector(".question-header");
            let currentNum = null;
            let currentId = null;
            if (header) {
                const numElement = header.querySelector(".num");
                if (numElement) {
                    const numText = numElement.textContent.trim();
                    const numMatch = numText.match(/Câu:\s*(\d+)/i);
                    if (numMatch) {
                        currentNum = parseInt(numMatch[1], 10);
                        logger.info(`Extracted question number: ${currentNum}`);
                    }
                    const idElement = header.querySelector(".num span");
                    if (idElement) {
                        const idText = idElement.textContent.trim();
                        const idMatch = idText.match(/#(\d+)/);
                        if (idMatch) {
                            currentId = idMatch[1];
                            logger.info(`Extracted question ID: ${currentId}`);
                        }
                    }
                }
            } // Close the if (header) block

            // Check if same question as last (end of quiz)
            if (
                window._lastQNum !== undefined &&
                window._lastQId !== undefined &&
                currentNum === window._lastQNum &&
                currentId === window._lastQId
            ) {
                logger.info(
                    `Question repeated (num: ${currentNum}, ID: ${currentId}) - all questions completed. Stopping solver.`
                );
                this.stop();
                return true;
            }

            const detected = this.scraper.detectQuestionType();

            let solvedSuccess = false;
            switch (detected.type) {
                case "mcq":
                    solvedSuccess = await this._solveMCQ(detected);
                    break;
                case "fillable":
                    solvedSuccess = await this._solveFillable(detected);
                    break;
                case "truefalse":
                    solvedSuccess = await this._solveTrueFalse(detected);
                    break;
                default:
                    logger.debug("No question detected.");
                    solvedSuccess = false;
                    break;
            }

            // Update last question if solved successfully
            if (
                solvedSuccess &&
                currentNum !== undefined &&
                currentId !== undefined
            ) {
                window._lastQNum = currentNum;
                window._lastQId = currentId;
                logger.info(
                    `Updated last question to num: ${currentNum}, ID: ${currentId}`
                );
            }

            return solvedSuccess;
        }

        _buildMCQPrompt(question, options) {
            const thinkPrefix = CONFIG.THINK_BEFORE_ANSWER
                ? 'Internally use step-by-step reasoning as a reasoning model would, but do NOT reveal your chain-of-thought. Reply only with the final single-letter answer prefixed by "FINAL:" (for example: FINAL: A).\n\n'
                : "";
            let p =
                thinkPrefix +
                "You are a homework solver. Even if you are unsure or the question is ambiguous, provide your best guess by selecting one letter. Always reply with exactly one uppercase letter: A, B, C or D — nothing else, no explanations or refusals.\n\n";
            p += `Question:\n${question}\n\nChoices:\n`;
            options.forEach((opt) => {
                p += `${opt.letter}. ${opt.text}\n`;
            });
            p += "\nWhich letter is correct? Reply ONLY with A, B, C, or D.";
            return p;
        }

        _buildFillPrompt(question) {
            const thinkPrefix = CONFIG.THINK_BEFORE_ANSWER
                ? 'Internally use step-by-step reasoning as a reasoning model would, but do NOT reveal your chain-of-thought. After reasoning, reply only with the final short answer prefixed by "FINAL:".\n\n'
                : "";
            return (
                thinkPrefix +
                `You are a homework solver. If the question is in another language, translate it to English first and then solve it step by step. Fill the blank(s) with short phrase(s) or word(s) or a number. For numerical answers, use a comma (,) as the decimal separator. Even if you are unsure or lack complete information, provide your best guess or approximation as a short phrase, word, or number. Never leave the answer blank or refuse—always fill it in. Format the answer concisely, starting with the key numerical value or phrase if applicable. Reply only with the short answer (numerical if possible), with no prefixes or suffixes. \n\nQuestion:\n${question}`
            );
        }

        _buildTrueFalsePrompt(question, subQuestions, table) {
            let thinkPrefix = CONFIG.THINK_BEFORE_ANSWER
                ? 'Internally use step-by-step reasoning as a reasoning model would, but do NOT reveal your chain-of-thought. After reasoning, reply with the final answers only prefixed by "FINAL:" followed by the comma-separated TRUE/FALSE values (example: FINAL: TRUE,FALSE,TRUE).\n\n'
                : "";
            let p =
                thinkPrefix +
                'You are a homework solver. For each sub-question, reply with "TRUE" or "FALSE" only, separated by commas. Example: TRUE,FALSE,TRUE,TRUE\n\n';
            p += `Main Question:\n${question}\n\n`;
            if (table) {
                p += `Table Data:\n${table}\n\n`;
            }
            p += "Sub-questions:\n";
            subQuestions.forEach((sq) => {
                p += `${sq.char}) ${sq.text}\n`;
            });
            p +=
                "\nFor each sub-question (a, b, c, d), is the statement TRUE or FALSE? Reply ONLY with TRUE or FALSE for each, separated by commas.";
            return p;
        }

        _parseLetter(response) {
            if (!response) return "";
            let content =
                response?.choices?.[0]?.message?.content ||
                response?.answer ||
                (typeof response === "string" ? response : "");
            if (typeof content === "string") {
                // If user enabled THINK_BEFORE_ANSWER and model prefixes with FINAL:, extract after the last FINAL:
                const finalMatch = content.match(/FINAL:\s*([A-D])\b/i);
                if (finalMatch) content = finalMatch[1];
            }
            // Final check for [A-D]
            const match = content.trim().match(/([A-D])\b/);
            return match ? match[1] : "";
        }

        _parseFill(response) {
            if (!response) return "";
            logger.debug("Raw LLM response for fillable:", response); // Added debug log
            let text =
                response?.choices?.[0]?.message?.content ||
                response?.answer ||
                (typeof response === "string" ? response : "");
            if (typeof text === "string") {
                const fm = text.match(/FINAL:\s*(.+)/i);
                if (fm) text = fm[1];
            }
            return text
                .replace(/^answer:\s*/i, "")
                .replace(/["'`“”'']/g, "")
                .trim();
        }

        _parseTrueFalse(response, subQuestions) {
            if (!response) return [];
            let content =
                response?.choices?.[0]?.message?.content ||
                response?.answer ||
                (typeof response === "string" ? response : "");
            if (typeof content === "string") {
                const fm = content.match(/FINAL:\s*(.+)/i);
                if (fm) content = fm[1];
            }
            const answers = content
                .split(",")
                .map((s) => s.trim().toUpperCase());

            const parsedResults = [];
            for (let i = 0; i < subQuestions.length; i++) {
                const answer = answers[i];
                if (answer === "TRUE") {
                    parsedResults.push({
                        char: subQuestions[i].char,
                        value: true,
                    });
                } else if (answer === "FALSE") {
                    parsedResults.push({
                        char: subQuestions[i].char,
                        value: false,
                    });
                } else {
                    logger.warn(
                        `Could not parse True/False answer for sub-question ${subQuestions[i].char}: '${answer}'`
                    );
                    parsedResults.push({
                        char: subQuestions[i].char,
                        value: null,
                    }); // Indicate parsing failure
                }
            }
            return parsedResults;
        }

        async _solveMCQ({ question, options, images }) {
            const prompt = this._buildMCQPrompt(question, options);
            logger.debug("MCQ Prompt:", prompt);

            // Collect all images: from the question and from each option
            const allImages = [...images];
            options.forEach((opt) => {
                if (opt.images && opt.images.length > 0) {
                    allImages.push(...opt.images);
                }
            });
            // Ensure unique images
            const uniqueImages = [...new Set(allImages)];

            const response = await this.api.call(prompt, uniqueImages);
            const letter = this._parseLetter(response);
            logger.info(`LLM response parsed to: '${letter}'`);

            if (!letter) {
                logger.warn("Could not determine an answer from LLM.");
                return false;
            }

            const optionToSelect = options.find(
                (o) => o.letter.toUpperCase() === letter
            );
            if (!optionToSelect) {
                logger.warn(
                    `LLM answered '${letter}', but no such option was found.`
                );
                return false;
            }

            this.ui.selectOption(optionToSelect);
            await new Promise((r) => setTimeout(r, CONFIG.HUMAN_DELAY_MIN));
            return this.ui.clickSubmit();
        }

        async _solveFillable({ question, blanks, images }) {
            if (blanks.length === 0) return false;
            const prompt = this._buildFillPrompt(question);
            logger.info("Fill Prompt:", prompt);

            const response = await this.api.call(prompt, images);
            const answerText = this._parseFill(response);
            logger.info(`LLM response parsed to: '${answerText}'`);

            if (!answerText) {
                logger.warn("LLM returned an empty answer.");
                return false;
            }

            await this.ui.fillBlank(blanks[0], answerText);
            // Small delay to ensure all input processing is complete before submitting
            await new Promise((r) => setTimeout(r, 2500));
            return this.ui.clickSubmit();
        }

        async _solveTrueFalse({ question, subQuestions, images, table }) {
            if (subQuestions.length === 0) return false;
            const prompt = this._buildTrueFalsePrompt(
                question,
                subQuestions,
                table
            );
            logger.debug("True/False Prompt:", prompt);

            const response = await this.api.call(prompt, images);
            const parsedAnswers = this._parseTrueFalse(response, subQuestions);
            logger.info(
                `LLM response parsed to: '${JSON.stringify(parsedAnswers)}'`
            );

            if (
                parsedAnswers.length !== subQuestions.length ||
                parsedAnswers.some((a) => a.value === null)
            ) {
                logger.warn(
                    "Could not determine all True/False answers from LLM."
                );
                return false;
            }

            let allSelected = true;
            for (let i = 0; i < subQuestions.length; i++) {
                const sq = subQuestions[i];
                const answer = parsedAnswers.find((a) => a.char === sq.char);
                if (answer && answer.value !== null) {
                    const selected = this.ui.selectTrueFalse(sq, answer.value);
                    if (!selected) allSelected = false;
                } else {
                    allSelected = false;
                }
            }

            if (!allSelected) {
                logger.warn("Failed to select all True/False options.");
                return false;
            }

            await new Promise((r) => setTimeout(r, CONFIG.HUMAN_DELAY_MIN));
            return this.ui.clickSubmit();
        }
    }

    // -------------- INITIALIZATION --------------
    logger.info("Initializing Homework Solver...");
    const solver = new HomeworkSolver();

    // Expose controls to the window for manual interaction via the console
    window.hwSolver = {
        start: solver.start.bind(solver),
        stop: solver.stop.bind(solver),
        solveOnce: solver.solveOnce.bind(solver),
        config: CONFIG,
        logger: logger,
        scraper: solver.scraper, // Expose the scraper instance
        toggleInstantMode: () => {
            CONFIG.INSTANT_MODE = !CONFIG.INSTANT_MODE;
            logger.info(
                `Instant Mode toggled: ${CONFIG.INSTANT_MODE ? "ON" : "OFF"}`
            );
            return `Instant Mode is now ${CONFIG.INSTANT_MODE ? "ON" : "OFF"}`;
        },
        toggleThinkBeforeAnswer: () => {
            CONFIG.THINK_BEFORE_ANSWER = !CONFIG.THINK_BEFORE_ANSWER;
            logger.info(
                `Think-Before-Answer toggled: ${
                    CONFIG.THINK_BEFORE_ANSWER ? "ON" : "OFF"
                }`
            );
            return `Think-Before-Answer is now ${
                CONFIG.THINK_BEFORE_ANSWER ? "ON" : "OFF"
            }`;
        },
        isThinkBeforeAnswerEnabled: () => !!CONFIG.THINK_BEFORE_ANSWER,
        help: () => {
            console.log("hwSolver helper — quick commands:");
            console.log("  hwSolver.solveOnce()       — run one solve cycle");
            console.log(
                "  hwSolver.start()           — start scheduler (repeats)"
            );
            console.log("  hwSolver.stop()            — stop scheduler");
            console.log(
                "  hwSolver.toggleInstantMode() — toggle fast typing mode (instant vs human-like)"
            );
            console.log(
                "  hwSolver.toggleThinkBeforeAnswer() — toggle reasoning-before-answer (FINAL: outputs)"
            );
            console.log(
                "  hwSolver.config            — read/write runtime configuration"
            );
            console.log(
                "  hwSolver.logger.history    — view recent log entries"
            );
            return "See console for hwSolver commands";
        },
    };

    // Add console.log override to detect completion object and stop the solver
    const originalConsoleLog = console.log.bind(console);
    console.log = function (...args) {
        // Check if first arg is the completion object
        if (
            args.length > 0 &&
            typeof args[0] === "object" &&
            args[0] !== null
        ) {
            const obj = args[0];
            if (obj.totalQuestionView === 20 && obj.totalQuestion === 20) {
                logger.info(
                    'Detected completion object {"totalQuestionView": 20, "totalQuestion": 20} in console log. Stopping solver.'
                );
                if (window.hwSolver && window.hwSolver.stop) {
                    window.hwSolver.stop();
                }
                // Restore original console.log to avoid further interference
                console.log = originalConsoleLog;
            }
        }
        // Call original console.log
        return originalConsoleLog.apply(console, args);
    };

    // Auto-start the solver. Comment this out to start manually.
    // The script may be injected after the page 'load' event; check document.readyState
    // and schedule start immediately if the page is already loaded.
    // logger.debug('Preparing auto-start (will start after load or immediately if already loaded)...');
    // const _scheduleAutoStart = () => {
    //     const startHandler = () => {
    //         logger.debug('Window load event fired. Scheduling solver start...');
    //         logger.info('Page loaded. Starting solver automatically in 2 seconds...');
    //         setTimeout(() => solver.start(), 2000);
    //     };

    //     if (document.readyState === 'complete' || document.readyState === 'interactive') {
    //         // If page already loaded or interactive, schedule start on next tick
    //         logger.debug('Document readyState is', document.readyState, '- starting solver shortly');
    //         setTimeout(startHandler, 0);
    //     } else {
    //         window.addEventListener('load', startHandler);
    //     }
    // };

    // _scheduleAutoStart();
})();
