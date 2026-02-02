import { CONFIG } from '../constants.js';
import { logger } from '../logger.js';
import { APIClient } from '../api/api-client.js';
import { Scraper } from '../scraper/scraper.js';
import { UIController } from '../ui/ui-controller.js';
import { WebSearch } from '../api/web-search.js';
import { Scheduler } from './scheduler.js';
import { BasicUI } from '../ui/dashboard.js';

export class HomeworkSolver {
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

        const detected = this.scraper.detectQuestionType(includeSolved);
        if (detected.type === "unknown") {
            if (!includeSolved && this.scraper.isAssignmentFinished()) {
                return "FINISHED";
            }
            logger.info("No questions detected.");
            this.overlay.updateStatus("No Questions", "#e74c3c");
            return "NO_QUESTION";
        }

        const container = detected.container || document;
        const header = container.querySelector(".question-header, .quetion-number, .num");

        let currentNum = null;
        let currentId = container.id || null;

        if (header) {
            const text = header.innerText.trim();
            const numMatch = text.match(/Câu:?\s*(\d+)/i);
            if (numMatch) currentNum = parseInt(numMatch[1], 10);

            const idElement = header.querySelector("span, .num span");
            if (idElement) {
                const idMatch = idElement.innerText.match(/#(\d+)/);
                if (idMatch) currentId = idMatch[1];
            }
        }

        logger.info(`Solving ${detected.type.toUpperCase()} - Num: ${currentNum}, ID: ${currentId}`);

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
        let p = thinkPrefix + "You are a homework solver. Mathematical formulas and symbols are enclosed in [MATHJAX]...[/MATHJAX] tags. Interpret the content within these tags as mathematical expressions. Even if you are unsure or the question is ambiguous, provide your best guess by selecting one letter. Always reply with exactly one uppercase letter: A, B, C or D — nothing else, no explanations or refusals.\n\n";
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
        return thinkPrefix + `You are a homework solver. Mathematical formulas and symbols are enclosed in [MATHJAX]...[/MATHJAX] tags. Interpret the content within these tags as mathematical expressions. If the question is in another language, translate it to English first and then solve it step by step. Fill the blank(s) with short phrase(s) or word(s) or a number. For numerical answers, use a comma (,) as the decimal separator. Even if you are unsure or lack complete information, provide your best guess or approximation as a short phrase, word, or number. Never leave the answer blank or refuse—always fill it in. Format the answer concisely, starting with the key numerical value or phrase if applicable. Reply only with the short answer (numerical if possible), with no prefixes or suffixes. \n\nQuestion:\n${question}`;
    }

    _buildShortAnswerPrompt(question) {
        const thinkPrefix = CONFIG.THINK_BEFORE_ANSWER
            ? 'Internally use step-by-step reasoning as a reasoning model would, but do NOT reveal your chain-of-thought. After reasoning, reply only with the final short answer prefixed by "FINAL:".\n\n'
            : "";
        return thinkPrefix + `You are a homework solver. Mathematical formulas and symbols are enclosed in [MATHJAX]...[/MATHJAX] tags. Interpret these as mathematical expressions. If the question is in another language, translate to English first. Solve the following question with a single concise answer. \n\nCRITICAL NUMERIC RULES:\n- For decimal numbers, use EXACTLY ONE comma (,) as the decimal separator (e.g., 12,5).\n- For whole numbers, provide the number only (e.g., 25).\n- If the question asks you to choose multiple numeric options and combine them, concatenate the numbers into a single integer without spaces (e.g., choosing 1, 3, and 5 results in 135).\n- Do NOT include units (e.g., kg, m, s), letters, spaces, or any other characters if the answer is a number.\n- Provide ONLY the final numeric value or a very short word/phrase if it refers to a non-math concept.\n- Never leave the answer blank or refuse.\n\nQuestion:\n${question}`;
    }

