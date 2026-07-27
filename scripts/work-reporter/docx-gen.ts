/**
 * Word 文档生成模块
 * 将 Markdown 内容转为带样式的 .docx 文件
 *
 * 注意：使用轻量方案 — 生成的是带样式的 HTML 保存为 .doc（Word 可正常打开）
 * 如果需要原生 .docx，后续可引入 docx 包
 */
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { config } from './config';

/**
 * 将 Markdown 内容生成为 Word 兼容的 HTML 文件（.doc）
 * Word 可以直接打开 .doc 格式的 HTML
 */
export function generateWordDoc(markdownContent: string, slug: string): string {
  const outputPath = resolve(config.outputDir, `work-report-${slug}.doc`);

  const htmlContent = markdownToStyledHtml(markdownContent);
  const wordHtml = wrapInWordTemplate(htmlContent);

  writeFileSync(outputPath, wordHtml, 'utf-8');
  return outputPath;
}

/**
 * 简易 Markdown → HTML 转换（覆盖工作总结常用语法）
 */
function markdownToStyledHtml(md: string): string {
  let html = md;

  // 去掉 frontmatter
  if (html.startsWith('---')) {
    const endIdx = html.indexOf('---', 3);
    if (endIdx > -1) {
      html = html.slice(endIdx + 3).trim();
    }
  }

  // 代码块
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    const escapedCode = escapeHtml(code.trim());
    return `<div class="code-label">${lang || 'code'}</div><pre class="code-block"><code>${escapedCode}</code></pre>`;
  });

  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // 标题
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // 粗体
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // 列表项
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  // 把连续的 li 包裹成 ul
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // 表格（简易处理）
  html = html.replace(/^\|(.+)\|$/gm, (_, row) => {
    const cells = row.split('|').map((c: string) => c.trim());
    const tds = cells.map((c: string) => `<td>${c}</td>`).join('');
    return `<tr>${tds}</tr>`;
  });
  // 去掉分隔行
  html = html.replace(/<tr><td>-+<\/td>.*?<\/tr>/g, '');
  // 包裹 table
  html = html.replace(/((?:<tr>.*<\/tr>\n?)+)/g, '<table>$1</table>');

  // 段落：连续非标签行
  html = html.replace(/^(?!<[a-z])((?!\s*$).+)$/gm, '<p>$1</p>');

  // 引用
  html = html.replace(/<p>&gt; (.+)<\/p>/g, '<blockquote>$1</blockquote>');

  // 水平线
  html = html.replace(/^---$/gm, '<hr/>');

  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 包裹成 Word 可识别的 HTML 模板
 */
function wrapInWordTemplate(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<meta name="ProgId" content="Word.Document">
<meta name="Generator" content="work-reporter">
<!--[if gte mso 9]>
<xml>
<w:WordDocument>
<w:View>Print</w:View>
</w:WordDocument>
</xml>
<![endif]-->
<style>
  @page {
    size: A4;
    margin: 2cm 2.5cm;
  }
  body {
    font-family: '微软雅黑', 'Microsoft YaHei', Arial, sans-serif;
    font-size: 11pt;
    color: #333333;
    line-height: 1.6;
  }
  h1 {
    font-size: 22pt;
    font-weight: bold;
    color: #1F4E79;
    text-align: center;
    margin-bottom: 12pt;
    border-bottom: 2px solid #1F4E79;
    padding-bottom: 8pt;
  }
  h2 {
    font-size: 16pt;
    font-weight: bold;
    color: #1F4E79;
    border-bottom: 1px solid #ddd;
    padding-bottom: 4pt;
    margin-top: 18pt;
    margin-bottom: 8pt;
  }
  h3 {
    font-size: 13pt;
    font-weight: bold;
    color: #2E75B6;
    margin-top: 10pt;
    margin-bottom: 6pt;
  }
  p {
    margin-bottom: 4pt;
  }
  strong {
    color: #1F4E79;
  }
  .code-label {
    font-size: 9pt;
    color: #666666;
    margin-top: 6pt;
    margin-bottom: 2pt;
  }
  .code-block {
    background-color: #F5F5F5;
    border: 1px solid #E0E0E0;
    border-radius: 4px;
    padding: 10px 12px;
    font-family: Consolas, 'Courier New', monospace;
    font-size: 10pt;
    line-height: 1.4;
    overflow-x: auto;
    margin-bottom: 6pt;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
  .inline-code {
    background-color: #F0F0F0;
    padding: 1px 4px;
    border-radius: 3px;
    font-family: Consolas, monospace;
    font-size: 10pt;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 8pt 0;
  }
  table tr:first-child {
    background-color: #1F4E79;
    color: white;
    font-weight: bold;
  }
  table tr:nth-child(even) {
    background-color: #F8F9FA;
  }
  td {
    border: 1px solid #DEE2E6;
    padding: 6px 10px;
    font-size: 10pt;
  }
  blockquote {
    border-left: 4px solid #2E75B6;
    padding-left: 12px;
    color: #666666;
    font-style: italic;
    margin: 8pt 0;
  }
  ul {
    margin: 4pt 0;
    padding-left: 20pt;
  }
  li {
    margin-bottom: 2pt;
  }
  hr {
    border: none;
    border-top: 1px solid #E0E0E0;
    margin: 12pt 0;
  }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}
