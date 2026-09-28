import type { ReadingChapterInput } from '@data/services/ReadingBookService'
import EPub, { type ManifestItem, type TocElement } from 'epub'
import { convert } from 'html-to-text'

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeHref(value: unknown): string | undefined {
  const href = asNonEmptyString(value)?.split('#', 1)[0]
  if (!href) return undefined
  try {
    return decodeURIComponent(href).replace(/^\.\//, '')
  } catch {
    return href.replace(/^\.\//, '')
  }
}

function findTocEntry(item: ManifestItem, toc: TocElement[]): TocElement | undefined {
  const itemHref = normalizeHref(item.href)
  return toc.find((entry) => {
    if (entry.id && entry.id === item.id) return true
    const tocHref = normalizeHref(entry.href)
    return Boolean(itemHref && tocHref && itemHref === tocHref)
  })
}

function chapterText(html: string): string {
  return convert(html, {
    preserveNewlines: false,
    wordwrap: false,
    selectors: [{ selector: 'img', format: 'skip' }]
  })
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function chapterLevel(item: ManifestItem, tocEntry?: TocElement): number {
  const rawLevel = typeof item.level === 'number' ? item.level : tocEntry?.level
  return typeof rawLevel === 'number' && Number.isFinite(rawLevel) ? Math.max(1, Math.trunc(rawLevel) + 1) : 1
}

export async function extractEpubReadingChapters(sourcePath: string): Promise<ReadingChapterInput[]> {
  const epub = new EPub(sourcePath)
  await epub.parse()

  const chapters: ReadingChapterInput[] = []
  const failedChapterIds: string[] = []

  for (const [spineIndex, item] of (epub.flow ?? []).entries()) {
    try {
      const content = chapterText(await epub.getChapter(item.id))
      if (!content) continue

      const tocEntry = findTocEntry(item, epub.toc ?? [])
      chapters.push({
        title: asNonEmptyString(item.title) ?? asNonEmptyString(tocEntry?.title) ?? `Chapter ${chapters.length + 1}`,
        level: chapterLevel(item, tocEntry),
        orderIndex: chapters.length,
        blockStart: spineIndex,
        blockEnd: spineIndex + 1,
        content
      })
    } catch {
      failedChapterIds.push(item.id)
    }
  }

  if (failedChapterIds.length) {
    throw new Error(`Failed to read EPUB chapters: ${failedChapterIds.join(', ')}`)
  }
  if (!chapters.length) throw new Error('The EPUB does not contain readable chapter content')

  return chapters
}
