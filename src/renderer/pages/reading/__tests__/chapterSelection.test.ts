import type { ReadingChapter } from '@shared/data/types/reading'
import { describe, expect, it } from 'vitest'

import { toggleChapterRange } from '../chapterSelection'

const chapters = [
  { id: 'chapter-1', title: 'One', level: 1, orderIndex: 0 },
  { id: 'section-1', title: 'One.A', level: 2, orderIndex: 1 },
  { id: 'chapter-2', title: 'Two', level: 1, orderIndex: 2 }
] as ReadingChapter[]

describe('toggleChapterRange', () => {
  it('selects a parent together with its descendants and clears it when selected again', () => {
    const range = toggleChapterRange(chapters, undefined, chapters[0])

    expect(range).toEqual({ start: 0, end: 1 })
    expect(toggleChapterRange(chapters, range, chapters[0])).toBeUndefined()
  })

  it('removes a selected range edge while preserving the remaining continuous context', () => {
    expect(toggleChapterRange(chapters, { start: 0, end: 2 }, chapters[2])).toEqual({ start: 0, end: 1 })
  })
})
