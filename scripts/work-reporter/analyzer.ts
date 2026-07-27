/**
 * LLM 分析模块
 * 调用 DeepSeek API 分析 Git diff，生成结构化的工作总结
 */
import { config } from './config';
import type { BranchInfo } from './git';

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 调用 DeepSeek/OpenAI 兼容 API
 */
async function callLLM(messages: LLMMessage[], maxTokens = 8000): Promise<string> {
  const url = `${config.baseUrl}/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: maxTokens,
      // deepseek-reasoner(R1) 建议 temperature=0；deepseek-chat 用 0.3
      temperature: config.model.includes('reasoner') ? 0 : 0.3,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LLM API 调用失败 (${response.status}): ${errText}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  return data.choices[0]?.message?.content ?? '';
}

/**
 * 全量分析：从 0 生成完整的工作总结
 */
export async function analyzeFullBranch(info: BranchInfo): Promise<string> {
  const systemPrompt = `你是一位资深技术 Leader，擅长从代码变更中提炼业务价值和技术深度。
你的核心能力是：看懂代码的"为什么"而非仅仅"改了什么"。

## 分析原则

1. **禁止输出以下无意义信息**：
   - ❌ "修改了 XX 文件"、"增加了 XX 行代码"、"新增了 XX 方法"
   - ❌ 单纯罗列文件名或函数名，没有解释其业务意义
   - ❌ "优化了代码结构"、"改善了代码质量" 等空话

2. **必须输出以下有深度的分析**：
   - ✅ 这个改动解决了什么业务问题或技术痛点？（痛点先行）
   - ✅ 方案的核心设计思路是什么？为什么选择这个方案而不是其他方案？
   - ✅ 实现中的难点是什么？怎么克服的？
   - ✅ 有哪些巧妙的技术设计值得复用？

3. **代码片段使用原则**：
   - 只展示能体现设计思想的核心代码（10-25行），必须标注文件路径
   - 每段代码前必须有一句话说明"这段代码巧妙在哪里/解决了什么难题"
   - 代码必须来自真实 diff

4. **难点亮点识别标准**：
   - 性能优化（算法选择、缓存策略、批处理）
   - 架构设计（解耦、扩展性、设计模式）
   - 边界处理（并发、容错、降级）
   - 工程化（自动化、开发体验、可维护性）
   - 业务建模（抽象能力、状态机、复杂逻辑编排）`;

  const userPrompt = buildAnalysisPrompt(info, 'full');

  const result = await callLLM([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], 12000);

  return result;
}

/**
 * 增量分析：只分析新增 commit，返回增量内容
 */
export async function analyzeIncrementalChanges(
  info: BranchInfo,
  existingDoc: string
): Promise<string> {
  const systemPrompt = `你是一位资深技术 Leader，擅长从代码变更中提炼业务价值和技术深度。

## 分析原则（严格遵守）

**禁止输出**：
- "修改了 XX 文件"、"增加了 XX 行"、"新增了 XX 函数" 等表面描述
- 没有业务含义的代码罗列
- "优化了代码"、"改善了结构" 等空话

**必须输出**：
- 这次改动的业务意图和技术价值
- 实现中的设计思路和技术决策
- 遇到了什么难点，如何巧妙解决
- 关键代码片段必须说明"巧妙在哪里"

你之前已经对这个分支做过总结（下面会给你旧文档），现在分支有新的 commit。

你的任务：
1. 只分析新增的改动，不要重复旧文档内容
2. 从"做了什么 → 为什么难 → 怎么解决"的角度深入分析
3. 代码片段必须来自真实 diff，标注文件路径

输出一个 JSON 对象：
{
  "summary_update": "用1-2句有力的话概括本次新增改动的核心价值（示例：'新增了流式响应机制，解决了大模型回复等待过久的用户体验问题'）",
  "new_modules": [
    {
      "name": "功能/模块名",
      "problem": "解决了什么具体的业务问题或技术痛点？（不是'新增了XX'，而是'用户遇到XX问题'）",
      "solution": "设计思路是什么？为什么选择这个方案？核心架构/流程",
      "code": "最能体现设计思想的关键代码（10-25行，标注文件路径）",
      "reason": "对比其他可选方案，为什么这样做是最优解"
    }
  ],
  "new_highlights": [
    {
      "title": "亮点标题（动宾结构，如'基于XX实现YY'）",
      "scenario": "什么场景下会遇到这个挑战",
      "approach": "技术方案的核心思路，难在哪里、怎么克服",
      "code": "代码片段（标注文件路径，说明巧妙之处）",
      "reusability": "这个方案能推广到什么其他场景"
    }
  ],
  "new_pitfalls": [
    {
      "title": "踩坑标题",
      "symptom": "表面现象是什么",
      "root_cause": "底层根因（深入到原理层面）",
      "fix": "解法思路 + 关键代码",
      "code": "修复代码（如有）"
    }
  ],
  "change_log_entry": "一句话概要：做了什么（功能），解决了什么（价值）"
}`;

  const userPrompt = `## 旧文档内容（前 3000 字）

${existingDoc.slice(0, 3000)}

## 本次新增的变更

${buildAnalysisPrompt(info, 'incremental')}

重要：请严格输出一个合法的 JSON 对象，不要有任何前缀文字、解释或 markdown 代码块包裹。直接以 { 开头，以 } 结尾。`;

  const result = await callLLM([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], 8000);

  return result;
}

/**
 * 构建分析 prompt
 */
function buildAnalysisPrompt(info: BranchInfo, mode: 'full' | 'incremental'): string {
  const sections: string[] = [];

  sections.push(`## 分支信息
- 分支名：${info.name}
- Commit 数量：${info.commits.length}
- 模式：${mode === 'full' ? '全量分析' : '增量分析（只分析新 commit）'}`);

  // Commit 历史
  sections.push(`## Commit 历史
${info.commits.map(c => `- ${c.hash.slice(0, 7)} (${c.date}) ${c.message}`).join('\n')}`);

  // 改动统计
  sections.push(`## 改动统计
${info.diffStat}`);

  // 变更文件列表
  sections.push(`## 变更文件
${info.changedFiles.join('\n')}`);

  // 详细 diff
  sections.push(`## 核心文件详细 Diff`);
  for (const { file, diff } of info.detailedDiffs) {
    sections.push(`### ${file}
\`\`\`diff
${diff.slice(0, 4000)}
\`\`\``);
  }

  if (mode === 'full') {
    sections.push(`## 输出要求

请按以下结构输出完整的工作总结 Markdown 文档（不含 frontmatter，我会自己加）：

### 结构要求：

# 需求/项目名称（从代码意图推断，用一个精炼的名称概括本次开发）

## 概览
- 仓库路径、分支、开发周期、技术栈
- **一句话总结**：用一句有力的话概括本次开发的核心价值（示例："从零搭建了支持多轮对话、工具调用、记忆持久化的 AI Chat 系统"）

## 做了什么（核心产出）
用 3-5 个 bullet point 描述核心产出，每条需要体现：
- 做了什么功能/系统（WHAT）
- 为什么要做（WHY，解决什么痛点）
- 效果如何（RESULT，量化或定性）

示例格式：
- **实现了 XX 系统/功能**：解决了 YY 痛点，使得 ZZ（效果）

## 核心技术方案与实现
按功能模块组织，每个模块包含：
### 模块名
**问题/挑战**：遇到了什么难题？为什么不能用简单方案？
**方案设计**：设计思路是什么？核心架构/流程是怎样的？
**关键实现**：（附代码片段）
**为什么这样做**：对比其他可选方案，解释技术决策

## 技术难点与亮点
每个亮点/难点按以下格式：
### 亮点/难点标题
- **场景**：什么情况下会遇到
- **难在哪里**：为什么这个问题不好解决
- **解法**：核心思路 + 关键代码
- **效果**：解决后带来的收益
- **可复用性**：这个方案能否推广到其他场景

## 踩坑记录（如有）
### 坑的标题
- **现象**：出了什么问题
- **排查过程**：怎么定位的
- **根因**：底层原因是什么
- **解法**：如何修复 + 代码
- **教训**：未来如何避免

## 关键词标签`);
  }

  return sections.join('\n\n');
}
