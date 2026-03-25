import { CONFIG } from '../constants.js';
import { logger } from '../logger.js';
import { mathLogic } from '../core/math-logic.js';
import { WebSearch } from './web-search.js';

export class APIClient {
    constructor() {
        this.webSearch = new WebSearch();
    }

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
                content: "You are a precise assistant. Use the 'calculate' tool for any mathematical operations using Math.js syntax to ensure accuracy. Reply exactly as asked.",
            },
            { role: "user", content: userContent },
        ];

        const headers = { "Content-Type": "application/json" };
        if (CONFIG.POLL_KEY) headers["Authorization"] = `Bearer ${CONFIG.POLL_KEY}`;

        let retryCount = 0;
        const maxToolTurns = 5;

        while (retryCount < maxToolTurns) {
            const payload = {
                model: modelToUse,
                reasoning_effort: CONFIG.THINK_BEFORE_ANSWER ? "high" : (CONFIG.INSTANT_MODE ? "low" : "medium"),
                messages: messages,
                temperature: 1,
                tools: tools,
                tool_choice: "auto",
            };

            // Start by assuming max_completion_tokens is supported for thinking models
            if (CONFIG.THINK_BEFORE_ANSWER) {
                payload.max_completion_tokens = 65535;
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
                    signal: controller.signal,
                });

                // If it fails because both are somehow specified or max_completion_tokens is unsupported
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
                            signal: controller.signal,
                        });

                        if (!res.ok) {
                            const newTxt = await res.text().catch(() => "");
                            throw new Error(`HTTP ${res.status}: ${newTxt}`);
                        }
                    } else {
                        throw new Error(`HTTP ${res.status}: ${txt}`);
                    }
                }

                const response = await res.json();
                const message = response.choices?.[0]?.message;

                if (!message) return response;

                if (message.tool_calls && message.tool_calls.length > 0) {
                    messages.push(message);

                    for (const toolCall of message.tool_calls) {
                        const functionName = toolCall.function.name;
                        const args = JSON.parse(toolCall.function.arguments);
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
                            content: result,
                        });
                    }
                    retryCount++;
                    continue;
                }

                return response;
            } finally {
                clearTimeout(timeoutId);
            }
        }

        throw new Error("Exceeded maximum tool call turns");
    }
}
