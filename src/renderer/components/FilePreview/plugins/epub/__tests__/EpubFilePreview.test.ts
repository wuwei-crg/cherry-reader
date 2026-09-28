import { describe, expect, it } from 'vitest'

import { sanitizeEpubDocument } from '../EpubFilePreview'

describe('EPUB preview content policy', () => {
  it('removes executable content, event handlers, and external URLs', () => {
    const document = new DOMParser().parseFromString(
      '<html><head></head><body><script>alert(1)</script><a href="javascript:alert(1)" onclick="alert(1)">bad</a><img src="https://example.com/a.png"><p>safe</p></body></html>',
      'text/html'
    )

    sanitizeEpubDocument(document)

    expect(document.querySelector('script')).toBeNull()
    expect(document.querySelector('[onclick]')).toBeNull()
    expect(document.querySelector('a')?.getAttribute('href')).toBeNull()
    expect(document.querySelector('img')?.getAttribute('src')).toBeNull()
    expect(document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')).toContain(
      "default-src 'none'"
    )
  })

  it('injects the content policy into XHTML documents without HTML document helpers', () => {
    const document = new DOMParser().parseFromString(
      '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>safe</p></body></html>',
      'application/xhtml+xml'
    )

    sanitizeEpubDocument(document)

    const policy = document.querySelector('head meta[http-equiv="Content-Security-Policy"]')
    expect(policy?.namespaceURI).toBe('http://www.w3.org/1999/xhtml')
    expect(policy?.getAttribute('content')).toContain("default-src 'none'")
  })
})
