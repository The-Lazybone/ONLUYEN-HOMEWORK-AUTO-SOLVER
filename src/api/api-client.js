import { CONFIG } from '../constants.js';
import { logger } from '../logger.js';

export class APIClient {
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
