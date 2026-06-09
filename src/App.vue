<script setup>
import { computed, ref } from 'vue'
import { marked } from 'marked'

const inputType = ref('html')
const content = ref(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>我的分享页面</title>
    <style>
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        font-family: system-ui, sans-serif;
        color: #0f172a;
        background: #f8fafc;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Hello, HTML Share!</h1>
      <p>把这段代码换成你的作品，然后生成分享链接。</p>
    </main>
  </body>
</html>`)
const generatedUrl = ref('')
const errorMessage = ref('')
const isLoading = ref(false)
const copied = ref(false)

const lineNumbers = computed(() => {
  const count = Math.max(content.value.split('\n').length, 12)
  return Array.from({ length: count }, (_, index) => index + 1).join('\n')
})

function markdownDocument(markdownHtml) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Markdown 分享页面</title>
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

async function readJsonResponse(response) {
  const responseText = await response.text()

  if (!responseText) {
    return {}
  }

  try {
    return JSON.parse(responseText)
  } catch {
    throw new Error('当前环境没有返回 API JSON。请用 npm run pages:dev 启动 Cloudflare Pages Functions 后再生成链接。')
  }
}

async function createShareLink() {
  errorMessage.value = ''
  generatedUrl.value = ''
  copied.value = false

  if (!content.value.trim()) {
    errorMessage.value = '请先粘贴 HTML 或 Markdown 内容。'
    return
  }

  isLoading.value = true

  try {
    const htmlCode =
      inputType.value === 'markdown'
        ? markdownDocument(await marked.parse(content.value))
        : content.value

    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ htmlCode }),
    })

    const data = await readJsonResponse(response)

    if (!response.ok) {
      throw new Error(data.error || '生成链接失败，请稍后重试。')
    }

    generatedUrl.value = data.url
  } catch (error) {
    errorMessage.value = error.message || '生成链接失败，请稍后重试。'
  } finally {
    isLoading.value = false
  }
}

async function copyLink() {
  if (!generatedUrl.value) return

  await navigator.clipboard.writeText(generatedUrl.value)
  copied.value = true
  window.setTimeout(() => {
    copied.value = false
  }, 1800)
}
</script>

<template>
  <main class="min-h-screen overflow-hidden bg-slate-50 text-slate-950">
    <div class="pointer-events-none fixed inset-0">
      <div class="absolute left-[-120px] top-[-120px] h-80 w-80 rounded-full bg-emerald-200/40 blur-3xl"></div>
      <div class="absolute bottom-[-160px] right-[-120px] h-96 w-96 rounded-full bg-sky-200/40 blur-3xl"></div>
    </div>

    <section class="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-8 sm:px-8 lg:px-10">
      <header class="flex flex-col gap-3 border-b border-slate-200/80 pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 class="text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
            ⚡️ 3秒一键网页托管
          </h1>
          <p class="mt-3 max-w-2xl text-base leading-7 text-slate-600">
            粘贴纯 HTML 或 Markdown，一次点击生成 7 天有效的 Cloudflare Pages 分享页面。
          </p>
        </div>
        <div class="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          同源 API · KV 临时存储
        </div>
      </header>

      <div class="grid flex-1 gap-6 py-8 lg:grid-cols-[1fr_360px]">
        <section class="rounded-lg border border-slate-200 bg-white shadow-soft">
          <div class="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
            <label class="flex flex-col gap-2 text-sm font-medium text-slate-700">
              输入类型
              <select
                v-model="inputType"
                class="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              >
                <option value="html">纯 HTML 代码</option>
                <option value="markdown">Markdown 文本</option>
              </select>
            </label>

            <button
              type="button"
              :disabled="isLoading"
              class="inline-flex h-11 items-center justify-center rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-300 disabled:cursor-not-allowed disabled:bg-slate-400"
              @click="createShareLink"
            >
              <span v-if="isLoading">生成中...</span>
              <span v-else>生成分享链接</span>
            </button>
          </div>

          <div class="grid min-h-[560px] grid-cols-[56px_1fr] overflow-hidden rounded-b-lg bg-slate-950">
            <pre class="select-none overflow-hidden border-r border-white/10 bg-slate-900 px-4 py-5 text-right text-sm leading-6 text-slate-500">{{ lineNumbers }}</pre>
            <textarea
              v-model="content"
              spellcheck="false"
              class="min-h-[560px] resize-none bg-slate-950 px-5 py-5 font-mono text-sm leading-6 text-slate-100 caret-emerald-300 outline-none placeholder:text-slate-500"
              placeholder="在这里粘贴你的 HTML 代码或 Markdown 文本..."
            ></textarea>
          </div>
        </section>

        <aside class="flex flex-col gap-4">
          <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
            <h2 class="text-lg font-semibold text-slate-950">分享设置</h2>
            <dl class="mt-5 space-y-4 text-sm">
              <div class="flex items-center justify-between gap-4">
                <dt class="text-slate-500">有效期</dt>
                <dd class="font-medium text-slate-900">7 天</dd>
              </div>
              <div class="flex items-center justify-between gap-4">
                <dt class="text-slate-500">渲染方式</dt>
                <dd class="font-medium text-slate-900">浏览器直出 HTML</dd>
              </div>
              <div class="flex items-center justify-between gap-4">
                <dt class="text-slate-500">上传接口</dt>
                <dd class="font-mono text-xs font-medium text-slate-900">/api/upload</dd>
              </div>
            </dl>
          </div>

          <div
            v-if="errorMessage"
            class="rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm leading-6 text-rose-700"
          >
            {{ errorMessage }}
          </div>

          <div
            v-if="generatedUrl"
            class="rounded-lg border border-emerald-200 bg-emerald-50 p-5 shadow-soft"
          >
            <div class="flex items-center gap-3">
              <div class="grid h-10 w-10 place-items-center rounded-lg bg-emerald-600 text-lg font-bold text-white">
                ✓
              </div>
              <div>
                <p class="text-sm font-semibold text-emerald-800">生成成功</p>
                <p class="text-xs text-emerald-700">你的网页已经可以访问。</p>
              </div>
            </div>

            <a
              :href="generatedUrl"
              target="_blank"
              rel="noreferrer"
              class="mt-5 block break-all rounded-lg border border-emerald-200 bg-white p-4 font-mono text-sm leading-6 text-emerald-700 transition hover:border-emerald-300 hover:text-emerald-800"
            >
              {{ generatedUrl }}
            </a>

            <button
              type="button"
              class="mt-4 inline-flex h-11 w-full items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-200"
              @click="copyLink"
            >
              {{ copied ? '已复制' : '一键复制链接' }}
            </button>
          </div>
        </aside>
      </div>
    </section>
  </main>
</template>
