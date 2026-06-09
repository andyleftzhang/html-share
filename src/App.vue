<script setup>
import { computed, onMounted, ref } from 'vue'
import { buildPublishHtml, detectFileKind } from './filePublisher.js'

const fileInput = ref(null)
const turnstileContainer = ref(null)
const selectedFile = ref(null)
const selectedFileKind = ref('')
const fileContent = ref('')
const generatedUrl = ref('')
const errorMessage = ref('')
const isLoading = ref(false)
const copied = ref(false)
const turnstileToken = ref('')
const turnstileWidgetId = ref(null)
const expirationDays = ref(7)
const expirationOptions = [1, 3, 7]
const maxFileSizeBytes = 200 * 1024
const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || ''

const fileKindLabel = computed(() => {
  if (selectedFileKind.value === 'html') return 'HTML 文件'
  if (selectedFileKind.value === 'markdown') return 'Markdown 文件'
  return '未选择'
})

const fileSizeLabel = computed(() => {
  if (!selectedFile.value) return '0 KB'

  const sizeInKb = selectedFile.value.size / 1024
  return `${sizeInKb >= 100 ? Math.round(sizeInKb) : sizeInKb.toFixed(1)} KB`
})

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

function loadTurnstileScript() {
  if (!turnstileSiteKey || window.turnstile) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-turnstile-script]')

    if (existingScript) {
      existingScript.addEventListener('load', resolve, { once: true })
      existingScript.addEventListener('error', reject, { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.defer = true
    script.dataset.turnstileScript = 'true'
    script.addEventListener('load', resolve, { once: true })
    script.addEventListener('error', reject, { once: true })
    document.head.appendChild(script)
  })
}

async function renderTurnstile() {
  if (!turnstileSiteKey || !turnstileContainer.value) {
    return
  }

  try {
    await loadTurnstileScript()
    turnstileWidgetId.value = window.turnstile.render(turnstileContainer.value, {
      sitekey: turnstileSiteKey,
      callback(token) {
        turnstileToken.value = token
        errorMessage.value = ''
      },
      'expired-callback'() {
        turnstileToken.value = ''
      },
      'error-callback'() {
        turnstileToken.value = ''
        errorMessage.value = '人机验证加载失败，请刷新页面后重试。'
      },
    })
  } catch {
    errorMessage.value = '人机验证加载失败，请检查网络后刷新页面。'
  }
}

function resetTurnstile() {
  turnstileToken.value = ''

  if (turnstileSiteKey && window.turnstile && turnstileWidgetId.value !== null) {
    window.turnstile.reset(turnstileWidgetId.value)
  }
}

async function handleFileChange(event) {
  const [file] = Array.from(event.target.files || [])

  generatedUrl.value = ''
  copied.value = false
  errorMessage.value = ''

  if (!file) {
    selectedFile.value = null
    selectedFileKind.value = ''
    fileContent.value = ''
    return
  }

  try {
    const kind = detectFileKind(file.name)

    if (file.size > maxFileSizeBytes) {
      throw new Error('文件不能超过 200KB。')
    }

    const text = await file.text()

    if (!text.trim()) {
      throw new Error('文件内容不能为空。')
    }

    selectedFile.value = file
    selectedFileKind.value = kind
    fileContent.value = text
  } catch (error) {
    selectedFile.value = null
    selectedFileKind.value = ''
    fileContent.value = ''
    errorMessage.value = error.message || '读取文件失败，请重新选择。'
    event.target.value = ''
  }
}

function chooseFile() {
  fileInput.value?.click()
}

