import { tool } from "ai";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const searchTool: any = tool({
    description: "搜索互联网获取实时信息。当用户问最新新闻、版本号、实时数据时使用。",
    parameters: z.object({
        query: z.string().describe("搜索关键词，例如：'React 最新版本'"),
    }),
    inputExamples: [{ query: "React latest version" }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (input: any) => {
        const query: string = input.query || "";
        console.log(`[search] 搜索: "${query}"`);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        try {
            const response = await fetch("https://api.tavily.com/search", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${process.env.TAVILY_API_KEY}`,
                },
                body: JSON.stringify({
                    query,
                    search_depth: "basic",
                    include_answer: true,
                    max_results: 3,
                }),
                signal: controller.signal,
            });
            clearTimeout(timeout);

            if (!response.ok) {
                return { query, error: `搜索服务不可用（HTTP ${response.status}），请稍后重试` };
            }

            const data = await response.json();
            console.log(`[search] Tavily 返回: answer=${!!data.answer}, results=${data.results?.length || 0}条`);

            return {
                query,
                answer: data.answer || "",
                results: (data.results || []).map((r: { title: string; content: string; url: string }) => ({
                    title: r.title,
                    content: r.content,
                    url: r.url,
                })),
            };
        } catch (e) {
            clearTimeout(timeout);
            if ((e as Error).name === "AbortError") {
                return { query, error: "搜索超时，请稍后重试" };
            }
            return { query, error: `网络异常: ${(e as Error).message}` };
        }
    },
});
