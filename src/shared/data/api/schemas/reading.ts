import type { ReadingBook, ReadingChapter, ReadingTopicContext } from '@shared/data/types/reading'
import * as z from 'zod'

export const ReadingBookStatusSchema = z.enum(['pending', 'processing', 'ready', 'failed'])

export const ReadingBookSchema = z.strictObject({
  id: z.string(),
  assistantId: z.string(),
  title: z.string(),
  sourceName: z.string(),
  status: ReadingBookStatusSchema,
  parseJobId: z.string().optional(),
  parseRevision: z.number().int().nonnegative(),
  errorMessage: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
}) satisfies z.ZodType<ReadingBook>

export const ReadingChapterSchema = z.strictObject({
  id: z.string(),
  bookId: z.string(),
  revision: z.number().int().nonnegative(),
  title: z.string(),
  level: z.number().int().nonnegative(),
  orderIndex: z.number().int().nonnegative(),
  pageStart: z.number().int().nonnegative().optional(),
  blockStart: z.number().int().nonnegative(),
  blockEnd: z.number().int().nonnegative(),
  content: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
}) satisfies z.ZodType<ReadingChapter>

export const ReadingTopicContextSchema = z.strictObject({
  topicId: z.string(),
  bookId: z.string(),
  revision: z.number().int().nonnegative(),
  startOrderIndex: z.number().int().nonnegative(),
  endOrderIndex: z.number().int().nonnegative(),
  estimatedTokens: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string()
}) satisfies z.ZodType<ReadingTopicContext>

export type ReadingSchemas = {
  '/reading-books': {
    GET: { response: ReadingBook[] }
  }
  '/reading-books/:id': {
    GET: { params: { id: string }; response: ReadingBook }
  }
  '/reading-books/:id/chapters': {
    GET: { params: { id: string }; response: ReadingChapter[] }
  }
  '/reading-topics/:topicId/context': {
    GET: { params: { topicId: string }; response: ReadingTopicContext }
  }
}
