import { application } from '@application'
import { assistantTable } from '@data/db/schemas/assistant'
import { readingBookTable, readingChapterTable, readingTopicContextTable } from '@data/db/schemas/reading'
import { topicTable } from '@data/db/schemas/topic'
import { readingBookService } from '@data/services/ReadingBookService'
import { DEFAULT_ASSISTANT_SETTINGS } from '@shared/data/types/assistant'
import { setupTestDatabase } from '@test-helpers/db'
import { describe, expect, it } from 'vitest'

describe('ReadingBookService', () => {
  const dbh = setupTestDatabase()

  it('returns only the immutable inclusive chapter range stored for a reading conversation', () => {
    dbh.db
      .insert(assistantTable)
      .values({
        id: 'assistant-1',
        name: 'Book assistant',
        emoji: '📖',
        settings: DEFAULT_ASSISTANT_SETTINGS,
        orderKey: 'a0'
      })
      .run()
    const book = application.get('DbService').withWriteTx((tx) =>
      readingBookService.createBookTx(tx, {
        assistantId: 'assistant-1',
        title: 'Book',
        sourceName: 'book.pdf',
        sourcePath: 'C:/books/book.pdf'
      })
    )
    readingBookService.completeParse(book.id, [
      { title: 'One', level: 1, orderIndex: 0, pageStart: 0, blockStart: 0, blockEnd: 1, content: 'one' },
      { title: 'Two', level: 2, orderIndex: 1, pageStart: 1, blockStart: 1, blockEnd: 2, content: 'two' },
      { title: 'Three', level: 1, orderIndex: 2, pageStart: 2, blockStart: 2, blockEnd: 3, content: 'three' }
    ])
    dbh.db.insert(topicTable).values({ id: 'topic-1', name: '', assistantId: 'assistant-1', orderKey: 'a0' }).run()
    application.get('DbService').withWriteTx((tx) =>
      readingBookService.createTopicContextTx(tx, {
        topicId: 'topic-1',
        bookId: book.id,
        revision: 1,
        startOrderIndex: 0,
        endOrderIndex: 1,
        estimatedTokens: 2
      })
    )

    expect(readingBookService.getSelectedChapters('topic-1').map((chapter) => chapter.title)).toEqual(['One', 'Two'])
    expect(readingBookService.findTopicSource('topic-1')).toEqual({
      bookId: book.id,
      sourcePath: 'C:/books/book.pdf',
      title: 'Book',
      topicId: 'topic-1'
    })
    expect(readingBookService.findTopicSource('ordinary-topic')).toBeUndefined()
  })

  it('renames and deletes a book with its parsed chapters and reading contexts', () => {
    dbh.db
      .insert(assistantTable)
      .values({
        id: 'assistant-delete',
        name: 'Book assistant',
        emoji: '📖',
        settings: DEFAULT_ASSISTANT_SETTINGS,
        orderKey: 'a1'
      })
      .run()
    const book = application.get('DbService').withWriteTx((tx) =>
      readingBookService.createBookTx(tx, {
        assistantId: 'assistant-delete',
        title: 'Before rename',
        sourceName: 'book.pdf',
        sourcePath: 'C:/books/book.pdf'
      })
    )
    readingBookService.completeParse(book.id, [
      { title: 'One', level: 1, orderIndex: 0, blockStart: 0, blockEnd: 1, content: 'one' }
    ])
    dbh.db
      .insert(topicTable)
      .values({ id: 'topic-delete', name: '', assistantId: 'assistant-delete', orderKey: 'a1' })
      .run()
    application.get('DbService').withWriteTx((tx) => {
      readingBookService.createTopicContextTx(tx, {
        topicId: 'topic-delete',
        bookId: book.id,
        revision: 1,
        startOrderIndex: 0,
        endOrderIndex: 0,
        estimatedTokens: 1
      })
      expect(readingBookService.renameTx(tx, book.id, 'After rename').title).toBe('After rename')
      readingBookService.deleteTx(tx, book.id)
    })

    expect(dbh.db.select().from(readingBookTable).all()).toEqual([])
    expect(dbh.db.select().from(readingChapterTable).all()).toEqual([])
    expect(dbh.db.select().from(readingTopicContextTable).all()).toEqual([])
  })
})
