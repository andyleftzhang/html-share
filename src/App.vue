<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
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
const showSuccessDialog = ref(false)
const isDraggingFile = ref(false)
const turnstileToken = ref('')
const turnstileWidgetId = ref(null)
const expirationDays = ref(7)
const expirationOptions = [1, 3, 7]
const maxFileSizeBytes = 200 * 1024
const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || ''

const fileKindLabel = computed(() => {
  if (selectedFileKind.value === 'html') return 'HTML file'
  if (selectedFileKind.value === 'markdown') return 'Markdown file'
  return 'Not selected'
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
    throw new Error('The current environment did not return API JSON. Run npm run pages:dev to test Cloudflare Pages Functions locally.')
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
        errorMessage.value = 'Human verification failed to load. Refresh the page and try again.'
      },
    })
  } catch {
    errorMessage.value = 'Human verification failed to load. Check your connection and refresh the page.'
  }
}

function resetTurnstile() {
  turnstileToken.value = ''

  if (turnstileSiteKey && window.turnstile && turnstileWidgetId.value !== null) {
    window.turnstile.reset(turnstileWidgetId.value)
  }
}

function resetUploadResultState() {
  generatedUrl.value = ''
  copied.value = false
  showSuccessDialog.value = false
  errorMessage.value = ''
}

async function processSelectedFile(file) {
  resetUploadResultState()

  if (!file) {
    selectedFile.value = null
    selectedFileKind.value = ''
    fileContent.value = ''
    return
  }

  try {
    const kind = detectFileKind(file.name)

    if (file.size > maxFileSizeBytes) {
      throw new Error('Files must be 200KB or less.')
    }

    const text = await file.text()

    if (!text.trim()) {
      throw new Error('File content cannot be empty.')
    }

    selectedFile.value = file
    selectedFileKind.value = kind
    fileContent.value = text
  } catch (error) {
    selectedFile.value = null
    selectedFileKind.value = ''
    fileContent.value = ''
    errorMessage.value = error.message || 'Could not read this file. Please choose another one.'
    event.target.value = ''
  }
}

async function handleFileChange(event) {
  const [file] = Array.from(event.target.files || [])

  await processSelectedFile(file)

  if (!selectedFile.value) {
    event.target.value = ''
  }
}

async function handleFileDrop(event) {
  isDraggingFile.value = false
  const [file] = Array.from(event.dataTransfer?.files || [])

  await processSelectedFile(file)
}

function chooseFile() {
  fileInput.value?.click()
}

function closeSuccessDialog() {
  showSuccessDialog.value = false
}

function handleWindowKeydown(event) {
  if (event.key === 'Escape') {
    closeSuccessDialog()
  }
}

async function createShareLink() {
  errorMessage.value = ''
  generatedUrl.value = ''
  copied.value = false
  showSuccessDialog.value = false

  if (!fileContent.value.trim() || !selectedFileKind.value) {
    errorMessage.value = 'Choose an HTML or Markdown file first.'
    return
  }

  if (turnstileSiteKey && !turnstileToken.value) {
    errorMessage.value = 'Complete human verification first.'
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
      throw new Error(data.error || 'Could not create a share link. Please try again.')
    }

    generatedUrl.value = data.url
    showSuccessDialog.value = true
  } catch (error) {
    errorMessage.value = error.message || 'Could not create a share link. Please try again.'
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
  window.addEventListener('keydown', handleWindowKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleWindowKeydown)
})
</script>

