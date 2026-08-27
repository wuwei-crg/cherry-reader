import { ReadingBookSchema } from '@shared/data/api/schemas/reading'
import { AbsoluteFilePathSchema } from '@shared/types/file'
import * as z from 'zod'

import { defineRoute } from '../define'

export const readingRequestSchemas = {
  'reading.import_pdf': defineRoute({
    input: z.strictObject({
      sourcePath: AbsoluteFilePathSchema,
      sourceName: z.string().trim().min(1),
      title: z.string().trim().min(1)
    }),
    output: z.strictObject({ bookId: z.string(), assistantId: z.string() })
  }),
  'reading.create_topic': defineRoute({
    input: z.strictObject({
      bookId: z.string().min(1),
      startOrderIndex: z.number().int().nonnegative(),
      endOrderIndex: z.number().int().nonnegative()
    }),
    output: z.strictObject({ topicId: z.string() })
  }),
  'reading.rename_book': defineRoute({
    input: z.strictObject({ bookId: z.string().min(1), title: z.string().trim().min(1) }),
    output: z.strictObject({ title: z.string() })
  }),
  'reading.delete_book': defineRoute({
    input: z.strictObject({ bookId: z.string().min(1) }),
    output: z.undefined()
  }),
  'reading.get_book': defineRoute({
    input: z.strictObject({ bookId: z.string().min(1) }),
    output: ReadingBookSchema
  })
}
