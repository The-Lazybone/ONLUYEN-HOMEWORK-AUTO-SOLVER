// === Intelligent AI Homework Solver Core ===

(function () {
    "use strict";

    // -------------- CONFIGURATION --------------
    const CONFIG = {
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

    // -------------- WEB SEARCH CLASS --------------
    class WebSearch {
        async search(query) {
            try {
                const response = await fetch(
                    `https://api.duckduckgo.com/?q=${encodeURIComponent(
                        query,
                    )}&format=json&no_html=1&skip_disambig=1`,
                );
                const data = await response.json();
                // Return the most relevant result
                return (
                    data.AbstractText ||
                    data.Answer ||
                    data.RelatedTopics?.[0]?.Text ||
                    data.Definition ||
                    "No relevant results found."
                );
            } catch (error) {
                logger.debug("Web search failed:", error);
                return "Search unavailable.";
            }
        }

        shouldSearch(question) {
            // Simple heuristic: search if question contains historical/factual keywords
            const keywords = [
                "history",
                "date",
                "year",
                "resolution",
                "document",
                "event",
                "period",
                "war",
                "battle",
            ];
            return keywords.some((keyword) =>
                question.toLowerCase().includes(keyword),
            );
        }
    }

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
                `Using model: ${modelToUse} for prompt with ${images.length} images.`,
            );

            const tools = []; // Disable web_search for now

            const payload = {
                model: modelToUse,
                reasoning_effort: CONFIG.THINK_BEFORE_ANSWER
                    ? "high"
                    : CONFIG.INSTANT_MODE
                        ? "low"
                        : "medium",
                messages: [
                    {
                        role: "system",
                        content:
                            "You are a precise assistant. Use the web_search tool when you need external information to answer accurately. Reply exactly as asked.",
                    },
                    { role: "user", content: userContent },
                ],
                max_tokens: CONFIG.THINK_BEFORE_ANSWER ? 65535 : 64,
                temperature: 1, // Changed to 1 as required by the model
                tools: tools,
                tool_choice: "auto",
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
                    e,
                );
            }

            const headers = { "Content-Type": "application/json" };
            if (CONFIG.POLL_KEY)
                headers["Authorization"] = `Bearer ${CONFIG.POLL_KEY}`;

            const controller = new AbortController();
            const timeoutId = setTimeout(
                () => controller.abort(),
                CONFIG.PROXY_TIMEOUT_MS,
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
            return (s || "")
                .replace(/[ \t]+/g, " ") // Collapse horizontal whitespace
                .replace(/[\r\n]+/g, "\n") // Collapse vertical whitespace
                .trim();
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
                document.querySelectorAll(
                    ".question-name, #step, app-question-short-answer, .question.fade-indown, .test-school-question-option, app-question-true-false-test, app-test-school-question-option",
                ),
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
                    logger.debug(
                        "Original MathJax assistive-mml (fallback):",
                        mathContent,
                    );
                }

                if (mathContent) {
                    // Wrap raw MathJax content in special markers for the LLM
                    mjx.replaceWith(
                        document.createTextNode(
                            ` [MATHJAX]${mathContent}[/MATHJAX] `,
                        ),
                    );
                } else {
                    mjx.remove(); // Remove if no relevant content found
                }
            });

            // Fix: innerText on detached nodes can fail to include some text.
            // Temporarily append to DOM (off-screen) to ensure layout-dependent text extraction works.
            const wrapper = document.createElement("div");
            wrapper.style.position = "absolute";
            wrapper.style.left = "-9999px";
            wrapper.style.top = "-9999px";
            wrapper.appendChild(clone);
            document.body.appendChild(wrapper);

            const text = this._normalize(clone.innerText);

            document.body.removeChild(wrapper);
            return text;
        }

        _scrapeImages(container) {
            if (!container) return [];
            return Array.from(container.querySelectorAll("img"))
                .map((img) => {
                    // Only scrape if the image is actually loaded and visible
                    if (img.complete && img.naturalWidth > 0) {
                        return img.src;
                    }
                    return null;
                })
                .filter((src) => src !== null);
        }

        _scrapeTable(container) {
            if (!container) return null;
            const table = container.querySelector(".table-material-question");
            return table ? table.outerHTML : null;
        }

        _checkIsSolvedFromGrid() {
            const active = document.querySelector(
                ".answer-sheet .option.active, .mobile-bottom-bar .number.active",
            );
            return active ? active.classList.contains("done") : null;
        }

        isAssignmentFinished() {
            const indicators = Array.from(
                document.querySelectorAll(
                    ".answer-sheet .option, .mobile-bottom-bar .number",
                ),
            );
            if (indicators.length === 0) return false;

            const allDone = indicators.every((el) =>
                el.classList.contains("done"),
            );
            if (allDone) {
                logger.info(
                    `Assignment completion detected via grid check (${indicators.length} questions).`,
                );
            }
            return allDone;
        }

        detectQuestionType(includeSolved = false) {
            const gridSolved = this._checkIsSolvedFromGrid();
            const containers = this._getQuestionContainers();

            for (const container of containers) {
                // Skip containers already marked as done
                if (!includeSolved && container.classList.contains("done")) {
                    continue;
                }

                logger.debug(
                    "Detecting in container with class:",
                    container.className || container.tagName,
                );

                // Determine if this specific question is solved.
                // We trust the grid if it exists, otherwise we fallback to internal scraping.

                // 1. Try Short Answer
                const short = this.scrapeShortAnswer(container);
                const isShortSolved =
                    gridSolved !== null ? gridSolved : short.isSolved;
                if (short.blanks.length && (includeSolved || !isShortSolved)) {
                    return { ...short, isSolved: isShortSolved };
                }

                // 2. Try MCQ
                const mcq = this.scrapeMCQ(container);
                const isMcqSolved =
                    gridSolved !== null ? gridSolved : mcq.isSolved;
                if (mcq.options.length && (includeSolved || !isMcqSolved)) {
                    return { ...mcq, isSolved: isMcqSolved };
                }

                // 3. Try Fillable
                const fill = this.scrapeFillable(container);
                const isFillSolved =
                    gridSolved !== null ? gridSolved : fill.isSolved;
                if (fill.blanks.length && (includeSolved || !isFillSolved)) {
                    return { ...fill, isSolved: isFillSolved };
                }

                // 4. Try True/False
                const tf = this.scrapeTrueFalse(container);
                const isTfSolved =
                    gridSolved !== null ? gridSolved : tf.isSolved;
                if (tf.subQuestions.length && (includeSolved || !isTfSolved)) {
                    return { ...tf, isSolved: isTfSolved };
                }
            }
            return { type: "unknown" };
        }

        scrapeMCQ(container) {
            if (!container)
                return { type: "mcq", question: "", options: [], images: [] };

            let questionParts = [];

            // 1. Look for explicit header/content blocks
            const headerNode = container.querySelector(".question-text");
            if (headerNode) {
                const headerText = this._getCleanedText(headerNode);
                if (headerText) questionParts.push(headerText);
            }

            const nameNode = container.querySelector(".question-name");
            if (nameNode) {
                const nameText = this._getCleanedText(nameNode);
                if (nameText) questionParts.push(nameText);
            }

            // 2. Look for .title (e.g. "Blank numbered (1)")
            const titleNode = container.querySelector(".title");
            if (titleNode) {
                const titleText = this._getCleanedText(titleNode);
                if (
                    titleText &&
                    !questionParts.some((p) => p.includes(titleText))
                ) {
                    questionParts.push(titleText);
                }
            }

            // 3. Fallback if no specific nodes found
            if (questionParts.length === 0) {
                const qNode = container.querySelector(".fadein") || container;
                questionParts.push(this._getCleanedText(qNode));
            }

            // Unique and trim
            const questionText = [...new Set(questionParts)]
                .join("\n\n")
                .trim();
            logger.debug("scrapeMCQ: questionText:", questionText);

            // Images from both main text areas
            const images = [
                ...this._scrapeImages(
                    container.querySelector(".question-text"),
                ),
                ...this._scrapeImages(
                    container.querySelector(".question-name"),
                ),
            ];

            const nodes = Array.from(
                container.querySelectorAll(
                    ".question-option, .select-item, .item-answer",
                ),
            );

            let isSolved = false;
            const options = nodes
                .map((node) => {
                    let letter, text, contentNode;
                    const isSelected =
                        node.classList.contains("selected") ||
                        node.classList.contains("active") ||
                        node.classList.contains("highlighed") || // Misspelling on site
                        node.classList.contains("highlighted") ||
                        node.querySelector(".text-answered") !== null;
                    if (isSelected) isSolved = true;
                    if (node.matches(".question-option")) {
                        // Legacy format
                        logger.debug("Processing legacy MCQ option format.");
                        letter =
                            node
                                .querySelector(".question-option-label")
                                ?.innerText.trim() || null;
                        contentNode = node.querySelector(
                            ".question-option-content",
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

            return {
                type: "mcq",
                question: questionText,
                options,
                images,
                isSolved,
                container,
            };
        }

        scrapeShortAnswer(container) {
            if (
                !container ||
                !container.querySelector(
                    "app-question-short-answer, .content-question",
                )
            ) {
                return {
                    type: "shortanswer",
                    question: "",
                    blanks: [],
                    images: [],
                    isSolved: false,
                };
            }

            const inputs = Array.from(
                container.querySelectorAll("input[type='text'], textarea"),
            );
            const isSolved =
                inputs.length > 0 &&
                inputs.every((input) => input.value.trim().length > 0);
            const blanks = inputs.map((el, i) => ({ index: i, element: el }));

            const questionParts = [];

            const headerNode = container.querySelector(
                ".question-header, .quetion-number",
            );
            if (headerNode)
                questionParts.push(this._getCleanedText(headerNode));

            const contentNode = container.querySelector(
                ".content-question, .content",
            );
            if (contentNode) {
                // Short answer usually doesn't need [BLANK] replacement in the body
                // because the input is usually separate in the .answer div
                questionParts.push(this._getCleanedText(contentNode));
            }

            const questionText = [...new Set(questionParts)]
                .join("\n\n")
                .trim();
            const images = [
                ...this._scrapeImages(
                    container.querySelector(".content-question"),
                ),
                ...this._scrapeImages(container.querySelector(".content")),
            ];

            return {
                type: "shortanswer",
                question: questionText,
                blanks,
                images,
                isSolved,
                container,
            };
        }

        scrapeFillable(container) {
            if (!container)
                return {
                    type: "fillable",
                    question: "",
                    blanks: [],
                    images: [],
                    isSolved: false,
                };

            const inputs = Array.from(
                container.querySelectorAll("input[type='text'], textarea"),
            );
            // For classic fillable, the inputs are inside the question text.
            // If we found them via Short Answer first, this method shouldn't be main.
            if (container.querySelector("app-question-short-answer"))
                return { type: "fillable", blanks: [], isSolved: false };

            const isSolved =
                inputs.length > 0 &&
                inputs.every((input) => input.value.trim().length > 0);
            const blanks = inputs.map((el, i) => ({ index: i, element: el }));

            const qNode =
                container.querySelector(".fadein") ||
                container.querySelector(".question-text") ||
                container;
            let questionText = "";
            if (qNode) {
                const clone = qNode.cloneNode(true);
                clone
                    .querySelectorAll("input[type='text'], textarea")
                    .forEach((el) => {
                        const parent = el.parentNode;
                        parent.querySelector(".ans-span-second")?.remove();
                        parent.replaceChild(
                            document.createTextNode(" [BLANK] "),
                            el,
                        );
                    });
                questionText = this._getCleanedText(clone);
            }

            const images = this._scrapeImages(qNode);

            return {
                type: "fillable",
                question: questionText,
                blanks,
                images,
                isSolved,
                container,
            };
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
                container.querySelectorAll(
                    ".question-child .child-content, .option.ng-star-inserted",
                ),
            );
            const subQuestions = subQuestionNodes
                .map((node) => {
                    // Classic structure (inputs)
                    const trueInput = node.querySelector('input[value="true"]');
                    const falseInput = node.querySelector(
                        'input[value="false"]',
                    );

                    // New "Test" structure (divs)
                    const itemAnswers = Array.from(
                        node.querySelectorAll(".item-answer"),
                    );
                    const trueDiv = itemAnswers.find((el) =>
                        el.innerText.includes("Đúng"),
                    );
                    const falseDiv = itemAnswers.find((el) =>
                        el.innerText.includes("Sai"),
                    );

                    const trueElement = trueInput || trueDiv;
                    const falseElement = falseInput || falseDiv;

                    const isAnswered =
                        (trueInput && trueInput.checked) ||
                        (falseInput && falseInput.checked) ||
                        (trueDiv &&
                            (trueDiv.classList.contains("active-answer") ||
                                trueDiv.classList.contains("selected"))) ||
                        (falseDiv &&
                            (falseDiv.classList.contains("active-answer") ||
                                falseDiv.classList.contains("selected")));

                    return {
                        char:
                            node
                                .querySelector(".option-char")
                                ?.innerText.trim()
                                .replace(")", "")
                                .replace(".", "") ||
                            node
                                .querySelector(".item-option")
                                ?.innerText.trim()
                                .replace(")", "")
                                .replace(".", "") ||
                            null,
                        text: this._getCleanedText(
                            node.querySelector(".fadein, .option-content"),
                        ),
                        trueElement,
                        falseElement,
                        isAnswered,
                        element: node, // Store the node for marking as done
                    };
                })
                .filter((sq) => sq.char || sq.text);

            const isSolved =
                subQuestions.length > 0 &&
                subQuestions.every((sq) => sq.isAnswered);

            return {
                type: "truefalse",
                question: questionText,
                subQuestions,
                images,
                table,
                isSolved,
                container,
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
                new MouseEvent("mouseover", { bubbles: true, composed: true }),
            );
            element.dispatchEvent(
                new MouseEvent("mouseenter", { bubbles: true, composed: true }),
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

                // Add delay between characters (except after last char)
                if (i < text.length - 1) {
                    await new Promise((r) =>
                        setTimeout(
                            r,
                            minDelay + Math.random() * (maxDelay - minDelay),
                        ),
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
                        "Failed to set input value via typing simulation.",
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
                    `True/False element not found for sub-question ${subQuestion.char} with value ${value}.`,
                );
                return false;
            }
            this._simulateClick(targetElement);

            if (targetElement.tagName === "INPUT") {
                targetElement.checked = true;
                targetElement.dispatchEvent(
                    new Event("change", { bubbles: true }),
                );
            } else {
                targetElement.classList.add("active-answer");
                targetElement.dispatchEvent(
                    new Event("click", { bubbles: true }),
                );
            }

            logger.debug(
                `Selected ${value ? "True" : "False"} for sub-question ${subQuestion.char || ""
                }`,
            );
            return true;
        }

        async clickSubmit() {
            const candidates = Array.from(
                document.querySelectorAll(
                    'button, input[type="button"], input[type="submit"]',
                ),
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
            await new Promise((r) => setTimeout(r, 800)); // Delay for UI change

            const postText = (
                submitButton.innerText ||
                submitButton.value ||
                ""
            ).trim();
            logger.debug(`Post-submit button text: "${postText}"`);

            // Removed "Kết thúc" button check as per user request.
            // The question ID/number check will handle the end of the quiz.

            logger.debug("Post-submit action completed.");
            return true; // Indicate successful submission
        }

        async clickSkip() {
            const candidates = Array.from(
                document.querySelectorAll(
                    'button, input[type="button"], input[type="submit"]',
                ),
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
            logger.debug(`Post-skip button text: "${postSkipText}"`);

            // Removed "Kết thúc" button check as per user request.
            // The question ID/number check will handle the end of the quiz.

            logger.debug("Post-skip action completed.");
            return true;
        }

        clearAllAnswers() {
            logger.info("Clearing all answers on page...");
            // Clear text inputs and textareas
            document
                .querySelectorAll("input[type='text'], textarea")
                .forEach((el) => {
                    if (el.closest("#hw-solver-overlay")) return;
                    el.value = "";
                    el.dispatchEvent(new Event("input", { bubbles: true }));
                    el.dispatchEvent(new Event("change", { bubbles: true }));
                });

            // Clear radio buttons and checkboxes
            document
                .querySelectorAll("input[type='radio'], input[type='checkbox']")
                .forEach((el) => {
                    if (el.closest("#hw-solver-overlay")) return;
                    el.checked = false;
                    el.dispatchEvent(new Event("change", { bubbles: true }));
                });

            // Clear custom div-based active answers (MCQ/True/False)
            const classesToRemove = [
                "active-answer",
                "selected",
                "done",
                "highlighed",
                "highlighted",
                "active",
                "checked",
                "active-answer-item",
            ];

            document
                .querySelectorAll(
                    classesToRemove.map((c) => `.${c}`).join(", "),
                )
                .forEach((el) => {
                    if (el.closest("#hw-solver-overlay")) return;
                    el.classList.remove(...classesToRemove);
                });

            // Reset sidebar/bottom-bar grid indicators (done class)
            document
                .querySelectorAll(
                    ".answer-sheet .option, .mobile-bottom-bar .number",
                )
                .forEach((el) => el.classList.remove("done"));

            // Purge persistent visual indicators (like "Your answer" labels)
            document
                .querySelectorAll(".text-answered, .answer-label-checked")
                .forEach((el) => el.remove());

            // Reset question tracking so it can re-solve from the beginning
            window._lastQNum = -1;
            window._lastQId = -1;

            logger.info("All answers cleared and tracking reset.");
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
            this.idleCount = 0;
        }

        start() {
            if (this.active) return;
            this.active = true;
            this.failureCount = 0;
            this.idleCount = 0;
            logger.info("Scheduler started.");
            this._runTask(false); // Start with includeSolved=false to advance
        }

        stop() {
            if (!this.active) return;
            this.active = false;
            if (this.timer) {
                clearTimeout(this.timer);
                this.timer = null;
            }
            logger.info("Scheduler stopped.");
        }

        _scheduleNext(isSuccess) {
            if (!this.active) return;

            const delay = isSuccess
                ? CONFIG.LOOP_INTERVAL_MS
                : CONFIG.LOOP_INTERVAL_MS / 2;

            this.timer = setTimeout(() => this._runTask(false), delay);
        }

        async _runTask(includeSolved = false) {
            if (!this.active) return;

            try {
                const result = await this.task(includeSolved);
                if (result === "FINISHED") {
                    logger.info("Scheduler: Task reported FINISHED. Stopping.");
                    this.stop();
                    this.solver.overlay.updateStatus("Finished", "#27ae60");
                    return;
                }

                if (result === "NO_QUESTION") {
                    // No question detected (but assignment not fully "finished" by grid check)
                    this.idleCount++;

                    // Do NOT increment failureCount (it's not a failure to solve, just nothing to do)

                    if (this.idleCount >= CONFIG.IDLE_THRESHOLD) {
                        logger.warn(
                            `Scheduler: Idle for ${this.idleCount} cycles. Stopping due to inactivity (skipped questions?).`,
                        );
                        this.stop();
                        this.solver.overlay.updateStatus(
                            "Finished (Timeout)",
                            "#27ae60",
                        );
                        return;
                    }
                    this._scheduleNext(false);
                    return;
                }

                if (result === true) {
                    this.failureCount = 0;
                    this.idleCount = 0;
                    this._scheduleNext(true);
                } else {
                    // Result is false -> Attempted to solve but FAILED
                    this.failureCount++;
                    this.idleCount = 0; // We found a question, so we are not idle. Reset idle count.

                    if (this.failureCount >= CONFIG.RETRIES) {
                        logger.warn(`Max retries reached. Skipping question.`);
                        await this.solver.skipCurrentQuestion();
                        this.failureCount = 0;
                        this._scheduleNext(true);
                    } else {
                        this._scheduleNext(false);
                    }
                }
            } catch (e) {
                logger.error("Scheduled task execution failed:", e);
                this._scheduleNext(false);
            }
        }
    }

    // -------------- BASIC UI CLASS --------------
    class BasicUI {
        constructor(solver) {
            this.solver = solver;
            this.container = null;
            this.statusEl = null;
            this.isMinimized = false;
            this.init();
        }

        init() {
            if (!document.body) {
                logger.debug(
                    "Document body not ready, waiting for load to init UI...",
                );
                window.addEventListener("DOMContentLoaded", () => this.init());
                return;
            }

            // Persistence check: If everything is there, do nothing.
            if (
                document.getElementById("hw-solver-overlay") &&
                document.getElementById("hw-solver-styles")
            ) {
                return;
            }

            // Cleanup partial remains before re-injection
            const existingOverlay =
                document.getElementById("hw-solver-overlay");
            if (existingOverlay) existingOverlay.remove();

            const existingStyles = document.getElementById("hw-solver-styles");
            if (existingStyles) existingStyles.remove();

            const styles = `
                    #hw-solver-overlay {
                        position: fixed;
                        bottom: 20px;
                        right: 20px;
                        width: 200px;
                        background: #2c3e50;
                        color: white;
                        border-radius: 8px;
                        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        z-index: 999999;
                        overflow: hidden;
                        transition: all 0.3s ease;
                    }
                    #hw-solver-header {
                        padding: 10px;
                        background: #34495e;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        cursor: pointer;
                        user-select: none;
                    }
                    #hw-solver-status {
                        font-size: 14px;
                        font-weight: bold;
                        margin-bottom: 5px;
                        color: #ecf0f1;
                    }
                    .hw-input-group {
                        display: flex;
                        flex-direction: column;
                        gap: 5px;
                        margin-bottom: 5px;
                    }
                    .hw-input-group label {
                        font-size: 11px;
                        color: #bdc3c7;
                    }
                    .hw-key-input {
                        padding: 6px;
                        border: 1px solid #34495e;
                        border-radius: 4px;
                        background: #3d566e;
                        color: white;
                        font-size: 12px;
                    }
                    .hw-btn {
                        padding: 8px;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-weight: bold;
                        transition: background 0.2s;
                        color: white;
                        margin-bottom: 5px;
                    }
                    .hw-btn-start { background: #27ae60; }
                    .hw-btn-start:hover { background: #2ecc71; }
                    .hw-btn-once { background: #2980b9; }
                    .hw-btn-once:hover { background: #3498db; }
                    .hw-btn-stop { background: #c0392b; }
                    .hw-btn-stop:hover { background: #e74c3c; }
                    .hw-btn-clear { background: #7f8c8d; }
                    .hw-btn-clear:hover { background: #95a5a6; }
                    #hw-solver-toggle {
                        font-size: 12px;
                    }
                    #hw-tab-bar {
                        display: flex;
                        background: #34495e;
                        border-bottom: 1px solid #2c3e50;
                    }
                    .hw-tab {
                        flex: 1;
                        padding: 8px;
                        text-align: center;
                        font-size: 11px;
                        cursor: pointer;
                        color: #bdc3c7;
                        transition: all 0.2s;
                    }
                    .hw-tab.active {
                        color: white;
                        background: #2c3e50;
                        border-bottom: 2px solid #3498db;
                    }
                    .hw-tab-content {
                        padding: 15px;
                        display: none;
                        flex-direction: column;
                        gap: 10px;
                        max-height: 300px;
                        overflow-y: auto;
                    }
                    .hw-tab-content.active {
                        display: flex;
                    }
                    .hw-checkbox-group {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-size: 12px;
                        color: #ecf0f1;
                        cursor: pointer;
                        margin-top: 5px;
                    }
                    .hw-checkbox-group input {
                        cursor: pointer;
                    }
                    .hw-footer {
                        padding: 8px;
                        background: #34495e;
                        text-align: center;
                        font-size: 10px;
                        color: #bdc3c7;
                        border-top: 1px solid #2c3e50;
                    }
                    .hw-footer a {
                        color: #3498db;
                        text-decoration: none;
                    }
                    .hw-footer a:hover {
                        text-decoration: underline;
                    }
                    .minimized {
                        height: 40px !important;
                        width: 120px !important;
                    }
                    .minimized #hw-tab-bar, .minimized .hw-tab-content, .minimized .hw-footer {
                        display: none !important;
                    }
                `;

            const styleSheet = document.createElement("style");
            styleSheet.id = "hw-solver-styles";
            styleSheet.innerText = styles;
            document.head.appendChild(styleSheet);

            this.container = document.createElement("div");
            this.container.id = "hw-solver-overlay";
            this.container.innerHTML = `
                    <div id="hw-solver-header">
                        <span>AI Solver</span>
                        <span id="hw-solver-toggle">▼</span>
                    </div>
                    <div id="hw-tab-bar">
                        <div class="hw-tab active" data-tab="solver">Solver</div>
                        <div class="hw-tab" data-tab="settings">Settings</div>
                    </div>
                    <div id="hw-solver-content" class="hw-tab-content active">
                        <div id="hw-solver-status">Status: Ready</div>
                        <button class="hw-btn hw-btn-start" id="hw-start-btn">Start Auto</button>
                        <button class="hw-btn hw-btn-once" id="hw-once-btn">Solve Once</button>
                        <button class="hw-btn hw-btn-stop" id="hw-stop-btn">Stop</button>
                        <button class="hw-btn hw-btn-clear" id="hw-clear-btn">Clear All</button>
                    </div>
                    <div id="hw-settings-content" class="hw-tab-content">
                        <div class="hw-input-group">
                            <label>API Key</label>
                            <input type="password" class="hw-key-input hw-config-input" data-key="POLL_KEY" id="hw-api-key" placeholder="Enter key..." value="${CONFIG.POLL_KEY
                }">
                        </div>
                        <div class="hw-input-group">
                            <label>Endpoint</label>
                            <input type="text" class="hw-key-input hw-config-input" data-key="PROXY_URL" placeholder="https://..." value="${CONFIG.PROXY_URL
                }">
                        </div>
                        <div class="hw-input-group">
                            <label>Text Model</label>
                            <input type="text" class="hw-key-input hw-config-input" data-key="DEFAULT_MODEL" value="${CONFIG.DEFAULT_MODEL
                }">
                        </div>
                        <div class="hw-input-group">
                            <label>Vision Model</label>
                             <input type="text" class="hw-key-input hw-config-input" data-key="VISION_MODEL" value="${CONFIG.VISION_MODEL
                }">
                         </div>
                         <div class="hw-input-group">
                             <label>Idle Threshold (Cycles)</label>
                             <input type="number" class="hw-key-input hw-config-input" data-key="IDLE_THRESHOLD" placeholder="10" value="${CONFIG.IDLE_THRESHOLD
                }">
                         </div>
                         <div class="hw-checkbox-group">
                            <input type="checkbox" class="hw-config-check" data-key="INSTANT_MODE" id="hw-instant-check" ${CONFIG.INSTANT_MODE ? "checked" : ""
                }>
                            <label for="hw-instant-check">Instant Mode</label>
                        </div>
                        <div class="hw-checkbox-group">
                            <input type="checkbox" class="hw-config-check" data-key="THINK_BEFORE_ANSWER" id="hw-think-check" ${CONFIG.THINK_BEFORE_ANSWER ? "checked" : ""
                }>
                            <label for="hw-think-check">Reasoning</label>
                        </div>
                    </div>
                    <div class="hw-footer">
                        Powered by <a href="https://pollinations.ai" target="_blank">Pollinations.ai</a>
                    </div>
                `;

            if (!document.getElementById("hw-solver-overlay")) {
                document.body.appendChild(this.container);
            }

            this.statusEl = this.container.querySelector("#hw-solver-status");

            // Tab Switching Logic
            this.container.querySelectorAll(".hw-tab").forEach((tab) => {
                tab.onclick = () => {
                    this.container
                        .querySelectorAll(".hw-tab")
                        .forEach((t) => t.classList.remove("active"));
                    this.container
                        .querySelectorAll(".hw-tab-content")
                        .forEach((c) => c.classList.remove("active"));
                    tab.classList.add("active");
                    this.container
                        .querySelector(`#hw-${tab.dataset.tab}-content`)
                        .classList.add("active");
                };
            });

            this.container.querySelector("#hw-solver-header").onclick = () =>
                this.toggleMinimize();
            this.container.querySelector("#hw-start-btn").onclick = () =>
                this.solver.start();
            this.container.querySelector("#hw-once-btn").onclick = () =>
                this.solver.solveOnce();
            this.container.querySelector("#hw-stop-btn").onclick = () =>
                this.solver.stop();
            this.container.querySelector("#hw-clear-btn").onclick = () =>
                this.solver.clearAnswers();

            // Config Auto-Save Logic
            this.container
                .querySelectorAll(".hw-config-input")
                .forEach((input) => {
                    input.onchange = (e) => {
                        const key = input.dataset.key;
                        let value = e.target.value.trim();
                        if (key === "IDLE_THRESHOLD") {
                            value = parseInt(value, 10) || 10;
                            e.target.value = value;
                        }
                        CONFIG[key] = value;
                        const storageKey =
                            key === "POLL_KEY"
                                ? "HW_SOLVER_API_KEY"
                                : `HW_SOLVER_${key}`;
                        localStorage.setItem(storageKey, value);
                        logger.info(`${key} updated and saved.`);
                        this.updateStatus("Settings Saved", "#2ecc71");
                        setTimeout(() => this.updateStatus("Ready"), 2000);
                    };
                });

            this.container
                .querySelectorAll(".hw-config-check")
                .forEach((check) => {
                    check.onchange = (e) => {
                        const key = check.dataset.key;
                        const value = e.target.checked;
                        CONFIG[key] = value;
                        localStorage.setItem(`HW_SOLVER_${key}`, value);
                        logger.info(`${key} toggled: ${value}`);
                        this.updateStatus("Settings Saved", "#2ecc71");
                        setTimeout(() => this.updateStatus("Ready"), 2000);
                    };
                });
        }

        updateStatus(text, color = "#ecf0f1") {
            if (this.statusEl) {
                this.statusEl.innerText = `Status: ${text}`;
                this.statusEl.style.color = color;
            }
        }

        toggleMinimize() {
            this.isMinimized = !this.isMinimized;
            const content = this.container.querySelector("#hw-solver-content");
            const toggle = this.container.querySelector("#hw-solver-toggle");
            if (this.isMinimized) {
                this.container.classList.add("minimized");
                content.style.display = "none";
                toggle.innerText = "▲";
            } else {
                this.container.classList.remove("minimized");
                content.style.display = "flex";
                toggle.innerText = "▼";
            }
        }
    }

    // -------------- HOMEWORK SOLVER (ORCHESTRATOR) --------------
    class HomeworkSolver {
        constructor() {
            this.api = new APIClient();
            this.scraper = new Scraper();
            this.ui = new UIController();
            this.webSearch = new WebSearch();
            this.scheduler = new Scheduler(this.solveOnce.bind(this), this);
            this.lastApiResponse = null;
            this.overlay = new BasicUI(this);
        }

        start() {
            this.scheduler.start();
            this.overlay.updateStatus("Running", "#27ae60");
        }
        stop() {
            this.scheduler.stop();
            this.overlay.updateStatus("Stopped", "#c0392b");
        }

        async skipCurrentQuestion() {
            // Ensure we don't leave it marked as "done" if we are skipping it
            const activeGridItem = document.querySelector(
                ".answer-sheet .option.active, .mobile-bottom-bar .number.active",
            );
            if (activeGridItem) activeGridItem.classList.remove("done");

            const containers = this.scraper._getQuestionContainers();
            containers.forEach((c) => c.classList.remove("done"));

            return await this.ui.clickSkip();
        }

        clearAnswers() {
            this.ui.clearAllAnswers();
            window._lastQNum = -1;
            window._lastQId = -1;
            this.overlay.updateStatus("Cleared", "#f39c12");
            setTimeout(() => this.overlay.updateStatus("Ready"), 2000);
        }

        async solveOnce(includeSolved = true) {
            this.overlay.updateStatus("Detecting...", "#3498db");
            logger.debug("Starting new solve cycle.");

            // solveOnce defaults to manual mode (includeSolved=true)
            // But scheduler calls it with includeSolved=false to advance.
            const detected = this.scraper.detectQuestionType(includeSolved);
            if (detected.type === "unknown") {
                // If no question is found, check if it's because the whole assignment is finished
                if (!includeSolved && this.scraper.isAssignmentFinished()) {
                    return "FINISHED";
                }

                logger.info("No questions detected.");
                this.overlay.updateStatus("No Questions", "#e74c3c");
                return "NO_QUESTION";
            }

            // For Manual solveOnce, we ignore the isSolved flag because the user
            // explicitly asked us to solve whatever is in front of them.
            // We only keep the flag for automatic scheduler loops.

            // Extract metadata from this specific container
            const container = detected.container || document;
            const header = container.querySelector(
                ".question-header, .quetion-number, .num",
            );

            let currentNum = null;
            let currentId = container.id || null;

            if (header) {
                const text = header.innerText.trim();
                // Match formats: "Câu 1:", "Câu: 1", etc.
                const numMatch = text.match(/Câu:?\s*(\d+)/i);
                if (numMatch) currentNum = parseInt(numMatch[1], 10);

                const idElement = header.querySelector("span, .num span");
                if (idElement) {
                    const idMatch = idElement.innerText.match(/#(\d+)/);
                    if (idMatch) currentId = idMatch[1];
                }
            }

            logger.info(
                `Solving ${detected.type.toUpperCase()} - Num: ${currentNum}, ID: ${currentId}`,
            );

            let solvedSuccess = false;
            switch (detected.type) {
                case "shortanswer":
                    solvedSuccess = await this._solveShortAnswer(detected);
                    break;
                case "mcq":
                    solvedSuccess = await this._solveMCQ(detected);
                    break;
                case "fillable":
                    solvedSuccess = await this._solveFillable(detected);
                    break;
                case "truefalse":
                    solvedSuccess = await this._solveTrueFalse(detected);
                    break;
            }

            if (solvedSuccess) {
                window._lastQNum = currentNum;
                window._lastQId = currentId;
            }

            return solvedSuccess;
        }

        _buildMCQPrompt(question, options, searchResult = "") {
            const thinkPrefix = CONFIG.THINK_BEFORE_ANSWER
                ? 'Internally use step-by-step reasoning as a reasoning model would, but do NOT reveal your chain-of-thought. Reply only with the final single-letter answer prefixed by "FINAL:" (for example: FINAL: A).\n\n'
                : "";
            let p =
                thinkPrefix +
                "You are a homework solver. Mathematical formulas and symbols are enclosed in [MATHJAX]...[/MATHJAX] tags. Interpret the content within these tags as mathematical expressions. Even if you are unsure or the question is ambiguous, provide your best guess by selecting one letter. Always reply with exactly one uppercase letter: A, B, C or D — nothing else, no explanations or refusals.\n\n";
            p += `Question:\n${question}\n\n`;
            if (searchResult) {
                p += `Web Search Results:\n${searchResult}\n\n`;
            }
            p += `Choices:\n`;
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
                `You are a homework solver. Mathematical formulas and symbols are enclosed in [MATHJAX]...[/MATHJAX] tags. Interpret the content within these tags as mathematical expressions. If the question is in another language, translate it to English first and then solve it step by step. Fill the blank(s) with short phrase(s) or word(s) or a number. For numerical answers, use a comma (,) as the decimal separator. Even if you are unsure or lack complete information, provide your best guess or approximation as a short phrase, word, or number. Never leave the answer blank or refuse—always fill it in. Format the answer concisely, starting with the key numerical value or phrase if applicable. Reply only with the short answer (numerical if possible), with no prefixes or suffixes. \n\nQuestion:\n${question}`
            );
        }

        _buildShortAnswerPrompt(question) {
            const thinkPrefix = CONFIG.THINK_BEFORE_ANSWER
                ? 'Internally use step-by-step reasoning as a reasoning model would, but do NOT reveal your chain-of-thought. After reasoning, reply only with the final short answer prefixed by "FINAL:".\n\n'
                : "";
            return (
                thinkPrefix +
                `You are a homework solver. Mathematical formulas and symbols are enclosed in [MATHJAX]...[/MATHJAX] tags. Interpret these as mathematical expressions. If the question is in another language, translate to English first. Solve the following question with a single concise answer. \n\nCRITICAL NUMERIC RULES:\n- For decimal numbers, use EXACTLY ONE comma (,) as the decimal separator (e.g., 12,5).\n- For whole numbers, provide the number only (e.g., 25).\n- If the question asks you to choose multiple numeric options and combine them, concatenate the numbers into a single integer without spaces (e.g., choosing 1, 3, and 5 results in 135).\n- Do NOT include units (e.g., kg, m, s), letters, spaces, or any other characters if the answer is a number.\n- Provide ONLY the final numeric value or a very short word/phrase if it refers to a non-math concept.\n- Never leave the answer blank or refuse.\n\nQuestion:\n${question}`
            );
        }

        _buildTrueFalsePrompt(question, subQuestions, table) {
            let thinkPrefix = CONFIG.THINK_BEFORE_ANSWER
                ? 'Internally use step-by-step reasoning as a reasoning model would, but do NOT reveal your chain-of-thought. After reasoning, reply with the final answers only prefixed by "FINAL:" followed by the comma-separated TRUE/FALSE values (example: FINAL: TRUE,FALSE,TRUE).\n\n'
                : "";
            let p =
                thinkPrefix +
                'You are a homework solver. Mathematical formulas and symbols are enclosed in [MATHJAX]...[/MATHJAX] tags. Interpret the content within these tags as mathematical expressions. For each sub-question, reply with "TRUE" or "FALSE" only, separated by commas. Example: TRUE,FALSE,TRUE,TRUE\n\n';
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
                response?.choices?.[0]?.message?.reasoning_content ||
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
                response?.choices?.[0]?.message?.reasoning_content ||
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
                        `Could not parse True/False answer for sub-question ${subQuestions[i].char}: '${answer}'`,
                    );
                    parsedResults.push({
                        char: subQuestions[i].char,
                        value: null,
                    }); // Indicate parsing failure
                }
            }
            return parsedResults;
        }

        async _solveMCQ(questionData) {
            this.overlay.updateStatus("Thinking (MCQ)...", "#f39c12");
            const { question, options, images, container } = questionData;

            const prompt = this._buildMCQPrompt(question, options);
            logger.info("MCQ Prompt:", prompt);

            // Collect all images: from the question and from each option
            const allImages = [...images];
            options.forEach((opt) => {
                if (opt.images && opt.images.length > 0) {
                    allImages.push(...opt.images);
                }
            });
            // Ensure unique images
            const uniqueImages = [...new Set(allImages)];

            let response = await this.api.call(prompt, uniqueImages);

            this.lastApiResponse = response;
            const letter = this._parseLetter(response);
            logger.info(`LLM response parsed to: '${letter}'`);

            if (!letter) {
                logger.warn("Could not determine an answer from LLM.");
                logger.debug("Raw LLM response for MCQ:", response);
                return false;
            }

            logger.info(`LLM suggests option: ${letter}`);
            this.overlay.updateStatus("Applying Answer...", "#3498db");

            const optionToSelect = options.find(
                (o) => o.letter.toUpperCase() === letter.toUpperCase(),
            );
            if (!optionToSelect) {
                logger.warn(
                    `LLM answered '${letter}', but no such option was found.`,
                );
                return false;
            }

            this.ui.selectOption(optionToSelect);
            await new Promise((r) => setTimeout(r, CONFIG.HUMAN_DELAY_MIN));
            const gridItem = document.querySelector(
                ".answer-sheet .option.active, .mobile-bottom-bar .number.active",
            );
            const submitted = await this.ui.clickSubmit();
            if (submitted || !document.querySelector("button.btn-primary")) {
                // Fail-safe: if no submit button, assume done
                await new Promise((r) => setTimeout(r, 1000));
                if (container && container.isConnected) {
                    container.classList.add("done");
                }
                if (gridItem) {
                    gridItem.classList.add("done");
                }

                this.overlay.updateStatus("MCQ Solved", "#2ecc71");
                return true;
            }
            return false;
        }

        async _solveFillable(questionData) {
            this.overlay.updateStatus("Thinking (Fillable)...", "#f39c12");
            const { question, blanks, images, container } = questionData;
            if (blanks.length === 0) return false;
            const prompt = this._buildFillPrompt(question);
            logger.info("Fill Prompt:", prompt);

            const response = await this.api.call(prompt, images);
            this.lastApiResponse = response;
            const answerText = this._parseFill(response);
            logger.info(`LLM response parsed to: '${answerText}'`);

            if (!answerText) {
                logger.warn("LLM returned an empty answer.");
                return false;
            }

            this.overlay.updateStatus("Typing Answers...", "#3498db");
            await this.ui.fillBlank(blanks[0], answerText);
            await new Promise((r) => setTimeout(r, 1000));
            const gridItem = document.querySelector(
                ".answer-sheet .option.active, .mobile-bottom-bar .number.active",
            );
            const submitted = await this.ui.clickSubmit();
            if (submitted || !document.querySelector("button.btn-primary")) {
                await new Promise((r) => setTimeout(r, 1000));
                if (container && container.isConnected) {
                    container.classList.add("done");
                }
                if (gridItem) {
                    gridItem.classList.add("done");
                }

                this.overlay.updateStatus("Fillable Solved", "#2ecc71");
                return true;
            }
            return false;
        }

        async _solveShortAnswer(questionData) {
            this.overlay.updateStatus("Thinking (Short)...", "#f39c12");
            const { question, blanks, images, container } = questionData;
            if (blanks.length === 0) return false;

            // Use dedicated short-answer prompt with strict formatting
            const prompt = this._buildShortAnswerPrompt(question);
            logger.info("Short Answer Prompt:", prompt);

            const response = await this.api.call(prompt, images);
            this.lastApiResponse = response;
            const answerText = this._parseFill(response);
            logger.info(`LLM Short Answer parsed to: '${answerText}'`);

            if (!answerText) {
                logger.warn("LLM returned an empty short answer.");
                return false;
            }

            this.overlay.updateStatus("Typing Answers...", "#3498db");
            // Short answer usually has one input field in the .answer div
            await this.ui.fillBlank(blanks[0], answerText);
            await new Promise((r) => setTimeout(r, 1000));
            const gridItem = document.querySelector(
                ".answer-sheet .option.active, .mobile-bottom-bar .number.active",
            );
            const submitted = await this.ui.clickSubmit();
            if (submitted || !document.querySelector("button.btn-primary")) {
                await new Promise((r) => setTimeout(r, 1000));
                if (container && container.isConnected) {
                    container.classList.add("done");
                }
                if (gridItem) {
                    gridItem.classList.add("done");
                }

                this.overlay.updateStatus("Short Answer Solved", "#2ecc71");
                return true;
            }
            return false;
        }

        async _solveTrueFalse(questionData) {
            this.overlay.updateStatus("Thinking (T/F)...", "#f39c12");
            const { question, subQuestions, images, table, container } =
                questionData;
            if (subQuestions.length === 0) return false;
            const prompt = this._buildTrueFalsePrompt(
                question,
                subQuestions,
                table,
            );
            logger.info("True/False Prompt:", prompt);

            const response = await this.api.call(prompt, images);
            this.lastApiResponse = response;
            const parsedAnswers = this._parseTrueFalse(response, subQuestions);
            logger.info(
                `LLM response parsed to: '${JSON.stringify(parsedAnswers)}'`,
            );

            if (
                parsedAnswers.length !== subQuestions.length ||
                parsedAnswers.some((a) => a.value === null)
            ) {
                logger.warn(
                    "Could not determine all True/False answers from LLM.",
                );
                logger.debug("Raw LLM response for True/False:", response);
                return false;
            }

            this.overlay.updateStatus("Applying Answers...", "#3498db");
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
            const gridItem = document.querySelector(
                ".answer-sheet .option.active, .mobile-bottom-bar .number.active",
            );
            const submitted = await this.ui.clickSubmit();
            if (submitted || !document.querySelector("button.btn-primary")) {
                await new Promise((r) => setTimeout(r, 1000));
                // Mark individual rows as done
                subQuestions.forEach((sq) => {
                    if (sq.element && sq.element.isConnected) {
                        sq.element.classList.add("done");
                    }
                });

                if (container && container.isConnected) {
                    container.classList.add("done");
                }

                if (gridItem) {
                    gridItem.classList.add("done");
                }

                this.overlay.updateStatus("True/False Solved", "#2ecc71");
                return true;
            }
            return false;
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
            localStorage.setItem("HW_SOLVER_INSTANT_MODE", CONFIG.INSTANT_MODE);
            logger.info(
                `Instant Mode toggled: ${CONFIG.INSTANT_MODE ? "ON" : "OFF"}`,
            );
            return `Instant Mode is now ${CONFIG.INSTANT_MODE ? "ON" : "OFF"}`;
        },
        toggleThinkBeforeAnswer: () => {
            CONFIG.THINK_BEFORE_ANSWER = !CONFIG.THINK_BEFORE_ANSWER;
            localStorage.setItem(
                "HW_SOLVER_THINK_BEFORE_ANSWER",
                CONFIG.THINK_BEFORE_ANSWER,
            );
            logger.info(
                `Think-Before-Answer toggled: ${CONFIG.THINK_BEFORE_ANSWER ? "ON" : "OFF"
                }`,
            );
            return `Think-Before-Answer is now ${CONFIG.THINK_BEFORE_ANSWER ? "ON" : "OFF"
                }`;
        },
        isThinkBeforeAnswerEnabled: () => !!CONFIG.THINK_BEFORE_ANSWER,
        help: () => {
            console.log("hwSolver helper — quick commands:");
            console.log("  hwSolver.solveOnce()       — run one solve cycle");
            console.log(
                "  hwSolver.start()           — start scheduler (repeats)",
            );
            console.log("  hwSolver.stop()            — stop scheduler");
            console.log(
                "  hwSolver.toggleInstantMode() — toggle fast typing mode (instant vs human-like)",
            );
            console.log(
                "  hwSolver.toggleThinkBeforeAnswer() — toggle reasoning-before-answer (FINAL: outputs)",
            );
            console.log(
                "  hwSolver.config            — read/write runtime configuration",
            );
            console.log(
                "  hwSolver.logger.history    — view recent log entries",
            );
            return "See console for hwSolver commands";
        },
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

    // -------------- GUARDIAN LOOP (UI PERSISTENCE) --------------
    const startGuardian = (solverInstance) => {
        logger.debug("Guardian Loop started. Monitoring UI persistence...");
        const performCheck = () => {
            const overlay = document.getElementById("hw-solver-overlay");
            const styles = document.getElementById("hw-solver-styles");
            if (!overlay || !styles) {
                logger.warn(
                    "Guardian detected missing UI components. Restoring...",
                );
                solverInstance.overlay.init();
            }
        };
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.removedNodes) {
                    if (
                        node.id === "hw-solver-overlay" ||
                        node.id === "hw-solver-styles"
                    ) {
                        performCheck();
                        return;
                    }
                }
            }
        });
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
        });
        setInterval(performCheck, 1500);
        window.addEventListener("popstate", performCheck);
        window.addEventListener("hashchange", performCheck);
    };

    startGuardian(solver);
})();