<template>
  <main class="min-h-screen overflow-hidden bg-slate-50 text-slate-950">
    <div class="pointer-events-none fixed inset-0">
      <div class="absolute left-[-120px] top-[-120px] h-80 w-80 rounded-full bg-emerald-200/40 blur-3xl"></div>
      <div class="absolute bottom-[-160px] right-[-120px] h-96 w-96 rounded-full bg-sky-200/40 blur-3xl"></div>
    </div>

    <section class="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-8 sm:px-8 lg:px-10">
      <header class="border-b border-slate-200/80 pb-7">
        <div>
          <h1 class="text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
            ⚡ Instant HTML Hosting
          </h1>
          <p class="mt-3 max-w-2xl text-base leading-7 text-slate-600">
            Upload an HTML or Markdown file and publish a temporary share page in seconds.
          </p>
        </div>
      </header>

      <div class="grid flex-1 gap-6 py-8 lg:grid-cols-[1fr_360px]">
        <section class="rounded-lg border border-slate-200 bg-white shadow-soft">
          <div class="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-lg font-semibold text-slate-950">Upload a web page</h2>
              <p class="mt-1 text-sm text-slate-500">Supports .html, .htm, .md, and .markdown files up to 200KB</p>
            </div>

            <button
              type="button"
              :disabled="isLoading || !selectedFile"
              class="inline-flex h-11 items-center justify-center rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-300 disabled:cursor-not-allowed disabled:bg-slate-400"
              @click="createShareLink"
            >
              <span v-if="isLoading">Creating...</span>
              <span v-else>Create share link</span>
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
              class="flex min-h-[220px] w-full flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition focus:outline-none focus:ring-4 focus:ring-emerald-100"
              :class="
                isDraggingFile
                  ? 'border-emerald-500 bg-emerald-50 shadow-inner'
                  : 'border-slate-300 bg-slate-50 hover:border-emerald-400 hover:bg-emerald-50/60'
              "
              @dragenter.prevent="isDraggingFile = true"
              @dragover.prevent="isDraggingFile = true"
              @dragleave.prevent="isDraggingFile = false"
              @drop.prevent="handleFileDrop"
              @click="chooseFile"
            >
              <span class="grid h-14 w-14 place-items-center rounded-lg bg-slate-950 text-2xl font-semibold text-white">
                ↑
              </span>
              <span class="mt-5 text-xl font-semibold text-slate-950">
                {{ selectedFile ? selectedFile.name : 'Choose or drop an HTML or Markdown file' }}
              </span>
              <span class="mt-2 max-w-lg text-sm leading-6 text-slate-500">
                {{ selectedFile ? `${fileKindLabel} · ${fileSizeLabel}` : 'Your file is read locally in the browser. Markdown is converted to HTML before upload.' }}
              </span>
            </button>
          </div>
        </section>

        <aside class="flex flex-col gap-4">
          <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
            <h2 class="text-lg font-semibold text-slate-950">Share settings</h2>
            <div class="mt-5">
              <label class="text-sm font-medium text-slate-600">Expiration</label>
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
                  {{ days }}d
                </button>
              </div>
            </div>

            <dl class="mt-5 space-y-4 border-t border-slate-200 pt-5 text-sm">
              <div class="flex items-center justify-between gap-4">
                <dt class="text-slate-500">File type</dt>
                <dd class="font-medium text-slate-900">{{ fileKindLabel }}</dd>
              </div>
              <div class="flex items-center justify-between gap-4">
                <dt class="text-slate-500">File size</dt>
                <dd class="font-medium text-slate-900">{{ fileSizeLabel }}</dd>
              </div>
            </dl>
          </div>

          <div
            v-if="turnstileSiteKey"
            class="rounded-lg border border-slate-200 bg-white p-5 shadow-soft"
          >
            <h2 class="text-lg font-semibold text-slate-950">Human verification</h2>
            <div ref="turnstileContainer" class="mt-4 min-h-[65px]"></div>
          </div>

          <div
            v-if="errorMessage"
            class="rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm leading-6 text-rose-700"
          >
            {{ errorMessage }}
          </div>
        </aside>
      </div>
    </section>

    <div
      v-if="showSuccessDialog"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="success-dialog-title"
      @click.self="closeSuccessDialog"
    >
      <div class="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-center gap-3">
            <div class="grid h-11 w-11 place-items-center rounded-lg bg-emerald-600 text-lg font-bold text-white">
              ✓
            </div>
            <div>
              <h2 id="success-dialog-title" class="text-lg font-semibold text-slate-950">Share link created</h2>
              <p class="mt-1 text-sm text-slate-500">Copy it now and paste it anywhere.</p>
            </div>
          </div>

          <button
            type="button"
            class="grid h-9 w-9 place-items-center rounded-lg text-xl leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-4 focus:ring-slate-200"
            aria-label="Close dialog"
            @click="closeSuccessDialog"
          >
            ×
          </button>
        </div>

        <a
          :href="generatedUrl"
          target="_blank"
          rel="noreferrer"
          class="mt-6 block break-all rounded-lg border border-emerald-200 bg-emerald-50 p-4 font-mono text-sm leading-6 text-emerald-700 transition hover:border-emerald-300 hover:text-emerald-800"
        >
          {{ generatedUrl }}
        </a>

        <div class="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            class="inline-flex h-11 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-200"
            @click="copyLink"
          >
            {{ copied ? 'Copied' : 'Copy link' }}
          </button>
          <a
            :href="generatedUrl"
            target="_blank"
            rel="noreferrer"
            class="inline-flex h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200"
          >
            Open page
          </a>
        </div>
      </div>
    </div>
  </main>
</template>
