import { application } from '@application'
import { notifyDataApiDataChange } from '@data/dataApiDataChange'
import { readingBookTable, readingChapterTable, readingTopicContextTable } from '@data/db/schemas/reading'
import { topicTable } from '@data/db/schemas/topic'
import type { DbOrTx } from '@data/db/types'
import { DataApiErrorFactory } from '@shared/data/api/errors'
import type { ReadingBook, ReadingChapter, ReadingTopicContext } from '@shared/data/types/reading'
import { and, asc, desc, eq, gte, isNull, lte } from 'drizzle-orm'

import { nullsToUndefined, timestampToISO } from './utils/rowMappers'

export type ReadingChapterInput = Omit<ReadingChapter, 'id' | 'bookId' | 'revision' | 'createdAt' | 'updatedAt'>

function toBook(row: typeof readingBookTable.$inferSelect): ReadingBook {
  return {
    ...nullsToUndefined(row),
    createdAt: timestampToISO(row.createdAt),
    updatedAt: timestampToISO(row.updatedAt)
  }
}

function toChapter(row: typeof readingChapterTable.$inferSelect): ReadingChapter {
  return {
    ...nullsToUndefined(row),
    createdAt: timestampToISO(row.createdAt),
    updatedAt: timestampToISO(row.updatedAt)
  }
}

function toTopicContext(row: typeof readingTopicContextTable.$inferSelect): ReadingTopicContext {
  return { ...row, createdAt: timestampToISO(row.createdAt), updatedAt: timestampToISO(row.updatedAt) }
}

export class ReadingBookService {
  list(): ReadingBook[] {
    return application
      .get('DbService')
      .getDb()
      .select()
      .from(readingBookTable)
      .orderBy(desc(readingBookTable.updatedAt))
      .all()
      .map(toBook)
  }

  getById(id: string): ReadingBook {
    return this.getByIdTx(application.get('DbService').getDb(), id)
  }

  getByIdTx(tx: Pick<DbOrTx, 'select'>, id: string): ReadingBook {
    const [row] = tx.select().from(readingBookTable).where(eq(readingBookTable.id, id)).limit(1).all()
    if (!row) throw DataApiErrorFactory.notFound('Reading book', id)
    return toBook(row)
  }

  findById(id: string): ReadingBook | undefined {
    const [row] = application
      .get('DbService')
      .getDb()
      .select()
      .from(readingBookTable)
      .where(eq(readingBookTable.id, id))
      .limit(1)
      .all()
    return row ? toBook(row) : undefined
  }

  getSourcePath(id: string): string {
    const [row] = application
      .get('DbService')
      .getDb()
      .select({ sourcePath: readingBookTable.sourcePath })
      .from(readingBookTable)
      .where(eq(readingBookTable.id, id))
      .limit(1)
      .all()
    if (!row) throw DataApiErrorFactory.notFound('Reading book', id)
    return row.sourcePath
  }

  listChapters(bookId: string): ReadingChapter[] {
    const book = this.getById(bookId)
    if (book.parseRevision === 0) return []
    return application
      .get('DbService')
      .getDb()
      .select()
      .from(readingChapterTable)
      .where(and(eq(readingChapterTable.bookId, bookId), eq(readingChapterTable.revision, book.parseRevision)))
      .orderBy(asc(readingChapterTable.orderIndex))
      .all()
      .map(toChapter)
  }

  getTopicContext(topicId: string): ReadingTopicContext {
    const context = this.findTopicContext(topicId)
    if (!context) throw DataApiErrorFactory.notFound('Reading topic context', topicId)
    return context
  }

  findTopicContext(topicId: string): ReadingTopicContext | undefined {
    const [row] = application
      .get('DbService')
      .getDb()
      .select()
      .from(readingTopicContextTable)
      .where(eq(readingTopicContextTable.topicId, topicId))
      .limit(1)
      .all()
    return row ? toTopicContext(row) : undefined
  }

