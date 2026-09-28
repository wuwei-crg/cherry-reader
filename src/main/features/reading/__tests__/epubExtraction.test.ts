import { beforeEach, describe, expect, it, vi } from 'vitest'

const { epubState, parseMock, getChapterMock } = vi.hoisted(() => ({
  epubState: {
    flow: [] as Array<Record<string, unknown>>,
    toc: [] as Array<Record<string, unknown>>
  },
  parseMock: vi.fn(),
  getChapterMock: vi.fn()
}))

vi.mock('epub', () => ({
  default: class MockEpub {
    flow = epubState.flow
    toc = epubState.toc

    constructor(sourcePath: string) {
      void sourcePath
    }

    async parse() {
      return await parseMock()
    }

    async getChapter(id: string) {
      return await getChapterMock(id)
    }
  }
}))

const { extractEpubReadingChapters } = await import('../epubExtraction')

describe('extractEpubReadingChapters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    parseMock.mockResolvedValue(undefined)
    epubState.flow = []
    epubState.toc = []
  })

  it('preserves spine order and resolves titles and levels from the manifest or table of contents', async () => {
    epubState.flow = [
      { id: 'preface', href: 'OPS/preface.xhtml', 'media-type': 'application/xhtml+xml', title: 'Preface', level: 0 },
      { id: 'chapter-1', href: 'OPS/chapter.xhtml', 'media-type': 'application/xhtml+xml' }
    ]
    epubState.toc = [{ id: 'nav-1', href: 'OPS/chapter.xhtml#section', title: 'A Beginning', level: 1, order: 2 }]
    getChapterMock.mockImplementation(async (id: string) =>
      id === 'preface'
        ? '<p>Welcome to the book.</p>'
        : '<h1>A Beginning</h1><p>First paragraph.</p><p>Second paragraph.</p>'
    )

    const chapters = await extractEpubReadingChapters('book.epub')

    expect(chapters).toEqual([
      {
        title: 'Preface',
        level: 1,
        orderIndex: 0,
        blockStart: 0,
        blockEnd: 1,
        content: 'Welcome to the book.'
      },
      {
        title: 'A Beginning',
        level: 2,
        orderIndex: 1,
        blockStart: 1,
        blockEnd: 2,
        content: 'A BEGINNING\n\nFirst paragraph.\n\nSecond paragraph.'
      }
    ])
    expect(getChapterMock.mock.calls.map(([id]) => id)).toEqual(['preface', 'chapter-1'])
  })

  it('skips empty spine entries while keeping chapter order indexes continuous', async () => {
    epubState.flow = [
      { id: 'cover', href: 'cover.xhtml', 'media-type': 'application/xhtml+xml' },
      { id: 'body', href: 'body.xhtml', 'media-type': 'application/xhtml+xml' }
    ]
    getChapterMock.mockImplementation(async (id: string) => (id === 'cover' ? '<img src="cover.jpg">' : '<p>Text</p>'))

    await expect(extractEpubReadingChapters('book.epub')).resolves.toEqual([
      {
        title: 'Chapter 1',
        level: 1,
        orderIndex: 0,
        blockStart: 1,
        blockEnd: 2,
        content: 'Text'
      }
    ])
  })

  it('rejects the entire EPUB when any spine entry cannot be read', async () => {
    epubState.flow = [
      { id: 'one', href: 'one.xhtml', 'media-type': 'application/xhtml+xml' },
      { id: 'two', href: 'two.xhtml', 'media-type': 'application/xhtml+xml' }
    ]
    getChapterMock.mockImplementation(async (id: string) => {
      if (id === 'two') throw new Error('broken chapter')
      return '<p>Readable</p>'
    })

    await expect(extractEpubReadingChapters('book.epub')).rejects.toThrow('Failed to read EPUB chapters: two')
  })
})
