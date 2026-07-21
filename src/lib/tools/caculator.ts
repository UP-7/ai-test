import { tool } from "ai";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const caculatorTool: any = tool({
    description: "执行数学计算，支持加减乘除、括号、乘方等，例如：'3.14 * 2'、'(30 * 9/5) + 32'",
    parameters: z.object({
        expression: z.string().describe("数学表达式"),
    }),
    inputExamples: [{ expression: "3.14 * 2" }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (input: any) => {
        const expr: string = input.expression || "";

        // 安全检查：只允许数字、空格、基本运算符
        const allowed = /^[\d\s+\-*/().,%^eE]+$/;
        if (!allowed.test(expr)) {
            return { error: `表达式包含不允许的字符: "${expr}"，仅支持数字和基本运算符` };
        }

        try {
            const result = new Function(`return (${expr})`)();
            // 防止返回无穷大或 NaN
            if (!isFinite(result)) {
                return { expression: expr, error: "计算结果无效（除零或溢出）" };
            }
            return { expression: expr, result };
        } catch (e) {
            return { expression: expr, error: `计算失败: ${(e as Error).message}` };
        }
    },
});
