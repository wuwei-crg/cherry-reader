import { application } from '@application'
import { readingBookService } from '@data/services/ReadingBookService'
import type { readingRequestSchemas } from '@shared/ipc/schemas/reading'
import type { IpcHandlersFor } from '@shared/ipc/types'

export const readingHandlers: IpcHandlersFor<typeof readingRequestSchemas> = {
  'reading.import_pdf': async (input) => application.get('ReadingService').importPdf(input),
  'reading.create_topic': async (input) => application.get('ReadingService').createTopic(input),
  'reading.rename_book': async (input) => application.get('ReadingService').renameBook(input),
  'reading.delete_book': async (input) => {
    await application.get('ReadingService').deleteBook(input)
    return undefined
  },
  'reading.get_book': async ({ bookId }) => readingBookService.getById(bookId)
}
