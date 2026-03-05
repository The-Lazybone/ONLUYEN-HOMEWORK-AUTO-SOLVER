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
                    description: "Evaluate a mathematical expression using MathJS. Useful for complex arithmetic, algebra, and calculus.",
                    parameters: {
                        type: "object",
                        properties: {
                            expression: {
                                type: "string",
                                description: "The math expression to evaluate (e.g., '2 + 2', 'sqrt(16)', 'solve(2x = 4, x)')"
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
                content: "You are a precise assistant. Use the 'calculate' tool for any mathematical operations to ensure accuracy. Reply exactly as asked.",
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
                max_tokens: 4096, // Safe limit for non-streaming requests
                temperature: 1,
                tools: tools,
                tool_choice: "auto",
            };

            // Use max_completion_tokens if using reasoning models (if THINK_BEFORE_ANSWER is on)
            if (CONFIG.THINK_BEFORE_ANSWER) {
                payload.max_completion_tokens = 65535;
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.PROXY_TIMEOUT_MS);

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
