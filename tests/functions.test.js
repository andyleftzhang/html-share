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

describe('upload function', () => {
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
    expect(MY_KV.put).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-zA-Z0-9]{6}$/),
      '<h1>Hello</h1>',
      { expirationTtl: 7 * 24 * 60 * 60 }
    )
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
    expect(await response.text()).toBe('<main>Published</main>')
  })

  it('returns a styled 404 page when the site is missing', async () => {
    const response = await onRequestGet({
      env: { MY_KV: kvStore() },
      params: { id: 'missing' },
    })

    expect(response.status).toBe(404)
    expect(await response.text()).toContain('页面不存在或已过期')
  })
})
