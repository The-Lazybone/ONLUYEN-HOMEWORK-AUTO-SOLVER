import { logger } from '../logger.js';

export class WebSearch {
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
