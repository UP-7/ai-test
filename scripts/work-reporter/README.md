# 📝 Work Reporter — 分支工作总结 CLI

> ⚠️ **日常使用推荐** Chat 里 `@work-reporter`（Agent 模式），本 CLI 适用于 CI/CD 定时任务或批量处理场景。

独立运行的 Git 分支深度总结工具，**不依赖 CodeBuddy**。调用 DeepSeek API 分析代码变更，生成含关键代码实现的专业工作总结。

## 核心特性

- 🔄 **精进模式**：同一分支多次运行，自动只分析新 commit 并合并到已有文档
- 📝 **深度代码分析**：每个改动包含"问题 → 方案 → 关键代码片段"
- 📄 **多格式输出**：Markdown + Word（.doc）
- 📚 **知识库自动更新**：按分支块替换，不堆叠重复
- ⚡ **零配置**：复用项目 `.env.local` 中的 DeepSeek Key

## 快速开始

### 1. 确保环境变量已配置

`.env.local` 中需要有：

```env
LLM_API_KEY='你的 DeepSeek API Key'
# 可选
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
```

### 2. 安装 tsx（如果还没装）

```bash
npm install -D tsx
# 或
pnpm add -D tsx
```

### 3. 运行

```bash
# 总结当前分支（首次全量，后续自动精进）
npm run report

# 强制全量重来
npm run report:fresh

# 指定分支
npx tsx scripts/work-reporter/index.ts --branch feature/login

# 跳过 Word 生成
npx tsx scripts/work-reporter/index.ts --no-word
```

## 命令行选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--branch <name>` | 指定分支名 | 当前分支 |
| `--repo <path>` | 指定仓库路径 | 项目根目录 |
| `--fresh` | 强制全量重来 | 增量精进 |
| `--no-word` | 跳过 Word 生成 | 生成 |
| `--help` | 显示帮助 | - |

## 精进模式工作原理

```
第 1 次运行 → 全量分析所有 commit → 生成 work-report-<slug>.md
  ↓
继续开发，新增若干 commit
  ↓
第 2 次运行 → 读取旧文档 → 只分析新 commit → 合并到已有总结
  ↓
继续开发...
  ↓
第 N 次运行 → 持续精进，文档越来越完整
```

判定依据：文档 frontmatter 中的 `last_commit` 与当前 HEAD 对比。

## 输出结构

```
work-reports/
├── work-report-<slug>.md    # Markdown 文档（带 frontmatter）
└── work-report-<slug>.doc   # Word 文档（样式化 HTML）

.requirement-knowledge.md     # 知识库（按 slug 块替换）
```

### 文档结构

```markdown
---
branch: feature/yanqihuan/test/20260721
slug: feature-yanqihuan-test-20260721
last_commit: abc123...
revision: 3
created_at: 2026-07-21
updated_at: 2026-07-27
---

# 需求名称
## 基本信息
## 需求背景
## 做了什么
## 详细改动与实现
  ### 模块1（含问题、方案、关键代码）
  ### 模块2
## 技术实现亮点（含代码）
## 踩坑与解法
## 更新历史（表格）
## 关键词标签
```

## 技术栈

- **TypeScript** — 类型安全
- **DeepSeek API** — LLM 分析（兼容 OpenAI 格式）
- **原生 Git 命令** — 零依赖收集变更
- **HTML → Word** — 轻量 Word 生成方案

## 与 CodeBuddy Agent 的区别

| | CodeBuddy Agent | 本 CLI |
|---|---|---|
| 运行环境 | IDE 插件内 | 终端/CI |
| 依赖 | CodeBuddy 运行时 | 只需 Node.js + tsx |
| 触发方式 | `@work-reporter` | `npm run report` |
| LLM 调用 | 走 CodeBuddy 内置 | 直接调 DeepSeek API |
| 适用场景 | IDE 内交互 | CI/CD、定时任务、脚本化 |

## FAQ

**Q: 可以用 OpenAI / 其他模型吗？**
A: 可以，只要兼容 OpenAI API 格式。改 `LLM_BASE_URL` 和 `LLM_MODEL` 即可。

**Q: 精进时旧内容会丢失吗？**
A: 不会。增量模式只追加新内容，不删除已有分析。

**Q: 知识库里旧的追加条目怎么办？**
A: 首次用新版后，该分支的条目会用块标记管理，后续都是原地替换。

**Q: 能集成到 CI/CD 吗？**
A: 完全可以，比如在 PR merge 后自动跑一次总结。
