import type { ReadingChapterInput } from '@data/services/ReadingBookService'

type MineruBlock = {
  type?: string
  text?: string
  text_level?: number
  page_idx?: number
  table_body?: string
  latex?: string
}

function blockText(block: MineruBlock): string {
  return block.text?.trim() || block.table_body?.trim() || block.latex?.trim() || ''
}

function firstPage(blocks: MineruBlock[]): number | undefined {
  return blocks.find((block) => block.page_idx !== undefined)?.page_idx
}

export function extractReadingChapters(contentList: unknown): ReadingChapterInput[] {
  if (!Array.isArray(contentList)) throw new Error('MinerU content_list.json is not an array')
  const blocks = contentList as MineruBlock[]
  const headings = blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => Boolean(block.text?.trim()) && (block.text_level ?? 0) > 0)
  const makeChapter = (title: string, level: number, start: number, end: number): ReadingChapterInput => ({
    title,
    level,
    orderIndex: 0,
    pageStart: firstPage(blocks.slice(start, end)),
    blockStart: start,
    blockEnd: end,
    content: blocks.slice(start, end).map(blockText).filter(Boolean).join('\n\n')
  })

  if (!headings.length) {
    const chapter = makeChapter('Full text', 0, 0, blocks.length)
    return chapter.content ? [chapter] : []
  }

  const chapters: ReadingChapterInput[] = []
  if (headings[0].index > 0) {
    const prefix = makeChapter('Content before first heading', 0, 0, headings[0].index)
    if (prefix.content) chapters.push(prefix)
  }
  headings.forEach(({ block, index: start }, index) => {
    const end = headings[index + 1]?.index ?? blocks.length
    chapters.push({
      ...makeChapter(block.text?.trim() || 'Untitled section', block.text_level ?? 1, start + 1, end),
      pageStart: block.page_idx
    })
  })
  return chapters.map((chapter, orderIndex) => ({ ...chapter, orderIndex }))
}
