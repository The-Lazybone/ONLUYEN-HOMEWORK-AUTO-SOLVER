import { logger } from '../logger.js';

export class Scraper {
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
        };
        return fractionMap[word.toLowerCase()];
    }

    _getQuestionContainers() {
        return Array.from(
            document.querySelectorAll(
                ".question-name, #step, app-question-short-answer, .question.fade-indown, .test-school-question-option, app-question-true-false-test, app-test-school-question-option",
            ),
        ).filter((el) => el.offsetParent !== null);
    }

    _getCleanedText(element) {
        if (!element) return "";
        const clone = element.cloneNode(true);
        clone.querySelectorAll("mjx-container").forEach((mjx) => {
            let mathContent = "";
            const ariaLabel = mjx.getAttribute("aria-label");
            const assistiveMml = mjx.querySelector("mjx-assistive-mml");

            if (ariaLabel) {
                mathContent = ariaLabel;
                logger.debug("Original MathJax aria-label:", ariaLabel);
            } else if (assistiveMml) {
                mathContent = assistiveMml.innerText.trim();
                logger.debug(
                    "Original MathJax assistive-mml (fallback):",
                    mathContent,
                );
            }

            if (mathContent) {
                mjx.replaceWith(
                    document.createTextNode(
                        ` [MATHJAX]${mathContent}[/MATHJAX] `,
                    ),
                );
            } else {
                mjx.remove();
            }
        });

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
            if (!includeSolved && container.classList.contains("done")) {
                continue;
            }

            logger.debug(
                "Detecting in container with class:",
                container.className || container.tagName,
            );

            const short = this.scrapeShortAnswer(container);
            const isShortSolved =
                gridSolved !== null ? gridSolved : short.isSolved;
            if (short.blanks.length && (includeSolved || !isShortSolved)) {
                return { ...short, isSolved: isShortSolved };
            }

            const mcq = this.scrapeMCQ(container);
            const isMcqSolved =
                gridSolved !== null ? gridSolved : mcq.isSolved;
            if (mcq.options.length && (includeSolved || !isMcqSolved)) {
                return { ...mcq, isSolved: isMcqSolved };
            }

            const fill = this.scrapeFillable(container);
            const isFillSolved =
                gridSolved !== null ? gridSolved : fill.isSolved;
            if (fill.blanks.length && (includeSolved || !isFillSolved)) {
                return { ...fill, isSolved: isFillSolved };
            }

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

        if (questionParts.length === 0) {
            const qNode = container.querySelector(".fadein") || container;
            questionParts.push(this._getCleanedText(qNode));
        }

        const questionText = [...new Set(questionParts)]
            .join("\n\n")
            .trim();

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
                    node.classList.contains("highlighed") ||
                    node.classList.contains("highlighted") ||
                    node.querySelector(".text-answered") !== null;
                if (isSelected) isSolved = true;
                if (node.matches(".question-option")) {
                    letter =
                        node
                            .querySelector(".question-option-label")
                            ?.innerText.trim() || null;
                    contentNode = node.querySelector(
                        ".question-option-content",
                    );
                    text = this._getCleanedText(contentNode);
                } else {
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
                const trueInput = node.querySelector('input[value="true"]');
                const falseInput = node.querySelector(
                    'input[value="false"]',
                );

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
                    element: node,
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
