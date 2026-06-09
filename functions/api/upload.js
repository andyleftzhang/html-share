const DEFAULT_EXPIRATION_DAYS = 7
const ALLOWED_EXPIRATION_DAYS = new Set([1, 3, 7])
const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const MAX_HTML_BYTES = 200 * 1024
const MAX_UPLOADS_PER_MINUTE = 5
const MAX_UPLOADS_PER_DAY = 50
const RATE_LIMIT_TTL_SECONDS = 24 * 60 * 60
const SITE_ID_RETRIES = 5
const BLOCKED_CONTENT_PATTERNS = [
  /wallet/i,
  /seed phrase/i,
  /private key/i,
  /document\.cookie/i,
]
const FORM_PATTERN = /<form[\s>]/i
const PASSWORD_FIELD_PATTERN = /type=["']?password["']?/i

function createSiteId(length = 6) {
  const values = new Uint8Array(length)
  crypto.getRandomValues(values)

  return Array.from(values, (value) => ID_ALPHABET[value % ID_ALPHABET.length]).join('')
}

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      ...(init.headers || {}),
    },
  })
}

function resolveExpirationDays(value) {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_EXPIRATION_DAYS
  }

  const days = Number(value)

  if (!Number.isInteger(days) || !ALLOWED_EXPIRATION_DAYS.has(days)) {
    throw new Error('有效期只能选择 1、3 或 7 天。')
  }

  return days
}

function byteLength(value) {
  return new TextEncoder().encode(value).length
}

function hasSuspiciousContent(htmlCode) {
  if (BLOCKED_CONTENT_PATTERNS.some((pattern) => pattern.test(htmlCode))) {
    return true
  }

  return FORM_PATTERN.test(htmlCode) && PASSWORD_FIELD_PATTERN.test(htmlCode)
}

function rateWindowKey(date, scope) {
  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  const hh = String(date.getUTCHours()).padStart(2, '0')
  const min = String(date.getUTCMinutes()).padStart(2, '0')

  if (scope === 'minute') {
    return `${yyyy}${mm}${dd}${hh}${min}`
  }

  return `${yyyy}${mm}${dd}`
}

function getClientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown'
}

async function incrementRateCounter(kv, key) {
  const current = Number(await kv.get(key)) || 0
  const next = current + 1
  await kv.put(key, String(next), { expirationTtl: RATE_LIMIT_TTL_SECONDS })
  return next
}

async function enforceRateLimit(kv, request) {
  const ip = getClientIp(request)
  const now = new Date()
  const minuteKey = `rate:${ip}:minute:${rateWindowKey(now, 'minute')}`
  const dayKey = `rate:${ip}:day:${rateWindowKey(now, 'day')}`

  const minuteCount = await incrementRateCounter(kv, minuteKey)
  const dayCount = await incrementRateCounter(kv, dayKey)

  if (minuteCount > MAX_UPLOADS_PER_MINUTE || dayCount > MAX_UPLOADS_PER_DAY) {
    throw new Error('上传过于频繁，请稍后再试。')
  }
}

async function createUniqueSiteId(kv) {
  for (let attempt = 0; attempt < SITE_ID_RETRIES; attempt += 1) {
    const siteId = createSiteId()
    const existing = await kv.get(siteId)

    if (!existing) {
      return siteId
    }
  }

  throw new Error('生成分享 ID 失败，请稍后重试。')
}

async function verifyTurnstileToken({ secret, token, ip }) {
  if (!secret) {
    return { required: false, success: true }
  }

  if (!token) {
    return { required: true, success: false, missingToken: true }
  }

  const formData = new FormData()
  formData.append('secret', secret)
  formData.append('response', token)

  if (ip && ip !== 'unknown') {
    formData.append('remoteip', ip)
  }

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: formData,
  })
  const result = await response.json()

  return { required: true, success: result.success === true }
}

export async function onRequestPost(context) {
  const { request, env } = context

  let payload
  try {
    payload = await request.json()
  } catch {
    return json({ error: '请求体必须是合法的 JSON。' }, { status: 400 })
  }

  const htmlCode = typeof payload?.htmlCode === 'string' ? payload.htmlCode.trim() : ''

  if (!htmlCode) {
    return json({ error: 'HTML 内容不能为空。' }, { status: 400 })
  }

  if (byteLength(htmlCode) > MAX_HTML_BYTES) {
    return json({ error: '文件内容不能超过 200KB。' }, { status: 413 })
  }

  if (hasSuspiciousContent(htmlCode)) {
    return json({ error: '内容包含高风险表单、凭证或脚本特征，无法发布。' }, { status: 400 })
  }

  let turnstileResult
  try {
    turnstileResult = await verifyTurnstileToken({
      secret: env.TURNSTILE_SECRET_KEY,
      token: payload?.turnstileToken,
      ip: getClientIp(request),
    })
  } catch {
    return json({ error: '人机验证服务暂时不可用，请稍后再试。' }, { status: 503 })
  }

  if (turnstileResult.missingToken) {
    return json({ error: '请先完成人机验证。' }, { status: 400 })
  }

  if (!turnstileResult.success) {
    return json({ error: '人机验证失败，请重试。' }, { status: 403 })
  }

  let expirationDays
  try {
    expirationDays = resolveExpirationDays(payload?.expirationDays)
  } catch (error) {
    return json({ error: error.message }, { status: 400 })
  }

  try {
    await enforceRateLimit(env.MY_KV, request)
  } catch (error) {
    return json({ error: error.message }, { status: 429 })
  }

  let siteId
  try {
    siteId = await createUniqueSiteId(env.MY_KV)
  } catch (error) {
    return json({ error: error.message }, { status: 500 })
  }

  await env.MY_KV.put(siteId, htmlCode, {
    expirationTtl: expirationDays * 24 * 60 * 60,
  })

  const { origin } = new URL(request.url)

  return json({ url: `${origin}/view/${siteId}` })
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, { status: 405 })
  }

  return onRequestPost(context)
}