    _buildTrueFalsePrompt(question, subQuestions, table) {
        let thinkPrefix = CONFIG.THINK_BEFORE_ANSWER
            ? 'Internally use step-by-step reasoning as a reasoning model would, but do NOT reveal your chain-of-thought. After reasoning, reply with the final answers only prefixed by "FINAL:" followed by the comma-separated TRUE/FALSE values (example: FINAL: TRUE,FALSE,TRUE).\n\n'
            : "";
        let p = thinkPrefix + 'You are a homework solver. Mathematical formulas and symbols are enclosed in [MATHJAX]...[/MATHJAX] tags. Interpret the content within these tags as mathematical expressions. For each sub-question, reply with "TRUE" or "FALSE" only, separated by commas. Example: TRUE,FALSE,TRUE,TRUE\n\n';
        p += `Main Question:\n${question}\n\n`;
        if (table) {
            p += `Table Data:\n${table}\n\n`;
        }
        p += "Sub-questions:\n";
        subQuestions.forEach((sq) => {
            p += `${sq.char}) ${sq.text}\n`;
        });
        p += "\nFor each sub-question (a, b, c, d), is the statement TRUE or FALSE? Reply ONLY with TRUE or FALSE for each, separated by commas.";
        return p;
    }

    _parseLetter(response) {
        if (!response) return "";
        let content = response?.choices?.[0]?.message?.content || response?.choices?.[0]?.message?.reasoning_content || response?.answer || (typeof response === "string" ? response : "");
        if (typeof content === "string") {
            const finalMatch = content.match(/FINAL:\s*([A-D])\b/i);
            if (finalMatch) content = finalMatch[1];
        }
        const match = content.trim().match(/([A-D])\b/);
        return match ? match[1] : "";
    }