async function createShareLink() {
  errorMessage.value = ''
  generatedUrl.value = ''
  copied.value = false

  if (!fileContent.value.trim() || !selectedFileKind.value) {
    errorMessage.value = '请先选择一个 HTML 或 Markdown 文件。'
    return
  }

  if (turnstileSiteKey && !turnstileToken.value) {
    errorMessage.value = '请先完成人机验证。'
    return
  }

  isLoading.value = true

  try {
    const htmlCode = await buildPublishHtml(fileContent.value, selectedFileKind.value)

    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        htmlCode,
        expirationDays: expirationDays.value,
        turnstileToken: turnstileToken.value,
      }),
    })

    const data = await readJsonResponse(response)

    if (!response.ok) {
      throw new Error(data.error || '生成链接失败，请稍后重试。')
    }

    generatedUrl.value = data.url
  } catch (error) {
    errorMessage.value = error.message || '生成链接失败，请稍后重试。'
    resetTurnstile()
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

onMounted(() => {
  renderTurnstile()
})
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
            上传 HTML 或 Markdown 文件，一次点击生成可分享的 Cloudflare Pages 临时页面。
          </p>
        </div>
        <div class="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          同源 API · KV 临时存储
        </div>
      </header>

      <div class="grid flex-1 gap-6 py-8 lg:grid-cols-[1fr_360px]">
        <section class="rounded-lg border border-slate-200 bg-white shadow-soft">
          <div class="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-lg font-semibold text-slate-950">上传网页文件</h2>
              <p class="mt-1 text-sm text-slate-500">支持 .html、.htm、.md、.markdown 文件，最大 200KB</p>
            </div>

            <button
              type="button"
              :disabled="isLoading || !selectedFile"
              class="inline-flex h-11 items-center justify-center rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-300 disabled:cursor-not-allowed disabled:bg-slate-400"
              @click="createShareLink"
            >
              <span v-if="isLoading">生成中...</span>
              <span v-else>生成分享链接</span>
            </button>
          </div>

          <div class="p-5">
            <input
              ref="fileInput"
              type="file"
              class="sr-only"
              accept=".html,.htm,.md,.markdown,text/html,text/markdown,text/plain"
              @change="handleFileChange"
            />

            <button
              type="button"
              class="flex min-h-[220px] w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition hover:border-emerald-400 hover:bg-emerald-50/60 focus:outline-none focus:ring-4 focus:ring-emerald-100"
              @click="chooseFile"
            >
              <span class="grid h-14 w-14 place-items-center rounded-lg bg-slate-950 text-2xl font-semibold text-white">
                ↑
              </span>
              <span class="mt-5 text-xl font-semibold text-slate-950">
                {{ selectedFile ? selectedFile.name : '选择 HTML 或 Markdown 文件' }}
              </span>
              <span class="mt-2 max-w-lg text-sm leading-6 text-slate-500">
                {{ selectedFile ? `${fileKindLabel} · ${fileSizeLabel}` : '文件会在浏览器本地读取，Markdown 会先转换成完整 HTML，再上传到 KV。' }}
              </span>
            </button>
          </div>
        </section>

        <aside class="flex flex-col gap-4">
          <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
            <h2 class="text-lg font-semibold text-slate-950">分享设置</h2>
            <div class="mt-5">
              <label class="text-sm font-medium text-slate-600">有效期</label>
              <div class="mt-3 grid grid-cols-5 gap-2">
                <button
                  v-for="days in expirationOptions"
                  :key="days"
                  type="button"
                  class="h-10 rounded-lg border text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-emerald-100"
                  :class="
                    expirationDays === days
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:text-emerald-700'
                  "
                  @click="expirationDays = days"
                >
                  {{ days }}天
                </button>
              </div>
            </div>

            <dl class="mt-5 space-y-4 border-t border-slate-200 pt-5 text-sm">
              <div class="flex items-center justify-between gap-4">
                <dt class="text-slate-500">文件类型</dt>
                <dd class="font-medium text-slate-900">{{ fileKindLabel }}</dd>
              </div>
              <div class="flex items-center justify-between gap-4">
                <dt class="text-slate-500">文件大小</dt>
                <dd class="font-medium text-slate-900">{{ fileSizeLabel }}</dd>
              </div>
            </dl>
          </div>

          <div
            v-if="turnstileSiteKey"
            class="rounded-lg border border-slate-200 bg-white p-5 shadow-soft"
          >
            <h2 class="text-lg font-semibold text-slate-950">人机验证</h2>
            <div ref="turnstileContainer" class="mt-4 min-h-[65px]"></div>
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
