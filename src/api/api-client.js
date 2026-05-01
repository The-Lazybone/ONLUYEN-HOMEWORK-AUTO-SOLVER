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
        const maxToolTurns = 50; // Increased for complex math

        while (retryCount < maxToolTurns) {
            const payload = {
                model: modelToUse,
                reasoning_effort: CONFIG.THINK_BEFORE_ANSWER ? "high" : (CONFIG.INSTANT_MODE ? "low" : "medium"),
                messages: messages,
                temperature: 1,
                tools: tools,
                tool_choice: "auto",
                stream: true,
            };

            if (CONFIG.THINK_BEFORE_ANSWER) {
                payload.max_completion_tokens = 128000;
                payload.thinking = {
                    type: "enabled",
                    budget_tokens: 128000
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
                    signal: controller.signal,
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

                // Parse Stream
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
                            const delta = chunk.choices?.[0]?.delta;
                            if (!delta) continue;

                            if (delta.content) fullMessage.content += delta.content;
                            if (delta.reasoning_content) {
                                // Potentially log or accumulate reasoning
                                // We'll just ignore for now as the core app expects content
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
                                    if (tc.function?.name) target.function.name += tc.function.name;
                                    if (tc.function?.arguments) target.function.arguments += tc.function.arguments;
                                }
                            }
                        } catch (e) {
                            // Ignore parse errors for incomplete chunks
                        }
                    }
                }

                // Filter out null/empty tool calls
                fullMessage.tool_calls = fullMessage.tool_calls.filter(Boolean);

                const response = { choices: [{ message: fullMessage }] };
                const message = response.choices[0].message;

                if (!message.content && message.tool_calls.length === 0) {
                    return response;
                }

                // Handle Tool Calls
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
                            content: result,
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
        // If we hit the limit, return the last assistant message we have
        const lastAssistantMessageIdx = messages.findLastIndex(m => m.role === "assistant");
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
            body: formData,
        });

        if (!response.ok) {
            const txt = await response.text().catch(() => "");
            throw new Error(`Upload failed HTTP ${response.status}: ${txt}`);
        }

        return await response.json();
    }
}
