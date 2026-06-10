import { describe, expect, it } from 'vitest'

import { buildPublishHtml, detectFileKind } from '../src/filePublisher.js'

describe('file publisher helpers', () => {
  it('detects html and markdown files from filename extensions', () => {
    expect(detectFileKind('demo.html')).toBe('html')
    expect(detectFileKind('demo.HTM')).toBe('html')
    expect(detectFileKind('notes.md')).toBe('markdown')
    expect(detectFileKind('notes.markdown')).toBe('markdown')
  })

  it('rejects unsupported file types', () => {
    expect(() => detectFileKind('image.png')).toThrow('Only HTML and Markdown files are supported.')
  })

  it('keeps html content as-is before publishing', async () => {
    await expect(buildPublishHtml('<h1>Hello</h1>', 'html')).resolves.toBe('<h1>Hello</h1>')
  })

  it('renders markdown content into a complete html document', async () => {
    const html = await buildPublishHtml('# Hello\n\nThis is **Markdown**.', 'markdown')

    expect(html).toContain('<!doctype html>')
    expect(html).toContain('<h1>Hello</h1>')
    expect(html).toContain('<strong>Markdown</strong>')
  })
})
