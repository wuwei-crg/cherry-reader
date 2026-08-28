import { readingBookService } from '@data/services/ReadingBookService'
import type { ReadingSchemas } from '@shared/data/api/schemas/reading'
import type { HandlersFor } from '@shared/data/api/types'

export const readingHandlers: HandlersFor<ReadingSchemas> = {
  '/reading-books': { GET: async () => readingBookService.list() },
  '/reading-books/:id': { GET: async ({ params }) => readingBookService.getById(params.id) },
  '/reading-books/:id/chapters': { GET: async ({ params }) => readingBookService.listChapters(params.id) },
  '/reading-topics/:topicId/context': { GET: async ({ params }) => readingBookService.getTopicContext(params.topicId) },
  '/reading-topics/:topicId/source': {
    GET: async ({ params }) => readingBookService.findTopicSource(params.topicId) ?? null
  }
}
