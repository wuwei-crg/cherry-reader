import { describe, expect, it } from 'vitest'

import { extractReadingChapters } from '../chapterExtraction'

describe('extractReadingChapters', () => {
  it('keeps heading order and each heading body separate for continuous parent-child selection', () => {
    const chapters = extractReadingChapters([
      { text: 'Chapter 1', text_level: 1, page_idx: 0 },
      { text: 'Introduction', page_idx: 0 },
      { text: 'Section 1.1', text_level: 2, page_idx: 1 },
      { text: 'Details', page_idx: 1 },
      { text: 'Chapter 2', text_level: 1, page_idx: 2 },
      { text: 'Conclusion', page_idx: 2 }
    ])

    expect(chapters.map(({ title, level, orderIndex, content }) => ({ title, level, orderIndex, content }))).toEqual([
      { title: 'Chapter 1', level: 1, orderIndex: 0, content: 'Introduction' },
      { title: 'Section 1.1', level: 2, orderIndex: 1, content: 'Details' },
      { title: 'Chapter 2', level: 1, orderIndex: 2, content: 'Conclusion' }
    ])
  })

  it('creates one readable chapter when MinerU returns no headings', () => {
    const chapters = extractReadingChapters([
      { text: 'First paragraph', page_idx: 3 },
      { table_body: '| A | B |', page_idx: 3 }
    ])

    expect(chapters).toHaveLength(1)
    expect(chapters[0]).toMatchObject({
      title: 'Full text',
      level: 0,
      orderIndex: 0,
      pageStart: 3,
      content: 'First paragraph\n\n| A | B |'
    })
  })
})
