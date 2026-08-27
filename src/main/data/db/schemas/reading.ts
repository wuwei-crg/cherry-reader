import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

import { createUpdateDeleteTimestamps, uuidPrimaryKey } from './_columnHelpers'
import { assistantTable } from './assistant'
import { topicTable } from './topic'

export const readingBookTable = sqliteTable(
  'reading_book',
  {
    id: uuidPrimaryKey(),
    assistantId: text()
      .notNull()
      .references(() => assistantTable.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    sourceName: text().notNull(),
    sourcePath: text().notNull(),
    status: text({ enum: ['pending', 'processing', 'ready', 'failed'] })
      .notNull()
      .default('pending'),
    parseJobId: text(),
    parseRevision: integer().notNull().default(0),
    errorMessage: text(),
    ...createUpdateDeleteTimestamps
  },
  (t) => [
    uniqueIndex('reading_book_assistant_id_unique').on(t.assistantId),
    index('reading_book_status_idx').on(t.status),
    index('reading_book_created_at_idx').on(t.createdAt)
  ]
)

export const readingChapterTable = sqliteTable(
  'reading_chapter',
  {
    id: uuidPrimaryKey(),
    bookId: text()
      .notNull()
      .references(() => readingBookTable.id, { onDelete: 'cascade' }),
    revision: integer().notNull(),
    title: text().notNull(),
    level: integer().notNull(),
    orderIndex: integer().notNull(),
    pageStart: integer(),
    blockStart: integer().notNull(),
    blockEnd: integer().notNull(),
    content: text().notNull(),
    ...createUpdateDeleteTimestamps
  },
  (t) => [
    uniqueIndex('reading_chapter_book_revision_order_unique').on(t.bookId, t.revision, t.orderIndex),
    index('reading_chapter_book_revision_idx').on(t.bookId, t.revision)
  ]
)

export const readingTopicContextTable = sqliteTable(
  'reading_topic_context',
  {
    topicId: text()
      .primaryKey()
      .references(() => topicTable.id, { onDelete: 'cascade' }),
    bookId: text()
      .notNull()
      .references(() => readingBookTable.id, { onDelete: 'cascade' }),
    revision: integer().notNull(),
    startOrderIndex: integer().notNull(),
    endOrderIndex: integer().notNull(),
    estimatedTokens: integer().notNull(),
    createdAt: integer().notNull().$defaultFn(Date.now),
    updatedAt: integer().notNull().$defaultFn(Date.now)
  },
  (t) => [index('reading_topic_context_book_id_idx').on(t.bookId)]
)

export type ReadingBookRow = typeof readingBookTable.$inferSelect
export type ReadingChapterRow = typeof readingChapterTable.$inferSelect
export type ReadingTopicContextRow = typeof readingTopicContextTable.$inferSelect
