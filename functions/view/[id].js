function notFoundPage(siteId) {
  const escapedId = String(siteId || '').replace(/[<>&"']/g, (char) => {
    const entities = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return entities[char]
  })

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>页面不存在或已过期</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        color: #111827;
        background:
          radial-gradient(circle at 15% 20%, rgba(16, 185, 129, 0.16), transparent 28rem),
          radial-gradient(circle at 85% 80%, rgba(59, 130, 246, 0.13), transparent 28rem),
          #f8fafc;
      }

      main {
        width: min(92vw, 520px);
        padding: 42px;
        border: 1px solid rgba(148, 163, 184, 0.35);
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.86);
        box-shadow: 0 24px 70px rgba(15, 23, 42, 0.12);
        text-align: center;
      }

      .mark {
        width: 64px;
        height: 64px;
        margin: 0 auto 24px;
        display: grid;
        place-items: center;
        border-radius: 18px;
        color: #059669;
        background: #d1fae5;
        font-size: 30px;
        font-weight: 800;
      }

      h1 {
        margin: 0 0 12px;
        font-size: clamp(28px, 5vw, 38px);
        line-height: 1.1;
      }

      p {
        margin: 0;
        color: #64748b;
        line-height: 1.7;
      }

      code {
        display: inline-block;
        margin-top: 18px;
        padding: 8px 12px;
        border-radius: 999px;
        color: #475569;
        background: #f1f5f9;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 13px;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="mark">404</div>
      <h1>页面不存在或已过期</h1>
      <p>这个分享页面可能已经超过 7 天有效期，或者链接 ID 输入有误。</p>
      ${escapedId ? `<code>ID: ${escapedId}</code>` : ''}
    </main>
  </body>
</html>`
}

function htmlHeaders() {
  return {
    'Content-Type': 'text/html;charset=UTF-8',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  }
}

export async function onRequestGet(context) {
  const siteId = context.params.id
  const htmlCode = await context.env.MY_KV.get(siteId)

  if (!htmlCode) {
    return new Response(notFoundPage(siteId), {
      status: 404,
      headers: htmlHeaders(),
    })
  }

  return new Response(htmlCode, {
    headers: htmlHeaders(),
  })
}

export async function onRequest(context) {
  if (context.request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  return onRequestGet(context)
}
