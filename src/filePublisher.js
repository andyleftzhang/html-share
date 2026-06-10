import { marked } from 'marked'

export function detectFileKind(fileName) {
  const normalized = fileName.toLowerCase()

  if (normalized.endsWith('.html') || normalized.endsWith('.htm')) {
    return 'html'
  }

  if (normalized.endsWith('.md') || normalized.endsWith('.markdown')) {
    return 'markdown'
  }

  throw new Error('Only HTML and Markdown files are supported.')
}

export function markdownDocument(markdownHtml) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Markdown Share Page</title>
    <style>
      :root {
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #172033;
        background: #f8fafc;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        padding: clamp(24px, 6vw, 72px);
        background:
          radial-gradient(circle at top left, rgba(16, 185, 129, 0.12), transparent 32rem),
          #f8fafc;
      }

      article {
        width: min(100%, 820px);
        margin: 0 auto;
        padding: clamp(26px, 5vw, 56px);
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.9);
        box-shadow: 0 22px 70px rgba(15, 23, 42, 0.10);
      }

      h1, h2, h3 {
        color: #0f172a;
        line-height: 1.16;
      }

      h1 {
        margin: 0 0 24px;
        font-size: clamp(34px, 6vw, 56px);
      }

      h2 {
        margin-top: 40px;
        font-size: 28px;
      }

      p, li {
        color: #475569;
        font-size: 18px;
        line-height: 1.8;
      }

      a {
        color: #059669;
      }

      pre {
        overflow: auto;
        padding: 18px;
        border-radius: 14px;
        color: #e2e8f0;
        background: #0f172a;
      }

      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }

      :not(pre) > code {
        padding: 2px 6px;
        border-radius: 6px;
        color: #047857;
        background: #d1fae5;
      }
    </style>
  </head>
  <body>
    <article>
      ${markdownHtml}
    </article>
  </body>
</html>`
}

export async function buildPublishHtml(content, kind) {
  if (kind === 'html') {
    return content
  }

  if (kind === 'markdown') {
    return markdownDocument(await marked.parse(content))
  }

  throw new Error('Unsupported file type.')
}