    _parseFill(response) {
        if (!response) return "";
        let text = response?.choices?.[0]?.message?.content || response?.choices?.[0]?.message?.reasoning_content || response?.answer || (typeof response === "string" ? response : "");
        if (typeof text === "string") {
            const fm = text.match(/FINAL:\s*(.+)/i);
            if (fm) text = fm[1];
        }
        return text.replace(/^answer:\s*/i, "").replace(/["'`“”'']/g, "").trim();
    }

    _parseTrueFalse(response, subQuestions) {
        if (!response) return [];
        let content = response?.choices?.[0]?.message?.content || response?.answer || (typeof response === "string" ? response : "");
        if (typeof content === "string") {
            const fm = content.match(/FINAL:\s*(.+)/i);
            if (fm) content = fm[1];
        }
        const answers = content.split(",").map((s) => s.trim().toUpperCase());
        const parsedResults = [];
        for (let i = 0; i < subQuestions.length; i++) {
            const answer = answers[i];
            if (answer === "TRUE") {
                parsedResults.push({ char: subQuestions[i].char, value: true });
            } else if (answer === "FALSE") {
                parsedResults.push({ char: subQuestions[i].char, value: false });
            } else {
                logger.warn(`Could not parse True/False answer for sub-question ${subQuestions[i].char}: '${answer}'`);
                parsedResults.push({ char: subQuestions[i].char, value: null });
            }
        }
        return parsedResults;
    }

    async _solveMCQ(questionData) {
        this.overlay.updateStatus("Thinking (MCQ)...", "#f39c12");
        const { question, options, images, container } = questionData;
        const prompt = this._buildMCQPrompt(question, options);
        logger.info("MCQ Prompt:", prompt);
        const allImages = [...images];
        options.forEach((opt) => { if (opt.images && opt.images.length > 0) allImages.push(...opt.images); });
        const uniqueImages = [...new Set(allImages)];
        let response = await this.api.call(prompt, uniqueImages);
        this.lastApiResponse = response;
        const letter = this._parseLetter(response);
        if (!letter) return false;
        const optionToSelect = options.find((o) => o.letter.toUpperCase() === letter.toUpperCase());
        if (!optionToSelect) return false;
        this.ui.selectOption(optionToSelect);
        await new Promise((r) => setTimeout(r, CONFIG.HUMAN_DELAY_MIN));
        const gridItem = document.querySelector(".answer-sheet .option.active, .mobile-bottom-bar .number.active");
        const submitted = await this.ui.clickSubmit();
        if (submitted || !document.querySelector("button.btn-primary")) {
            await new Promise((r) => setTimeout(r, 1000));
            if (container && container.isConnected) container.classList.add("done");
            if (gridItem) gridItem.classList.add("done");
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
        const response = await this.api.call(prompt, images);
        this.lastApiResponse = response;
        const answerText = this._parseFill(response);
        if (!answerText) return false;
        await this.ui.fillBlank(blanks[0], answerText);
        await new Promise((r) => setTimeout(r, 1000));
        const gridItem = document.querySelector(".answer-sheet .option.active, .mobile-bottom-bar .number.active");
        const submitted = await this.ui.clickSubmit();
        if (submitted || !document.querySelector("button.btn-primary")) {
            await new Promise((r) => setTimeout(r, 1000));
            if (container && container.isConnected) container.classList.add("done");
            if (gridItem) gridItem.classList.add("done");
            this.overlay.updateStatus("Fillable Solved", "#2ecc71");
            return true;
        }
        return false;
    }

    async _solveShortAnswer(questionData) {
        this.overlay.updateStatus("Thinking (Short)...", "#f39c12");
        const { question, blanks, images, container } = questionData;
        if (blanks.length === 0) return false;
        const prompt = this._buildShortAnswerPrompt(question);
        const response = await this.api.call(prompt, images);
        this.lastApiResponse = response;
        const answerText = this._parseFill(response);
        if (!answerText) return false;
        await this.ui.fillBlank(blanks[0], answerText);
        await new Promise((r) => setTimeout(r, 1000));
        const gridItem = document.querySelector(".answer-sheet .option.active, .mobile-bottom-bar .number.active");
        const submitted = await this.ui.clickSubmit();
        if (submitted || !document.querySelector("button.btn-primary")) {
            await new Promise((r) => setTimeout(r, 1000));
            if (container && container.isConnected) container.classList.add("done");
            if (gridItem) gridItem.classList.add("done");
            this.overlay.updateStatus("Short Answer Solved", "#2ecc71");
            return true;
        }
        return false;
    }

    async _solveTrueFalse(questionData) {
        this.overlay.updateStatus("Thinking (T/F)...", "#f39c12");
        const { question, subQuestions, images, table, container } = questionData;
        if (subQuestions.length === 0) return false;
        const prompt = this._buildTrueFalsePrompt(question, subQuestions, table);
        const response = await this.api.call(prompt, images);
        this.lastApiResponse = response;
        const parsedAnswers = this._parseTrueFalse(response, subQuestions);
        if (parsedAnswers.length !== subQuestions.length || parsedAnswers.some((a) => a.value === null)) return false;
        let allSelected = true;
        for (const sq of subQuestions) {
            const answer = parsedAnswers.find((a) => a.char === sq.char);
            if (answer) {
                if (!this.ui.selectTrueFalse(sq, answer.value)) allSelected = false;
            } else allSelected = false;
        }
        if (!allSelected) return false;
        await new Promise((r) => setTimeout(r, CONFIG.HUMAN_DELAY_MIN));
        const gridItem = document.querySelector(".answer-sheet .option.active, .mobile-bottom-bar .number.active");
        const submitted = await this.ui.clickSubmit();
        if (submitted || !document.querySelector("button.btn-primary")) {
            await new Promise((r) => setTimeout(r, 1000));
            subQuestions.forEach((sq) => { if (sq.element && sq.element.isConnected) sq.element.classList.add("done"); });
            if (container && container.isConnected) container.classList.add("done");
            if (gridItem) gridItem.classList.add("done");
            this.overlay.updateStatus("True/False Solved", "#2ecc71");
            return true;
        }
        return false;
    }
}
