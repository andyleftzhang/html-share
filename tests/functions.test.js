import { describe, expect, it, vi } from 'vitest'

import { onRequestPost } from '../functions/api/upload.js'
import { onRequestGet } from '../functions/view/[id].js'

function kvStore(initial = {}) {
  const store = new Map(Object.entries(initial))

  return {
    put: vi.fn(async (key, value) => {
      store.set(key, value)
    }),
    get: vi.fn(async (key) => store.get(key) ?? null),
  }
}

function contentPutCall(MY_KV) {
  return MY_KV.put.mock.calls.find(([key]) => /^[a-zA-Z0-9]{6}$/.test(key))
}

describe('upload function', () => {
  it('requires turnstile token when a secret is configured', async () => {
    const response = await onRequestPost({
      request: new Request('https://example.com/api/upload', {
        method: 'POST',
        body: JSON.stringify({ htmlCode: '<h1>Hello</h1>' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      env: { MY_KV: kvStore(), TURNSTILE_SECRET_KEY: 'secret' },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Please complete human verification first.',
    })
  })

  it('verifies turnstile token before storing html when a secret is configured', async () => {
    const originalFetch = globalThis.fetch
    const MY_KV = kvStore()
    const siteverifyFetch = vi.fn(async () =>
      new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', siteverifyFetch)

    try {
      const response = await onRequestPost({
        request: new Request('https://example.com/api/upload', {
          method: 'POST',
          body: JSON.stringify({ htmlCode: '<h1>Hello</h1>', turnstileToken: 'token' }),
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '203.0.113.10',
          },
        }),
        env: { MY_KV, TURNSTILE_SECRET_KEY: 'secret' },
      })

      expect(response.status).toBe(200)
      expect(siteverifyFetch).toHaveBeenCalledWith(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData),
        })
      )
      expect(contentPutCall(MY_KV)).toEqual([
        expect.stringMatching(/^[a-zA-Z0-9]{6}$/),
        '<h1>Hello</h1>',
        { expirationTtl: 7 * 24 * 60 * 60 },
      ])
    } finally {
      vi.stubGlobal('fetch', originalFetch)
    }
  })

  it('rejects html when turnstile verification fails', async () => {
    const originalFetch = globalThis.fetch
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ success: false }), {
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )

    try {
      const response = await onRequestPost({
        request: new Request('https://example.com/api/upload', {
          method: 'POST',
          body: JSON.stringify({ htmlCode: '<h1>Hello</h1>', turnstileToken: 'bad-token' }),
          headers: { 'Content-Type': 'application/json' },
        }),
        env: { MY_KV: kvStore(), TURNSTILE_SECRET_KEY: 'secret' },
      })

      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({
        error: 'Human verification failed. Please try again.',
      })
    } finally {
      vi.stubGlobal('fetch', originalFetch)
    }
  })

  it('stores html for 7 days and returns a same-origin view url', async () => {
    const MY_KV = kvStore()
    const response = await onRequestPost({
      request: new Request('https://example.com/api/upload', {
        method: 'POST',
        body: JSON.stringify({ htmlCode: '<h1>Hello</h1>' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      env: { MY_KV },
    })

    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body.url).toMatch(/^https:\/\/example\.com\/view\/[a-zA-Z0-9]{6}$/)
    expect(contentPutCall(MY_KV)).toEqual([
      expect.stringMatching(/^[a-zA-Z0-9]{6}$/),
      '<h1>Hello</h1>',
      { expirationTtl: 7 * 24 * 60 * 60 },
    ])
  })

  it('stores html with the requested expiration days', async () => {
    const MY_KV = kvStore()
    const response = await onRequestPost({
      request: new Request('https://example.com/api/upload', {
        method: 'POST',
        body: JSON.stringify({ htmlCode: '<h1>Hello</h1>', expirationDays: 3 }),
        headers: { 'Content-Type': 'application/json' },
      }),
      env: { MY_KV },
    })

    expect(response.status).toBe(200)
    expect(contentPutCall(MY_KV)).toEqual([
      expect.stringMatching(/^[a-zA-Z0-9]{6}$/),
      '<h1>Hello</h1>',
      { expirationTtl: 3 * 24 * 60 * 60 },
    ])
  })

  it('rejects expiration values longer than 7 days', async () => {
    const response = await onRequestPost({
      request: new Request('https://example.com/api/upload', {
        method: 'POST',
        body: JSON.stringify({ htmlCode: '<h1>Hello</h1>', expirationDays: 14 }),
        headers: { 'Content-Type': 'application/json' },
      }),
      env: { MY_KV: kvStore() },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Expiration must be 1, 3, or 7 days.',
    })
  })

  it('rejects html larger than the upload limit', async () => {
    const response = await onRequestPost({
      request: new Request('https://example.com/api/upload', {
        method: 'POST',
        body: JSON.stringify({ htmlCode: 'a'.repeat(200 * 1024 + 1) }),
        headers: { 'Content-Type': 'application/json' },
      }),
      env: { MY_KV: kvStore() },
    })

    expect(response.status).toBe(413)
  })

  it('rejects suspicious phishing or tracking content', async () => {
    const response = await onRequestPost({
      request: new Request('https://example.com/api/upload', {
        method: 'POST',
        body: JSON.stringify({ htmlCode: '<form><input type="password"></form>' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      env: { MY_KV: kvStore() },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'This file contains high-risk credential or script patterns and cannot be published.',
    })
  })

  it('allows common app html with iframe and localStorage usage', async () => {
    const MY_KV = kvStore()
    const response = await onRequestPost({
      request: new Request('https://example.com/api/upload', {
        method: 'POST',
        body: JSON.stringify({
          htmlCode: '<iframe src="about:blank"></iframe><script>localStorage.setItem("theme","dark")</script>',
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
      env: { MY_KV },
    })

    expect(response.status).toBe(200)
    expect(contentPutCall(MY_KV)?.[1]).toContain('localStorage')
  })

  it('allows non-credential forms', async () => {
    const MY_KV = kvStore()
    const response = await onRequestPost({
      request: new Request('https://example.com/api/upload', {
        method: 'POST',
        body: JSON.stringify({ htmlCode: '<form><input name="q"></form>' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      env: { MY_KV },
    })

    expect(response.status).toBe(200)
  })

  it('rate limits repeated uploads from the same ip', async () => {
    const MY_KV = kvStore()
    const makeRequest = () =>
      onRequestPost({
        request: new Request('https://example.com/api/upload', {
          method: 'POST',
          body: JSON.stringify({ htmlCode: '<h1>Hello</h1>' }),
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '203.0.113.9',
          },
        }),
        env: { MY_KV },
      })

    for (let index = 0; index < 5; index += 1) {
      expect((await makeRequest()).status).toBe(200)
    }

    expect((await makeRequest()).status).toBe(429)
  })

  it('does not overwrite an existing site id when a generated id collides', async () => {
    const MY_KV = kvStore({ AAAAAA: '<main>Existing</main>' })
    const originalCrypto = globalThis.crypto
    const fakeCrypto = {
      getRandomValues: vi
        .fn()
        .mockImplementationOnce((values) => values.fill(0))
        .mockImplementationOnce((values) => values.fill(1)),
    }
    vi.stubGlobal('crypto', fakeCrypto)

    try {
      const response = await onRequestPost({
        request: new Request('https://example.com/api/upload', {
          method: 'POST',
          body: JSON.stringify({ htmlCode: '<h1>Hello</h1>' }),
          headers: { 'Content-Type': 'application/json' },
        }),
        env: { MY_KV },
      })

      expect(response.status).toBe(200)
      expect(contentPutCall(MY_KV)).toEqual([
        'BBBBBB',
        '<h1>Hello</h1>',
        { expirationTtl: 7 * 24 * 60 * 60 },
      ])
    } finally {
      vi.stubGlobal('crypto', originalCrypto)
    }
  })

  it('rejects empty html content', async () => {
    const response = await onRequestPost({
      request: new Request('https://example.com/api/upload', {
        method: 'POST',
        body: JSON.stringify({ htmlCode: '' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      env: { MY_KV: kvStore() },
    })

    expect(response.status).toBe(400)
  })
})

describe('view function', () => {
  it('returns stored html as a renderable document', async () => {
    const response = await onRequestGet({
      env: { MY_KV: kvStore({ abc123: '<main>Published</main>' }) },
      params: { id: 'abc123' },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/html;charset=UTF-8')
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive')
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(response.headers.get('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=(), payment=()')
    expect(await response.text()).toBe('<main>Published</main>')
  })

  it('returns a styled 404 page when the site is missing', async () => {
    const response = await onRequestGet({
      env: { MY_KV: kvStore() },
      params: { id: 'missing' },
    })

    expect(response.status).toBe(404)
    expect(await response.text()).toContain('Page not found or expired')
  })
})
