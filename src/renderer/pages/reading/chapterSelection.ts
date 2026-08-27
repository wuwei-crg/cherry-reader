import type { ReadingChapter } from '@shared/data/types/reading'

export type ChapterRange = { start: number; end: number }

function getDescendantEnd(chapters: ReadingChapter[], chapter: ReadingChapter): number {
  const start = chapters.findIndex((item) => item.id === chapter.id)
  for (let index = start + 1; index < chapters.length; index++) {
    if (chapters[index].level <= chapter.level) return chapters[index - 1].orderIndex
  }
  return chapters.at(-1)?.orderIndex ?? chapter.orderIndex
}

export function toggleChapterRange(
  chapters: ReadingChapter[],
  current: ChapterRange | undefined,
  chapter: ReadingChapter
): ChapterRange | undefined {
  const chapterRange = { start: chapter.orderIndex, end: getDescendantEnd(chapters, chapter) }
  if (!current) return chapterRange

  const isSelected = chapterRange.start <= current.end && chapterRange.end >= current.start
  if (!isSelected) {
    return { start: Math.min(current.start, chapterRange.start), end: Math.max(current.end, chapterRange.end) }
  }
  if (chapterRange.start <= current.start && chapterRange.end >= current.end) return undefined
  if (chapterRange.start <= current.start) {
    const start = chapterRange.end + 1
    return start <= current.end ? { start, end: current.end } : undefined
  }
  if (chapterRange.end >= current.end) {
    const end = chapterRange.start - 1
    return current.start <= end ? { start: current.start, end } : undefined
  }
  return undefined
}
