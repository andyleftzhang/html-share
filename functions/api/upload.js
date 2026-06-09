const EXPIRATION_TTL = 7 * 24 * 60 * 60
const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

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

  const siteId = createSiteId()
  await env.MY_KV.put(siteId, htmlCode, { expirationTtl: EXPIRATION_TTL })

  const { origin } = new URL(request.url)

  return json({ url: `${origin}/view/${siteId}` })
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, { status: 405 })
  }

  return onRequestPost(context)
}