  getSelectedChapters(topicId: string): ReadingChapter[] {
    const context = this.findTopicContext(topicId)
    if (!context) return []
    return application
      .get('DbService')
      .getDb()
      .select()
      .from(readingChapterTable)
      .where(
        and(
          eq(readingChapterTable.bookId, context.bookId),
          eq(readingChapterTable.revision, context.revision),
          gte(readingChapterTable.orderIndex, context.startOrderIndex),
          lte(readingChapterTable.orderIndex, context.endOrderIndex)
        )
      )
      .orderBy(asc(readingChapterTable.orderIndex))
      .all()
      .map(toChapter)
  }

  createBookTx(
    tx: DbOrTx,
    input: { assistantId: string; title: string; sourceName: string; sourcePath: string }
  ): ReadingBook {
    const [row] = tx
      .insert(readingBookTable)
      .values({ ...input, status: 'pending' })
      .returning()
      .all()
    return toBook(row)
  }

  renameTx(tx: DbOrTx, id: string, title: string): ReadingBook {
    const [row] = tx.update(readingBookTable).set({ title }).where(eq(readingBookTable.id, id)).returning().all()
    if (!row) throw DataApiErrorFactory.notFound('Reading book', id)
    return toBook(row)
  }

  deleteTx(tx: DbOrTx, id: string): ReadingBook {
    const [row] = tx.delete(readingBookTable).where(eq(readingBookTable.id, id)).returning().all()
    if (!row) throw DataApiErrorFactory.notFound('Reading book', id)
    return toBook(row)
  }

  markProcessing(id: string, jobId: string): void {
    application
      .get('DbService')
      .getDb()
      .update(readingBookTable)
      .set({ status: 'processing', parseJobId: jobId, errorMessage: null })
      .where(eq(readingBookTable.id, id))
      .run()
    this.notifyBookChange(id)
  }

  markFailed(id: string, errorMessage: string): void {
    application
      .get('DbService')
      .getDb()
      .update(readingBookTable)
      .set({ status: 'failed', errorMessage })
      .where(eq(readingBookTable.id, id))
      .run()
    this.notifyBookChange(id)
  }

  completeParse(id: string, chapters: ReadingChapterInput[]): ReadingBook {
    const book = application.get('DbService').withWriteTx((tx) => {
      const [current] = tx.select().from(readingBookTable).where(eq(readingBookTable.id, id)).limit(1).all()
      if (!current) throw DataApiErrorFactory.notFound('Reading book', id)
      const revision = current.parseRevision + 1
      const now = Date.now()
      tx.delete(readingChapterTable).where(eq(readingChapterTable.bookId, id)).run()
      if (chapters.length)
        tx.insert(readingChapterTable)
          .values(chapters.map((chapter) => ({ ...chapter, bookId: id, revision, createdAt: now, updatedAt: now })))
          .run()
      const [updated] = tx
        .update(readingBookTable)
        .set({ status: 'ready', parseRevision: revision, errorMessage: null, updatedAt: now })
        .where(eq(readingBookTable.id, id))
        .returning()
        .all()
      return toBook(updated)
    })
    this.notifyBookChange(id)
    return book
  }

  createTopicContextTx(tx: DbOrTx, input: Omit<ReadingTopicContext, 'createdAt' | 'updatedAt'>): ReadingTopicContext {
    const [topic] = tx
      .select({ id: topicTable.id })
      .from(topicTable)
      .where(and(eq(topicTable.id, input.topicId), isNull(topicTable.deletedAt)))
      .limit(1)
      .all()
    if (!topic) throw DataApiErrorFactory.notFound('Topic', input.topicId)
    const [row] = tx.insert(readingTopicContextTable).values(input).returning().all()
    return toTopicContext(row)
  }

  notifyTopicContextChange(topicId: string): void {
    notifyDataApiDataChange([{ endpoint: '/reading-topics/:topicId/context', entityIds: [topicId] }])
  }

  notifyBookChange(id: string): void {
    notifyDataApiDataChange([
      { endpoint: '/reading-books', kind: 'projection', entityIds: [id] },
      { endpoint: '/reading-books/:id', entityIds: [id] },
      { endpoint: '/reading-books/:id/chapters', entityIds: [id] }
    ])
  }
}

export const readingBookService = new ReadingBookService()
