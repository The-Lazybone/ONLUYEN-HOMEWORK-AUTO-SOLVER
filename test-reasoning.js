// No dependencies needed for Node 18+

const CONFIG = {
    PROXY_URL: "https://gen.pollinations.ai/v1/chat/completions",
    MODEL: "gemini-search", // Your default model
};

async function testReasoning() {
    console.log(`Testing reasoning on model: ${CONFIG.MODEL}...`);

    const payload = {
        model: CONFIG.MODEL,
        messages: [
            {
                role: "user",
                content:
                    "Sally has 3 brothers. Each brother has 2 sisters. How many sisters does Sally have? Think step by step.",
            },
        ],
        thinking: {
            type: "enabled",
            budget_tokens: 16000,
        },
        max_tokens: 20000,
    };

    try {
        const response = await fetch(CONFIG.PROXY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Error: ${response.status} - ${errorText}`);
            return;
        }

        const data = await response.json();
        const message = data.choices?.[0]?.message;

        console.log("\n--- Full Response Data ---");
        console.log(JSON.stringify(data, null, 2));

        console.log("\n--- Conclusion ---");
        if (message?.reasoning_content) {
            console.log("✅ SUCCESS: Found 'reasoning_content' field!");
            console.log(
                "Reasoning snippet:",
                message.reasoning_content.substring(0, 200) + "..."
            );
        } else if (
            message?.content &&
            (message.content.includes("Step 1") || message.content.length > 200)
        ) {
            console.log(
                "⚠️ PARTIAL: No dedicated 'reasoning_content' field, but the model is writing out its thoughts in 'content'."
            );
        } else {
            console.log(
                "❌ FAILURE: No reasoning detected. The model might not support the 'thinking' parameter or budget_tokens."
            );
        }
    } catch (error) {
        console.error("Network or Parsing Error:", error);
    }
}

testReasoning();
