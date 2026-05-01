// ==UserScript==
// @name         Intelligent AI Homework Solver (test - channel)
// @namespace    https://github.com/The-Lazybone/ONLUYEN-HOMEWORK-AUTO-SOLVER
// @version      2.1.0
// @author       The-Lazybone
// @description  Advanced AI-powered homework solver for onluyen.vn
// @license      MIT
// @icon         https://www.google.com/s2/favicons?sz=64&domain=onluyen.vn
// @downloadURL  https://github.com/The-Lazybone/ONLUYEN-HOMEWORK-AUTO-SOLVER/raw/main/dist/solver.user.js
// @updateURL    https://github.com/The-Lazybone/ONLUYEN-HOMEWORK-AUTO-SOLVER/raw/main/dist/solver.user.js
// @match        https://*.onluyen.vn/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/mathjs/14.0.1/math.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const CONFIG = {
    PROXY_URL: localStorage.getItem("HW_SOLVER_PROXY_URL") || "https://gen.pollinations.ai/v1/chat/completions",
    POLL_KEY: localStorage.getItem("HW_SOLVER_API_KEY") || typeof globalThis !== "undefined" && globalThis.__HW_SOLVER_POLL_KEY__ || "",
    DEFAULT_MODEL: localStorage.getItem("HW_SOLVER_DEFAULT_MODEL") || "gemini",
    VISION_MODEL: localStorage.getItem("HW_SOLVER_VISION_MODEL") || "gemini",
    RETRIES: 3,
    PROXY_TIMEOUT_MS: 3e5,
    LOOP_INTERVAL_MS: 4e3,
    HUMAN_DELAY_MIN: 200,
    HUMAN_DELAY_MAX: 800,
    LOG_LEVEL: localStorage.getItem("HW_SOLVER_LOG_LEVEL") || "INFO",
    LOG_HISTORY_LIMIT: 100,
    INSTANT_MODE: localStorage.getItem("HW_SOLVER_INSTANT_MODE") === "true",
    THINK_BEFORE_ANSWER: localStorage.getItem("HW_SOLVER_THINK_BEFORE_ANSWER") !== "false",
    // Default to true
    IDLE_THRESHOLD: parseInt(localStorage.getItem("HW_SOLVER_IDLE_THRESHOLD"), 10) || 10
  };
  class Logger {
    constructor() {
      this.history = [];
      this.levels = { DEBUG: 1, INFO: 2, WARN: 3, ERROR: 4, NONE: 5 };
    }
    _log(level, ...args) {
      const numericLevel = this.levels[level.toUpperCase()];
      const configLevel = this.levels[CONFIG.LOG_LEVEL.toUpperCase()] || this.levels.NONE;
      if (!numericLevel || numericLevel < configLevel) return;
      const timestamp = (/* @__PURE__ */ new Date()).toISOString();
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
  class MathLogic {
    constructor() {
      if (typeof math === "undefined") {
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
        if (typeof math !== "undefined") {
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
        if (typeof math !== "undefined") {
          return math.simplify(expr).toString();
        }
        return expr;
      } catch (e) {
        return expr;
      }
    }
  }
  const mathLogic = new MathLogic();
  class WebSearch {
    async search(query) {
      var _a, _b;
      try {
        const response = await fetch(
          `https://api.duckduckgo.com/?q=${encodeURIComponent(
          query
        )}&format=json&no_html=1&skip_disambig=1`
        );
        const data = await response.json();
        return data.AbstractText || data.Answer || ((_b = (_a = data.RelatedTopics) == null ? void 0 : _a[0]) == null ? void 0 : _b.Text) || data.Definition || "No relevant results found.";
      } catch (error) {
        logger.debug("Web search failed:", error);
        return "Search unavailable.";
      }
    }
    shouldSearch(question) {
      const keywords = [
        "history",
        "date",
        "year",
        "resolution",
        "document",
        "event",
        "period",
        "war",
        "battle"
      ];
      return keywords.some(
        (keyword) => question.toLowerCase().includes(keyword)
      );
    }
  }
  class APIClient {
    constructor() {
      this.webSearch = new WebSearch();
    }
    async call(prompt, images = []) {
      var _a, _b, _c, _d;
      if (!CONFIG.PROXY_URL) throw new Error("Proxy not configured");
      const userContent = [{ type: "text", text: prompt }];
      images.forEach((imgSrc) => {
        userContent.push({
          type: "image_url",
          image_url: { url: imgSrc }
        });
      });
      const modelToUse = images.length > 0 ? CONFIG.VISION_MODEL : CONFIG.DEFAULT_MODEL;
      const tools = [
        {
          type: "function",
          function: {
            name: "calculate",
            description: "Evaluate a mathematical expression using Math.js (v14+). Supports derivatives, algebra, calculus, and advanced functions (e.g., 'derivative(2x^2, x)', 'simplify(2x + 5x)', 'solve(2x = 10, x)'). Return the expression string only.",
            parameters: {
              type: "object",
              properties: {
                expression: {
                  type: "string",
                  description: "The Math.js expression to evaluate."
                }
              },
              required: ["expression"]
            }
          }
        }
      ];
      let messages = [
        {
          role: "system",
          content: "You are a precise assistant. Use the 'calculate' tool for any mathematical operations using Math.js syntax to ensure accuracy. Reply exactly as asked."
        },
        { role: "user", content: userContent }
      ];
      const headers = { "Content-Type": "application/json" };
      if (CONFIG.POLL_KEY) headers["Authorization"] = `Bearer ${CONFIG.POLL_KEY}`;
      let retryCount = 0;
      const maxToolTurns = 50;
      while (retryCount < maxToolTurns) {
        const payload = {
          model: modelToUse,
          reasoning_effort: CONFIG.THINK_BEFORE_ANSWER ? "high" : CONFIG.INSTANT_MODE ? "low" : "medium",
          messages,
          temperature: 1,
          tools,
          tool_choice: "auto",
          stream: true
        };
        if (CONFIG.THINK_BEFORE_ANSWER) {
          payload.max_completion_tokens = 128e3;
          payload.thinking = {
            type: "enabled",
            budget_tokens: 128e3
          };
        } else {
          payload.max_tokens = 4096;
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.PROXY_TIMEOUT_MS);
        try {
          let res = await fetch(CONFIG.PROXY_URL, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
            signal: controller.signal
          });
          if (!res.ok) {
            const txt = await res.text().catch(() => "");
            if (res.status === 400 && (txt.includes("cannot specify both max_tokens and max_completion_tokens") || txt.includes("max_completion_tokens"))) {
              logger.warn("API rejected max_completion_tokens. Retrying with max_tokens only.");
              delete payload.max_completion_tokens;
              payload.max_tokens = 4096;
              res = await fetch(CONFIG.PROXY_URL, {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
                signal: controller.signal
              });
              if (!res.ok) {
                const newTxt = await res.text().catch(() => "");
                throw new Error(`HTTP ${res.status}: ${newTxt}`);
              }
            } else {
              throw new Error(`HTTP ${res.status}: ${txt}`);
            }
          }
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let fullMessage = {
            role: "assistant",
            content: "",
            tool_calls: []
          };
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop();
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data: ")) continue;
              const dataStr = trimmed.slice(6);
              if (dataStr === "[DONE]") break;
              try {
                const chunk = JSON.parse(dataStr);
                const delta = (_b = (_a = chunk.choices) == null ? void 0 : _a[0]) == null ? void 0 : _b.delta;
                if (!delta) continue;
                if (delta.content) fullMessage.content += delta.content;
                if (delta.reasoning_content) {
                }
                if (delta.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    if (!fullMessage.tool_calls[tc.index]) {
                      fullMessage.tool_calls[tc.index] = {
                        id: tc.id,
                        type: "function",
                        function: { name: "", arguments: "" }
                      };
                    }
                    const target = fullMessage.tool_calls[tc.index];
                    if (tc.id) target.id = tc.id;
                    if ((_c = tc.function) == null ? void 0 : _c.name) target.function.name += tc.function.name;
                    if ((_d = tc.function) == null ? void 0 : _d.arguments) target.function.arguments += tc.function.arguments;
                  }
                }
              } catch (e) {
              }
            }
          }
          fullMessage.tool_calls = fullMessage.tool_calls.filter(Boolean);
          const response = { choices: [{ message: fullMessage }] };
          const message = response.choices[0].message;
          if (!message.content && message.tool_calls.length === 0) {
            return response;
          }
          if (message.tool_calls && message.tool_calls.length > 0) {
            logger.debug(`API - Turn ${retryCount + 1}: Tool cycle started.`);
            messages.push(message);
            for (const toolCall of message.tool_calls) {
              const functionName = toolCall.function.name;
              let args = {};
              try {
                args = JSON.parse(toolCall.function.arguments);
              } catch (e) {
                logger.warn("Failed to parse tool arguments:", toolCall.function.arguments);
              }
              let result = "";
              if (functionName === "calculate") {
                logger.info(`AI Tool - Calculate: ${args.expression}`);
                const evalResult = mathLogic.evaluate(args.expression);
                result = String(evalResult ?? "Error in calculation");
              }
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                name: functionName,
                content: result
              });
            }
            retryCount++;
            continue;
          }
          return response;
        } catch (err) {
          if (err.name === "AbortError") throw new Error("API Request timed out.");
          throw err;
        } finally {
          clearTimeout(timeoutId);
        }
      }
      logger.warn("Maximum tool call turns reached. Returning current state.");
      const lastAssistantMessageIdx = messages.findLastIndex((m) => m.role === "assistant");
      if (lastAssistantMessageIdx !== -1) {
        return { choices: [{ message: messages[lastAssistantMessageIdx] }] };
      }
      throw new Error("Exceeded maximum tool call turns without an answer.");
    }
    async uploadFile(blob, filename = "file.pdf") {
      const formData = new FormData();
      formData.append("file", blob, filename);
      const headers = {};
      if (CONFIG.POLL_KEY) headers["Authorization"] = `Bearer ${CONFIG.POLL_KEY}`;
      const response = await fetch("https://media.pollinations.ai/upload", {
        method: "POST",
        headers,
        body: formData
      });
      if (!response.ok) {
        const txt = await response.text().catch(() => "");
        throw new Error(`Upload failed HTTP ${response.status}: ${txt}`);
      }
      return await response.json();
    }
  }
  class Scraper {
    _normalize(s) {
      return (s || "").replace(/[ \t]+/g, " ").replace(/[\r\n]+/g, "\n").trim();
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
        thousand: 1e3,
        thousands: 1e3,
        million: 1e6,
        millions: 1e6
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
        tenths: 10
      };
      return fractionMap[word.toLowerCase()];
    }
    _getQuestionContainers() {
      return Array.from(
        document.querySelectorAll(
          ".question-name, #step, app-question-short-answer, app-question-multiple-choice, .question.fade-indown, .test-school-question-option, app-question-true-false-test, app-test-school-question-option"
        )
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
            mathContent
          );
        }
        if (mathContent) {
          mjx.replaceWith(
            document.createTextNode(
              ` [MATHJAX]${mathContent}[/MATHJAX] `
            )
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
      return Array.from(container.querySelectorAll("img")).map((img) => {
        if (img.complete && img.naturalWidth > 0) {
          return img.src;
        }
        return null;
      }).filter((src) => src !== null);
    }
    _scrapeTable(container) {
      if (!container) return null;
      const table = container.querySelector(".table-material-question");
      return table ? table.outerHTML : null;
    }
    _checkIsSolvedFromGrid(questionNum = null) {
      if (questionNum) {
        const gridItems = document.querySelectorAll(
          ".answer-sheet .option, .mobile-bottom-bar .number"
        );
        const specific = Array.from(gridItems).find(
          (el) => el.innerText.trim() === String(questionNum)
        );
        if (specific) return specific.classList.contains("done");
      }
      const active = document.querySelector(
        ".answer-sheet .option.active, .mobile-bottom-bar .number.active"
      );
      return active ? active.classList.contains("done") : null;
    }
    _getQuestionNumber(container) {
      if (!container) return null;
      const header = container.querySelector(
        ".question-header, .quetion-number, .num"
      );
      if (header) {
        const text = header.innerText.trim();
        const numMatch = text.match(/Câu:?\s*(\d+)/i);
        if (numMatch) return parseInt(numMatch[1], 10);
      }
      return null;
    }
    isAssignmentFinished() {
      const indicators = Array.from(
        document.querySelectorAll(
          ".answer-sheet .option, .mobile-bottom-bar .number"
        )
      );
      if (indicators.length === 0) return false;
      const allDone = indicators.every(
        (el) => el.classList.contains("done")
      );
      if (allDone) {
        logger.info(
          `Assignment completion detected via grid check (${indicators.length} questions).`
        );
      }
      return allDone;
    }
    detectQuestionType(includeSolved = false) {
      const containers = this._getQuestionContainers();
      for (const container of containers) {
        const questionNum = this._getQuestionNumber(container);
        const gridSolved = this._checkIsSolvedFromGrid(questionNum);
        if (!includeSolved && (container.classList.contains("done") || gridSolved === true)) {
          continue;
        }
        logger.debug(
          `Detecting in container for Q${questionNum || "?"} with class:`,
          container.className || container.tagName
        );
        const short = this.scrapeShortAnswer(container);
        const isShortSolved = gridSolved !== null ? gridSolved : short.isSolved;
        if (short.blanks.length && (includeSolved || !isShortSolved)) {
          return { ...short, isSolved: isShortSolved, number: questionNum };
        }
        const mcq = this.scrapeMCQ(container);
        const isMcqSolved = gridSolved !== null ? gridSolved : mcq.isSolved;
        if (mcq.options.length && (includeSolved || !isMcqSolved)) {
          return { ...mcq, isSolved: isMcqSolved, number: questionNum };
        }
        const fill = this.scrapeFillable(container);
        const isFillSolved = gridSolved !== null ? gridSolved : fill.isSolved;
        if (fill.blanks.length && (includeSolved || !isFillSolved)) {
          return { ...fill, isSolved: isFillSolved, number: questionNum };
        }
        const tf = this.scrapeTrueFalse(container);
        const isTfSolved = gridSolved !== null ? gridSolved : tf.isSolved;
        if (tf.subQuestions.length > 0 && (includeSolved || !isTfSolved)) {
          return { ...tf, isSolved: isTfSolved, number: questionNum };
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
        if (titleText && !questionParts.some((p) => p.includes(titleText))) {
          questionParts.push(titleText);
        }
      }
      if (questionParts.length === 0) {
        const qNode = container.querySelector(".fadein") || container;
        questionParts.push(this._getCleanedText(qNode));
      }
      const questionText = [...new Set(questionParts)].join("\n\n").trim();
      const images = [
        ...this._scrapeImages(container.querySelector(".question-text")),
        ...this._scrapeImages(container.querySelector(".question-name")),
        ...this._scrapeImages(container.querySelector(".content-question")),
        ...this._scrapeImages(container.querySelector(".fadein"))
      ];
      const nodes = Array.from(
        container.querySelectorAll(
          ".question-option, .select-item, .item-answer, .option"
        )
      );
      let isSolved = false;
      const options = nodes.map((node) => {
        let letter, text, contentNode;
        const isSelected = node.classList.contains("selected") || node.classList.contains("active") || node.classList.contains("choose") || node.classList.contains("highlighed") || node.classList.contains("highlighted") || node.querySelector(".active-answer") !== null || node.querySelector(".text-answered") !== null;
        if (isSelected) isSolved = true;
        let clickTarget = node;
        if (node.matches(".question-option")) {
          const bubble = node.querySelector(".question-option-label");
          letter = (bubble == null ? void 0 : bubble.innerText.trim()) || null;
          if (bubble) clickTarget = bubble;
          contentNode = node.querySelector(".question-option-content");
          text = this._getCleanedText(contentNode);
        } else if (node.matches(".option")) {
          const bubble = node.querySelector(".item-answer, .number-item");
          letter = (bubble == null ? void 0 : bubble.innerText.trim().toUpperCase()) || null;
          if (bubble) clickTarget = bubble;
          contentNode = node.querySelector(".option-content, label");
          text = this._getCleanedText(contentNode);
          if (node.querySelector(".active-answer") || node.classList.contains("choose")) isSolved = true;
        } else {
          const bubble = node.querySelector(".number-item");
          letter = (bubble == null ? void 0 : bubble.innerText.trim().toUpperCase()) || null;
          if (bubble) clickTarget = bubble;
          contentNode = node.querySelector("label");
          text = this._getCleanedText(contentNode);
        }
        return {
          letter,
          text,
          images: contentNode ? this._scrapeImages(contentNode) : [],
          element: clickTarget
        };
      }).filter((o) => o.letter && o.letter.length === 1);
      return {
        type: "mcq",
        question: questionText,
        options,
        images,
        isSolved,
        container
      };
    }
    scrapeShortAnswer(container) {
      if (!container) {
        return {
          type: "shortanswer",
          question: "",
          blanks: [],
          images: [],
          isSolved: false
        };
      }
      const hasShortAnswerClass = container.querySelector("app-question-short-answer, .content-question");
      const hasTextarea = container.querySelector("textarea");
      if (!hasShortAnswerClass && !hasTextarea) {
        return {
          type: "shortanswer",
          question: "",
          blanks: [],
          images: [],
          isSolved: false
        };
      }
      const inputs = Array.from(
        container.querySelectorAll("input[type='text'], textarea")
      );
      const isSolved = inputs.length > 0 && inputs.every((input) => input.value.trim().length > 0);
      const blanks = inputs.map((el, i) => ({ index: i, element: el }));
      const questionParts = [];
      const headerNode = container.querySelector(
        ".question-header, .quetion-number"
      );
      if (headerNode)
        questionParts.push(this._getCleanedText(headerNode));
      const contentNode = container.querySelector(
        ".content-question, .content"
      );
      if (contentNode) {
        questionParts.push(this._getCleanedText(contentNode));
      }
      const questionText = [...new Set(questionParts)].join("\n\n").trim();
      const images = [
        ...this._scrapeImages(
          container.querySelector(".content-question")
        ),
        ...this._scrapeImages(container.querySelector(".content"))
      ];
      return {
        type: "shortanswer",
        question: questionText,
        blanks,
        images,
        isSolved,
        container
      };
    }
    scrapeFillable(container) {
      if (!container)
        return {
          type: "fillable",
          question: "",
          blanks: [],
          images: [],
          isSolved: false
        };
      const inputs = Array.from(
        container.querySelectorAll("input[type='text'], textarea")
      );
      if (container.querySelector("app-question-short-answer"))
        return { type: "fillable", blanks: [], isSolved: false };
      const isSolved = inputs.length > 0 && inputs.every((input) => input.value.trim().length > 0);
      const blanks = inputs.map((el, i) => ({ index: i, element: el }));
      const qNode = container.querySelector(".fadein") || container.querySelector(".question-text") || container;
      let questionText = "";
      if (qNode) {
        const clone = qNode.cloneNode(true);
        clone.querySelectorAll("input[type='text'], textarea").forEach((el) => {
          var _a;
          const parent = el.parentNode;
          (_a = parent.querySelector(".ans-span-second")) == null ? void 0 : _a.remove();
          parent.replaceChild(
            document.createTextNode(" [BLANK] "),
            el
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
        container
      };
    }
    scrapeTrueFalse(container) {
      if (!container)
        return {
          type: "truefalse",
          question: "",
          subQuestions: [],
          images: [],
          table: null
        };
      const qNode = container.querySelector(".fadein") || container.querySelector(".question-text") || container;
      const questionText = this._getCleanedText(qNode);
      const images = this._scrapeImages(qNode);
      const table = this._scrapeTable(qNode);
      const subQuestionNodes = Array.from(
        container.querySelectorAll(
          ".question-child .child-content, .option.ng-star-inserted"
        )
      );
      const subQuestions = subQuestionNodes.map((node) => {
        var _a, _b;
        const trueInput = node.querySelector('input[value="true"]');
        const falseInput = node.querySelector(
          'input[value="false"]'
        );
        const itemAnswers = Array.from(
          node.querySelectorAll(".item-answer")
        );
        const trueDiv = itemAnswers.find(
          (el) => el.innerText.includes("Đúng")
        );
        const falseDiv = itemAnswers.find(
          (el) => el.innerText.includes("Sai")
        );
        const trueElement = trueInput || trueDiv;
        const falseElement = falseInput || falseDiv;
        const isAnswered = trueInput && trueInput.checked || falseInput && falseInput.checked || trueDiv && (trueDiv.classList.contains("active-answer") || trueDiv.classList.contains("selected")) || falseDiv && (falseDiv.classList.contains("active-answer") || falseDiv.classList.contains("selected"));
        return {
          char: ((_a = node.querySelector(".option-char")) == null ? void 0 : _a.innerText.trim().replace(")", "").replace(".", "")) || ((_b = node.querySelector(".item-option")) == null ? void 0 : _b.innerText.trim().replace(")", "").replace(".", "")) || null,
          text: this._getCleanedText(
            node.querySelector(".fadein, .option-content")
          ),
          trueElement,
          falseElement,
          isAnswered,
          element: node
        };
      }).filter(
        (sq) => (sq.char || sq.text) && (sq.trueElement || sq.falseElement)
      );
      const isSolved = subQuestions.length > 0 && subQuestions.every((sq) => sq.isAnswered);
      return {
        type: "truefalse",
        question: questionText,
        subQuestions,
        images,
        table,
        isSolved,
        container
      };
    }
    isPDFMode() {
      const hasId = !!document.getElementById("iframePDF");
      const hasClass = !!document.querySelector(".pdf-test");
      const hasIframe = !!document.querySelector("iframe[src*='viewer.html']");
      const hasGlobal = typeof window.pdfSrc !== "undefined";
      const result = hasId || hasClass || hasIframe || hasGlobal;
      logger.debug(`PDF Mode Detection: id=${hasId}, class=${hasClass}, iframe=${hasIframe}, global=${hasGlobal} -> ${result}`);
      return result;
    }
    getPDFUrl() {
      const iframe = document.getElementById("iframePDF") || document.querySelector("iframe[src*='viewer.html']");
      if (iframe) {
        const match = iframe.src.match(/\?file=([^&]+)/);
        if (match) return decodeURIComponent(match[1]);
      }
      if (typeof window.pdfSrc === "string") {
        return decodeURIComponent(window.pdfSrc);
      }
      const urlParams = new URLSearchParams(window.location.search);
      const fileParam = urlParams.get("file") || urlParams.get("pdfSrc");
      if (fileParam) return fileParam;
      return null;
    }
    getPDFQuestionNumber() {
      const selected = document.querySelector(".list-question span.selected");
      return selected ? parseInt(selected.innerText.trim(), 10) : null;
    }
    /**
     * Identifies the current question type in PDF sidebar (MCQ, T/F, or Fillable).
     */
    detectPDFQuestionType() {
      const sidebar = document.querySelector(".userSelected");
      if (!sidebar) return "unknown";
      const listAnswer = sidebar.querySelector(".list-answer");
      if (!listAnswer) return "unknown";
      if (listAnswer.querySelectorAll("span").length >= 4) {
        return "mcq";
      }
      if (listAnswer.querySelector(".select-answer")) {
        return "truefalse";
      }
      if (listAnswer.querySelector("input, textarea")) {
        return "shortanswer";
      }
      return "unknown";
    }
  }
  class UIController {
    _simulateClick(el) {
      var _a;
      if (!el) return;
      try {
        el.scrollIntoView({ block: "center", inline: "center" });
      } catch (e) {
        logger.debug("Scroll into view failed:", e);
      }
      const events = ["mouseenter", "mouseover", "mousedown", "pointerdown", "mouseup", "pointerup", "click"];
      events.forEach((evtType) => {
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
        (_a = el.focus) == null ? void 0 : _a.call(el);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (e) {
        logger.debug("Final events failed:", e);
      }
      logger.debug("Simulated robust click on", el);
    }
    async _simulateTyping(element, text) {
      if (!element || !text) return;
      const style = window.getComputedStyle(element);
      const isHidden = style.display === "none" || style.visibility === "hidden" || element.offsetParent === null;
      if (isHidden) {
        logger.debug("Simulating typing on hidden element via direct value assignment");
        element.value = text;
        element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        element.dispatchEvent(new Event("blur", { bubbles: true, composed: true }));
        return;
      }
      element.dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true, composed: true })
      );
      element.dispatchEvent(
        new MouseEvent("mouseenter", { bubbles: true, composed: true })
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
            keyCode,
            charCode,
            bubbles: true,
            composed: true
          })
        );
        element.dispatchEvent(
          new KeyboardEvent("keypress", {
            key: char,
            keyCode,
            charCode,
            bubbles: true,
            composed: true
          })
        );
        element.value += char;
        element.dispatchEvent(
          new InputEvent("input", {
            data: char,
            inputType: "insertText",
            bubbles: true,
            composed: true
          })
        );
        element.dispatchEvent(
          new KeyboardEvent("keyup", {
            key: char,
            keyCode,
            charCode,
            bubbles: true,
            composed: true
          })
        );
        if (i < text.length - 1) {
          await new Promise(
            (r) => setTimeout(
              r,
              minDelay + Math.random() * (maxDelay - minDelay)
            )
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
      let inputEl = option.element.querySelector("input");
      if (!inputEl) {
        const container = option.element.closest(".question-option, .select-item, .item-answer, .option");
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
      if (!blank || !blank.element || !text) return false;
      const el = blank.element;
      const isTinyMce = el.id && el.id.includes("tiny") || el.closest("app-tinymce-textarea, editor, .tox-tinymce");
      if (isTinyMce) {
        logger.debug("Detected TinyMCE textarea/editor container");
        const wrapper = el.closest("app-tinymce-textarea") || el.closest("editor") || el.closest(".tox-tinymce") || el.parentElement;
        if (wrapper) {
          const iframe = wrapper.querySelector("iframe.tox-edit-area__iframe") || wrapper.querySelector("iframe");
          if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
            const htmlText = `<p>${text}</p>`;
            iframe.contentDocument.body.innerHTML = htmlText;
            iframe.contentDocument.body.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
            iframe.contentDocument.body.dispatchEvent(new Event("keyup", { bubbles: true, composed: true }));
            iframe.contentDocument.body.dispatchEvent(new Event("blur", { bubbles: true, composed: true }));
            el.value = text;
            el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
            el.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
            logger.debug("Filled TinyMCE iframe and synced textarea with:", text);
            return true;
          } else {
            logger.warn("TinyMCE found but iframe content is inaccessible. Will attempt fallback typing...");
          }
        }
      }
      const style = window.getComputedStyle(el);
      const isHidden = style.display === "none" || style.visibility === "hidden" || el.offsetParent === null;
      if (isHidden) {
        logger.debug("Target element is hidden. Searching for visible editor sibling...");
        const container = el.parentElement;
        if (container) {
          const visibleSibling = Array.from(container.children).find((child) => child !== el && (child.offsetParent !== null || child.getAttribute("contenteditable") === "true"));
          if (visibleSibling) {
            logger.debug("Found visible sibling editor, attempting to focus/type...");
            if (visibleSibling.getAttribute("contenteditable") === "true") {
              visibleSibling.focus();
              visibleSibling.innerText = text;
              visibleSibling.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
              visibleSibling.dispatchEvent(new Event("blur", { bubbles: true, composed: true }));
              el.value = text;
              el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
              return true;
            }
          }
        }
      }
      try {
        await this._simulateTyping(el, text);
        if (el.offsetParent !== null && el.value !== text) {
          logger.warn("Failed to set input value via typing simulation.");
          return false;
        }
        logger.debug("Filled blank/textarea with:", text);
        return true;
      } catch (e) {
        logger.error("fillBlank error", e);
        return false;
      }
    }
    selectTrueFalse(subQuestion, value) {
      if (!subQuestion) return false;
      const targetElement = value ? subQuestion.trueElement : subQuestion.falseElement;
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
        (b) => b.matches('input[type="submit"]')
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
        (b) => /skip|bỏ qua/i.test(b.innerText || b.value || "")
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
      await new Promise((r) => setTimeout(r, 2e3));
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
    async applyPDFAnswer(type, answer) {
      const sidebar = document.querySelector(".userSelected");
      if (!sidebar) return false;
      const listAnswer = sidebar.querySelector(".list-answer");
      if (!listAnswer) return false;
      if (type === "mcq") {
        const letter = answer.trim().toUpperCase();
        const options = Array.from(listAnswer.querySelectorAll("span"));
        const target = options.find((s) => s.innerText.trim().toUpperCase() === letter);
        if (target) {
          this._simulateClick(target);
          return true;
        }
      } else if (type === "truefalse") {
        const values = answer.split(",").map((s) => s.trim().toUpperCase());
        const blocks = Array.from(listAnswer.querySelectorAll(".select-answer"));
        for (let i = 0; i < Math.min(values.length, blocks.length); i++) {
          const val = values[i];
          const block = blocks[i];
          const textBlocks = Array.from(block.querySelectorAll(".text-block"));
          const target = textBlocks.find(
            (tb) => val === "TRUE" && tb.innerText.includes("Đúng") || val === "FALSE" && tb.innerText.includes("Sai")
          );
          if (target) {
            this._simulateClick(target);
            await new Promise((r) => setTimeout(r, 200));
          }
        }
        return true;
      } else if (type === "shortanswer") {
        const input = listAnswer.querySelector("input, textarea");
        if (input) {
          await this._simulateTyping(input, answer);
          return true;
        }
      }
      return false;
    }
    async clickPDFSubmit() {
      const sidebar = document.querySelector(".userSelected");
      if (!sidebar) return false;
      const submitBtn = sidebar.querySelector("button.btn-primary");
      if (submitBtn) {
        this._simulateClick(submitBtn);
        await new Promise((r) => setTimeout(r, 1e3));
        return true;
      }
      return false;
    }
  }
  class Scheduler {
    constructor(task, solver2) {
      this.task = task;
      this.solver = solver2;
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
      this._runTask(false);
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
      const delay = isSuccess ? CONFIG.LOOP_INTERVAL_MS : CONFIG.LOOP_INTERVAL_MS / 2;
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
          this.idleCount++;
          if (this.idleCount >= CONFIG.IDLE_THRESHOLD) {
            logger.warn(`Scheduler: Idle for ${this.idleCount} cycles. Stopping due to inactivity.`);
            this.stop();
            this.solver.overlay.updateStatus("Finished (Timeout)", "#27ae60");
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
          this.failureCount++;
          this.idleCount = 0;
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
  class BasicUI {
    constructor(solver2) {
      this.solver = solver2;
      this.container = null;
      this.statusEl = null;
      this.isMinimized = false;
      this.init();
    }
    init() {
      if (!document.body) {
        window.addEventListener("DOMContentLoaded", () => this.init());
        return;
      }
      if (document.getElementById("hw-solver-overlay") && document.getElementById("hw-solver-styles")) {
        return;
      }
      const existingOverlay = document.getElementById("hw-solver-overlay");
      if (existingOverlay) existingOverlay.remove();
      const existingStyles = document.getElementById("hw-solver-styles");
      if (existingStyles) existingStyles.remove();
      const styles = `
            #hw-solver-overlay { position: fixed; bottom: 20px; right: 20px; width: 200px; background: #2c3e50; color: white; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; z-index: 999999; overflow: hidden; transition: all 0.3s ease; }
            #hw-solver-header { padding: 10px; background: #34495e; display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; }
            #hw-solver-status { font-size: 14px; font-weight: bold; margin-bottom: 5px; color: #ecf0f1; }
            .hw-input-group { display: flex; flex-direction: column; gap: 5px; margin-bottom: 5px; }
            .hw-input-group label { font-size: 11px; color: #bdc3c7; }
            .hw-key-input { padding: 6px; border: 1px solid #34495e; border-radius: 4px; background: #3d566e; color: white; font-size: 12px; }
            .hw-btn { padding: 8px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; transition: background 0.2s; color: white; margin-bottom: 5px; }
            .hw-btn-start { background: #27ae60; }
            .hw-btn-start:hover { background: #2ecc71; }
            .hw-btn-once { background: #2980b9; }
            .hw-btn-once:hover { background: #3498db; }
            .hw-btn-stop { background: #c0392b; }
            .hw-btn-stop:hover { background: #e74c3c; }
            .hw-btn-clear { background: #7f8c8d; }
            .hw-btn-clear:hover { background: #95a5a6; }
            #hw-solver-toggle { font-size: 12px; }
            #hw-tab-bar { display: flex; background: #34495e; border-bottom: 1px solid #2c3e50; }
            .hw-tab { flex: 1; padding: 8px; text-align: center; font-size: 11px; cursor: pointer; color: #bdc3c7; transition: all 0.2s; }
            .hw-tab.active { color: white; background: #2c3e50; border-bottom: 2px solid #3498db; }
            .hw-tab-content { padding: 15px; display: none; flex-direction: column; gap: 10px; max-height: 300px; overflow-y: auto; }
            .hw-tab-content.active { display: flex; }
            .hw-checkbox-group { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #ecf0f1; cursor: pointer; margin-top: 5px; }
            .hw-checkbox-group input { cursor: pointer; }
            .hw-footer { padding: 8px; background: #34495e; text-align: center; font-size: 10px; color: #bdc3c7; border-top: 1px solid #2c3e50; }
            .hw-footer a { color: #3498db; text-decoration: none; }
            .hw-footer a:hover { text-decoration: underline; }
            .minimized { height: 40px !important; width: 120px !important; }
            .minimized #hw-tab-bar, .minimized .hw-tab-content, .minimized .hw-footer { display: none !important; }
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
                    <input type="password" class="hw-key-input hw-config-input" data-key="POLL_KEY" id="hw-api-key" placeholder="Enter key..." value="${CONFIG.POLL_KEY}">
                    <span style="font-size: 10px; color: #bdc3c7; margin-top: -2px;">Using pollinations.ai? <a href="#" id="hw-byop-link" style="color: #3498db; text-decoration: none;">Use BYOP here!</a></span>
                </div>
                <div class="hw-input-group">
                    <label>Endpoint</label>
                    <input type="text" class="hw-key-input hw-config-input" data-key="PROXY_URL" placeholder="https://..." value="${CONFIG.PROXY_URL}">
                </div>
                <div class="hw-input-group">
                    <label>Text Model</label>
                    <input type="text" class="hw-key-input hw-config-input" data-key="DEFAULT_MODEL" value="${CONFIG.DEFAULT_MODEL}">
                </div>
                <div class="hw-input-group">
                    <label>Vision Model</label>
                     <input type="text" class="hw-key-input hw-config-input" data-key="VISION_MODEL" value="${CONFIG.VISION_MODEL}">
                 </div>
                 <div class="hw-input-group">
                     <label>Idle Threshold (Cycles)</label>
                     <input type="number" class="hw-key-input hw-config-input" data-key="IDLE_THRESHOLD" placeholder="10" value="${CONFIG.IDLE_THRESHOLD}">
                 </div>
                 <div class="hw-checkbox-group">
                    <input type="checkbox" class="hw-config-check" data-key="INSTANT_MODE" id="hw-instant-check" ${CONFIG.INSTANT_MODE ? "checked" : ""}>
                    <label for="hw-instant-check">Instant Mode</label>
                </div>
                <div class="hw-checkbox-group">
                    <input type="checkbox" class="hw-config-check" data-key="THINK_BEFORE_ANSWER" id="hw-think-check" ${CONFIG.THINK_BEFORE_ANSWER ? "checked" : ""}>
                    <label for="hw-think-check">Reasoning</label>
                </div>
            </div>
            <div class="hw-footer">
                Powered by <a href="https://pollinations.ai" target="_blank">Pollinations.ai</a>
            </div>
        `;
      document.body.appendChild(this.container);
      this.statusEl = this.container.querySelector("#hw-solver-status");
      this.container.querySelectorAll(".hw-tab").forEach((tab) => {
        tab.onclick = () => {
          this.container.querySelectorAll(".hw-tab").forEach((t) => t.classList.remove("active"));
          this.container.querySelectorAll(".hw-tab-content").forEach((c) => c.classList.remove("active"));
          tab.classList.add("active");
          this.container.querySelector(`#hw-${tab.dataset.tab}-content`).classList.add("active");
        };
      });
      this.container.querySelector("#hw-solver-header").onclick = () => this.toggleMinimize();
      this.container.querySelector("#hw-start-btn").onclick = () => this.solver.start();
      this.container.querySelector("#hw-once-btn").onclick = () => this.solver.solveOnce();
      this.container.querySelector("#hw-stop-btn").onclick = () => this.solver.stop();
      this.container.querySelector("#hw-clear-btn").onclick = () => this.solver.clearAnswers();
      this.container.querySelector("#hw-byop-link").onclick = (e) => {
        e.preventDefault();
        const authUrl = `https://enter.pollinations.ai/authorize?app_key=homework-solver&models=all&redirect_url=${encodeURIComponent(window.location.href)}`;
        window.location.href = authUrl;
      };
      this.container.querySelectorAll(".hw-config-input").forEach((input) => {
        input.onchange = (e) => {
          const key = input.dataset.key;
          let value = e.target.value.trim();
          if (key === "IDLE_THRESHOLD") {
            value = parseInt(value, 10) || 10;
            e.target.value = value;
          }
          CONFIG[key] = value;
          const storageKey = key === "POLL_KEY" ? "HW_SOLVER_API_KEY" : `HW_SOLVER_${key}`;
          localStorage.setItem(storageKey, value);
          logger.info(`${key} updated and saved.`);
          this.updateStatus("Settings Saved", "#2ecc71");
          setTimeout(() => this.updateStatus("Ready"), 2e3);
        };
      });
      this.container.querySelectorAll(".hw-config-check").forEach((check) => {
        check.onchange = (e) => {
          const key = check.dataset.key;
          const value = e.target.checked;
          CONFIG[key] = value;
          localStorage.setItem(`HW_SOLVER_${key}`, value);
          logger.info(`${key} toggled: ${value}`);
          this.updateStatus("Settings Saved", "#2ecc71");
          setTimeout(() => this.updateStatus("Ready"), 2e3);
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
  class PDFProcessor {
    constructor() {
      if (typeof pdfjsLib === "undefined") {
        logger.error("PDFProcessor: pdfjsLib is not loaded. Ensure @require matches.");
      } else {
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      }
    }
    /**
     * Converts a PDF Blob into an array of JPEG Data URLs
     * @param {Blob} blob 
     * @returns {Promise<string[]>}
     */
    async pdfToImages(blob) {
      try {
        const arrayBuffer = await blob.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const images = [];
        logger.info(`PDFProcessor: Starting conversion of ${pdf.numPages} pages.`);
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          await page.render({
            canvasContext: context,
            viewport
          }).promise;
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          images.push(dataUrl);
          logger.debug(`PDFProcessor: Rendered page ${i}/${pdf.numPages}`);
        }
        logger.info("PDFProcessor: Conversion complete.");
        return images;
      } catch (error) {
        logger.error("PDFProcessor: Error converting PDF:", error);
        throw error;
      }
    }
  }
  class HomeworkSolver {
    constructor() {
      this.api = new APIClient();
      this.scraper = new Scraper();
      this.ui = new UIController();
      this.webSearch = new WebSearch();
      this.math = mathLogic;
      this.scheduler = new Scheduler(this.solveOnce.bind(this), this);
      this.lastApiResponse = null;
      this.overlay = new BasicUI(this);
      this.pdfProcessor = new PDFProcessor();
      this.pdfAnswerKey = null;
    }
    _getGridItem(num) {
      if (!num)
        return document.querySelector(
          ".answer-sheet .option.active, .mobile-bottom-bar .number.active, .list-question span.selected"
        );
      const gridItems = document.querySelectorAll(
        ".answer-sheet .option, .mobile-bottom-bar .number, .list-question span"
      );
      return Array.from(gridItems).find(
        (el) => el.innerText.trim() === String(num)
      ) || document.querySelector(
        ".answer-sheet .option.active, .mobile-bottom-bar .number.active, .list-question span.selected"
      );
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
        ".answer-sheet .option.active, .mobile-bottom-bar .number.active, .list-question span.selected"
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
      this.pdfAnswerKey = null;
      this.overlay.updateStatus("Cleared", "#f39c12");
      setTimeout(() => this.overlay.updateStatus("Ready"), 2e3);
    }
    async solveOnce(includeSolved = true) {
      try {
        this.overlay.updateStatus("Detecting...", "#3498db");
        logger.info("Universal detection cycle started.");
        const isPDF = this.scraper.isPDFMode();
        logger.debug("PDF Mode Check:", isPDF);
        if (isPDF) {
          if (!this.pdfAnswerKey) {
            const success = await this._performPDFExtraction();
            if (!success) {
              this.overlay.updateStatus("PDF Fail", "#e74c3c");
              return false;
            }
          }
          const currentNum2 = this.scraper.getPDFQuestionNumber();
          const currentType = this.scraper.detectPDFQuestionType();
          logger.info(`PDF Question Detection - Num: ${currentNum2}, Type: ${currentType}`);
          if (!currentNum2) {
            logger.warn("PDF Mode: Could not determine current question number.");
            this.overlay.updateStatus("No Q Num", "#e74c3c");
            return false;
          }
          const answer = this.pdfAnswerKey.get(currentNum2);
          if (!answer) {
            logger.warn(`PDF Mode: No answer found in key for Q${currentNum2}`);
            this.overlay.updateStatus(`No Ans Q${currentNum2}`, "#f39c12");
            return false;
          }
          logger.info(`PDF Mode: Applying answer for Q${currentNum2} (${currentType}): ${answer}`);
          this.overlay.updateStatus(`Solving Q${currentNum2}...`, "#f39c12");
          const applied = await this.ui.applyPDFAnswer(currentType, answer);
          if (applied) {
            await new Promise((r) => setTimeout(r, CONFIG.HUMAN_DELAY_MIN));
            const submitted = await this.ui.clickPDFSubmit();
            if (submitted) {
              const gridItem = this._getGridItem(currentNum2);
              if (gridItem) gridItem.classList.add("done");
              this.overlay.updateStatus(`Q${currentNum2} Solved`, "#2ecc71");
              return true;
            }
          }
          return false;
        }
        const detected = this.scraper.detectQuestionType(includeSolved);
        if (detected.type === "unknown") {
          if (!includeSolved && this.scraper.isAssignmentFinished()) {
            this.overlay.updateStatus("Finished", "#27ae60");
            return "FINISHED";
          }
          logger.info("No questions detected.");
          this.overlay.updateStatus("No Questions", "#e74c3c");
          return "NO_QUESTION";
        }
        const container = detected.container || document;
        let currentNum = detected.number;
        let currentId = container.id || null;
        if (!currentNum) {
          const header = container.querySelector(
            ".question-header, .quetion-number, .num"
          );
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
      } catch (error) {
        logger.error("Error in solveOnce:", error);
        this.overlay.updateStatus("Error", "#e74c3c");
        return false;
      }
    }
    async _performPDFExtraction() {
      var _a, _b, _c;
      this.overlay.updateStatus("Extracting PDF...", "#9b59b6");
      try {
        const pdfUrl = this.scraper.getPDFUrl();
        if (!pdfUrl) throw new Error("Could not find PDF URL");
        logger.info("PDF Mode: Found source URL", pdfUrl);
        const res = await fetch(pdfUrl);
        const blob = await res.blob();
        this.overlay.updateStatus("Rendering PDF...", "#3498db");
        const pageImages = await this.pdfProcessor.pdfToImages(blob);
        if (!pageImages || pageImages.length === 0) {
          throw new Error("Failed to render PDF pages to images.");
        }
        const prompt = `System: You are an expert educational assistant.
Task: Analyze the attached sequence of images (which are pages from a single assignment document).
Generate a structured Answer Key in Vietnamese or English based on the document content.

Format each line exactly as: "[Number]: [Answer]"
Example:
1: A
2: B
3: Đúng
4: 15,3
...etc.

- Output ONLY the question number and the core answer. 
- Do NOT include question text or explanations.
- Reply ONLY with the Answer Key.`;
        this.overlay.updateStatus("AI Extraction...", "#f39c12");
        logger.info("PDF Mode: Sending multimodal request to AI...");
        const aiResponse = await this.api.call(prompt, pageImages);
        const content = ((_c = (_b = (_a = aiResponse == null ? void 0 : aiResponse.choices) == null ? void 0 : _a[0]) == null ? void 0 : _b.message) == null ? void 0 : _c.content) || "";
        logger.info("PDF Mode: Raw AI Response:", content);
        this.pdfAnswerKey = /* @__PURE__ */ new Map();
        const lines = content.split("\n");
        for (const line of lines) {
          const match = line.match(/^\s*(\d+)[\.\:\s-]+\s*(.+)$/i);
          if (match) {
            const num = parseInt(match[1], 10);
            const ans = match[2].trim();
            this.pdfAnswerKey.set(num, ans);
          }
        }
        if (this.pdfAnswerKey.size === 0) {
          throw new Error("AI returned an empty or unparseable Answer Key.");
        }
        logger.info(`PDF Mode: Successfully extracted ${this.pdfAnswerKey.size} answers.`);
        this.overlay.updateStatus(`Ready (${this.pdfAnswerKey.size} Ans)`, "#2ecc71");
        return true;
      } catch (e) {
        logger.error("PDF Extraction failed:", e);
        this.overlay.updateStatus("Extraction Failed", "#e74c3c");
        return false;
      }
    }
    _buildMCQPrompt(question, options, searchResult = "") {
      const thinkPrefix = CONFIG.THINK_BEFORE_ANSWER ? 'Internally use step-by-step reasoning as a reasoning model would, but do NOT reveal your chain-of-thought. Reply only with the final single-letter answer prefixed by "FINAL:" (for example: FINAL: A).\n\n' : "";
      let p = thinkPrefix + "You are a homework solver. Mathematical formulas and symbols are enclosed in [MATHJAX]...[/MATHJAX] tags. Interpret the content within these tags as mathematical expressions. Even if you are unsure or the question is ambiguous, provide your best guess by selecting one letter. Always reply with exactly one uppercase letter: A, B, C or D — nothing else, no explanations or refusals.\n\n";
      p += `Question:
${question}

`;
      if (searchResult) {
        p += `Web Search Results:
${searchResult}

`;
      }
      p += `Choices:
`;
      options.forEach((opt) => {
        p += `${opt.letter}. ${opt.text}
`;
      });
      p += "\nWhich letter is correct? Reply ONLY with A, B, C, or D.";
      return p;
    }
    _buildFillPrompt(question) {
      const thinkPrefix = CONFIG.THINK_BEFORE_ANSWER ? 'Internally use step-by-step reasoning as a reasoning model would, but do NOT reveal your chain-of-thought. After reasoning, reply only with the final short answer prefixed by "FINAL:".\n\n' : "";
      return thinkPrefix + `You are a homework solver. Mathematical formulas and symbols are enclosed in [MATHJAX]...[/MATHJAX] tags. Interpret the content within these tags as mathematical expressions. If the question is in another language, translate it to English first and then solve it step by step. Fill the blank(s) with short phrase(s) or word(s) or a number. For numerical answers, use a comma (,) as the decimal separator. Even if you are unsure or lack complete information, provide your best guess or approximation as a short phrase, word, or number. Never leave the answer blank or refuse—always fill it in. Format the answer concisely, starting with the key numerical value or phrase if applicable. Reply only with the short answer (numerical if possible), with no prefixes or suffixes. 

Question:
${question}`;
    }
    _buildShortAnswerPrompt(question) {
      const thinkPrefix = CONFIG.THINK_BEFORE_ANSWER ? 'Internally use step-by-step reasoning as a reasoning model would, but do NOT reveal your chain-of-thought. After reasoning, reply only with the final short answer prefixed by "FINAL:".\n\n' : "";
      return thinkPrefix + `You are a homework solver. Mathematical formulas and symbols are enclosed in [MATHJAX]...[/MATHJAX] tags. Interpret these as mathematical expressions. If the question is in another language, translate to English first. Solve the following question with a single concise answer. 

CRITICAL NUMERIC RULES:
- For decimal numbers, use EXACTLY ONE comma (,) as the decimal separator (e.g., 12,5).
- For whole numbers, provide the number only (e.g., 25).
- If the question asks you to choose multiple numeric options and combine them, concatenate the numbers into a single integer without spaces (e.g., choosing 1, 3, and 5 results in 135).
- Do NOT include units (e.g., kg, m, s), letters, spaces, or any other characters if the answer is a number.
- Provide ONLY the final numeric value or a very short word/phrase if it refers to a non-math concept.
- Never leave the answer blank or refuse.

Question:
${question}`;
    }
    _buildTrueFalsePrompt(question, subQuestions, table) {
      let thinkPrefix = CONFIG.THINK_BEFORE_ANSWER ? 'Internally use step-by-step reasoning as a reasoning model would, but do NOT reveal your chain-of-thought. After reasoning, reply with the final answers only prefixed by "FINAL:" followed by the comma-separated TRUE/FALSE values (example: FINAL: TRUE,FALSE,TRUE).\n\n' : "";
      let p = thinkPrefix + 'You are a homework solver. Mathematical formulas and symbols are enclosed in [MATHJAX]...[/MATHJAX] tags. Interpret the content within these tags as mathematical expressions. For each sub-question, reply with "TRUE" or "FALSE" only, separated by commas. Example: TRUE,FALSE,TRUE,TRUE\n\n';
      p += `Main Question:
${question}

`;
      if (table) {
        p += `Table Data:
${table}

`;
      }
      p += "Sub-questions:\n";
      subQuestions.forEach((sq) => {
        p += `${sq.char}) ${sq.text}
`;
      });
      p += "\nFor each sub-question (a, b, c, d), is the statement TRUE or FALSE? Reply ONLY with TRUE or FALSE for each, separated by commas.";
      return p;
    }
    _parseLetter(response) {
      var _a, _b, _c, _d, _e, _f;
      if (!response) return "";
      let content = ((_c = (_b = (_a = response == null ? void 0 : response.choices) == null ? void 0 : _a[0]) == null ? void 0 : _b.message) == null ? void 0 : _c.content) || ((_f = (_e = (_d = response == null ? void 0 : response.choices) == null ? void 0 : _d[0]) == null ? void 0 : _e.message) == null ? void 0 : _f.reasoning_content) || (response == null ? void 0 : response.answer) || (typeof response === "string" ? response : "");
      if (typeof content === "string") {
        const finalMatch = content.match(/FINAL:\s*([A-D])\b/i);
        if (finalMatch) content = finalMatch[1];
      }
      const match = content.trim().match(/([A-D])\b/);
      return match ? match[1] : "";
    }
    _parseFill(response) {
      var _a, _b, _c, _d, _e, _f;
      if (!response) return "";
      let text = ((_c = (_b = (_a = response == null ? void 0 : response.choices) == null ? void 0 : _a[0]) == null ? void 0 : _b.message) == null ? void 0 : _c.content) || ((_f = (_e = (_d = response == null ? void 0 : response.choices) == null ? void 0 : _d[0]) == null ? void 0 : _e.message) == null ? void 0 : _f.reasoning_content) || (response == null ? void 0 : response.answer) || (typeof response === "string" ? response : "");
      if (typeof text === "string") {
        const fm = text.match(/FINAL:\s*(.+)/i);
        if (fm) text = fm[1];
      }
      return text.replace(/^answer:\s*/i, "").replace(/["'`“”'']/g, "").trim();
    }
    _parseTrueFalse(response, subQuestions) {
      var _a, _b, _c;
      if (!response) return [];
      let content = ((_c = (_b = (_a = response == null ? void 0 : response.choices) == null ? void 0 : _a[0]) == null ? void 0 : _b.message) == null ? void 0 : _c.content) || (response == null ? void 0 : response.answer) || (typeof response === "string" ? response : "");
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
      options.forEach((opt) => {
        if (opt.images && opt.images.length > 0) allImages.push(...opt.images);
      });
      const uniqueImages = [...new Set(allImages)];
      let response = await this.api.call(prompt, uniqueImages);
      this.lastApiResponse = response;
      const letter = this._parseLetter(response);
      logger.info(`LLM response parsed to: '${letter}'`);
      if (!letter) {
        logger.warn("Could not determine an answer from LLM.");
        return false;
      }
      const optionToSelect = options.find((o) => o.letter.toUpperCase() === letter.toUpperCase());
      if (!optionToSelect) {
        logger.warn(`LLM suggested option '${letter}' not found.`);
        return false;
      }
      this.ui.selectOption(optionToSelect);
      await new Promise((r) => setTimeout(r, CONFIG.HUMAN_DELAY_MIN));
      const gridItem = this._getGridItem(questionData.number);
      const submitted = await this.ui.clickSubmit();
      if (submitted || !document.querySelector("button.btn-primary")) {
        await new Promise((r) => setTimeout(r, 1e3));
        if (container && container.isConnected) container.classList.add("done");
        if (gridItem) gridItem.classList.add("done");
        this.overlay.updateStatus("MCQ Solved", "#2ecc71");
        return true;
      }
      if (container && (!container.isConnected || container.classList.contains("done"))) {
        if (gridItem) gridItem.classList.add("done");
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
      logger.info(`LLM Fillable parsed to: '${answerText}'`);
      if (!answerText) return false;
      await this.ui.fillBlank(blanks[0], answerText);
      await new Promise((r) => setTimeout(r, 1e3));
      const gridItem = this._getGridItem(questionData.number);
      const submitted = await this.ui.clickSubmit();
      if (submitted || !document.querySelector("button.btn-primary")) {
        await new Promise((r) => setTimeout(r, 1e3));
        if (container && container.isConnected) container.classList.add("done");
        if (gridItem) gridItem.classList.add("done");
        this.overlay.updateStatus("Fillable Solved", "#2ecc71");
        return true;
      }
      if (container && (!container.isConnected || container.classList.contains("done"))) {
        if (gridItem) gridItem.classList.add("done");
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
      logger.info(`LLM Short Answer parsed to: '${answerText}'`);
      if (!answerText) return false;
      await this.ui.fillBlank(blanks[0], answerText);
      await new Promise((r) => setTimeout(r, 1e3));
      const gridItem = this._getGridItem(questionData.number);
      const submitted = await this.ui.clickSubmit();
      if (submitted || !document.querySelector("button.btn-primary")) {
        await new Promise((r) => setTimeout(r, 1e3));
        if (container && container.isConnected) container.classList.add("done");
        if (gridItem) gridItem.classList.add("done");
        this.overlay.updateStatus("Short Answer Solved", "#2ecc71");
        return true;
      }
      if (container && (!container.isConnected || container.classList.contains("done"))) {
        if (gridItem) gridItem.classList.add("done");
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
      logger.info(`LLM True/False parsed to: '${JSON.stringify(parsedAnswers)}'`);
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
      const gridItem = this._getGridItem(questionData.number);
      const submitted = await this.ui.clickSubmit();
      if (submitted || !document.querySelector("button.btn-primary")) {
        await new Promise((r) => setTimeout(r, 1e3));
        subQuestions.forEach((sq) => {
          if (sq.element && sq.element.isConnected) sq.element.classList.add("done");
        });
        if (container && container.isConnected) container.classList.add("done");
        if (gridItem) gridItem.classList.add("done");
        this.overlay.updateStatus("True/False Solved", "#2ecc71");
        return true;
      }
      if (container && (!container.isConnected || container.classList.contains("done"))) {
        if (gridItem) gridItem.classList.add("done");
        return true;
      }
      return false;
    }
  }
  logger.info("Initializing Homework Solver (Modular Version)...");
  if (window.location.hash.includes("api_key=")) {
    const params = new URLSearchParams(window.location.hash.substring(1));
    const apiKey = params.get("api_key");
    const allowedModels = params.get("models");
    if (apiKey) {
      localStorage.setItem("HW_SOLVER_API_KEY", apiKey);
      CONFIG.POLL_KEY = apiKey;
      logger.info("API Key automatically updated via Bring Your Own Pollen!");
      if (allowedModels) {
        const modelList = allowedModels === "all" ? ["openai"] : allowedModels.split(",").map((m) => m.trim());
        const preferredModel = modelList.includes("openai") ? "openai" : modelList[0];
        if (preferredModel) {
          localStorage.setItem("HW_SOLVER_DEFAULT_MODEL", preferredModel);
          localStorage.setItem("HW_SOLVER_VISION_MODEL", preferredModel);
          CONFIG.DEFAULT_MODEL = preferredModel;
          CONFIG.VISION_MODEL = preferredModel;
          logger.info(`Active models synchronized to: ${preferredModel}`);
        }
      }
      const newUrl = window.location.href.split("#")[0];
      window.history.replaceState({}, document.title, newUrl);
    }
  }
  const solver = new HomeworkSolver();
  window.hwSolver = {
    start: solver.start.bind(solver),
    stop: solver.stop.bind(solver),
    solveOnce: solver.solveOnce.bind(solver),
    config: CONFIG,
    logger,
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
    }
  };
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

})();