import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  assistantCreateMock,
  completeParseMock,
  copyFileMock,
  createBookTxMock,
  extractEpubReadingChaptersMock,
  fileProcessingStartJobMock,
  getSourcePathMock,
  markFailedMock,
  removeFileMock
} = vi.hoisted(() => ({
  assistantCreateMock: vi.fn(),
  completeParseMock: vi.fn(),
  copyFileMock: vi.fn(),
  createBookTxMock: vi.fn(),
  extractEpubReadingChaptersMock: vi.fn(),
  fileProcessingStartJobMock: vi.fn(),
  getSourcePathMock: vi.fn(),
  markFailedMock: vi.fn(),
  removeFileMock: vi.fn()
}))

vi.mock('node:fs/promises', () => ({
  default: { copyFile: copyFileMock, rm: removeFileMock, readFile: vi.fn() }
}))

vi.mock('@application', () => ({
  application: {
    getPath: () => 'D:\\reading-data',
    get: (name: string) => {
      if (name === 'DbService') return { withWriteTx: (callback: (tx: object) => unknown) => callback({}) }
      if (name === 'FileProcessingService') return { startJob: fileProcessingStartJobMock }
      throw new Error(`Unexpected application.get(${name})`)
    }
  }
}))

vi.mock('@data/services/AssistantService', () => ({
  assistantDataService: { create: assistantCreateMock, deleteTx: vi.fn(), notifyDeleted: vi.fn() }
}))

vi.mock('@data/services/JobService', () => ({ jobService: { getById: vi.fn() } }))
vi.mock('@main/data/services/ReadingBookService', () => ({
  readingBookService: {
    createBookTx: createBookTxMock,
    completeParse: completeParseMock,
    deleteTx: vi.fn(() => ({ id: 'book-id', assistantId: 'assistant-id' })),
    getById: vi.fn(() => ({ id: 'book-id', assistantId: 'assistant-id', status: 'ready' })),
    getSourcePath: getSourcePathMock,
    markFailed: markFailedMock,
    list: vi.fn(() => []),
    notifyBookChange: vi.fn()
  }
}))
vi.mock('@main/data/services/TopicService', () => ({
  topicService: { deleteByAssistantIdTx: vi.fn(() => []) }
}))
vi.mock('@logger', () => ({
  loggerService: { withContext: () => ({ error: vi.fn(), warn: vi.fn() }) }
}))
vi.mock('@main/features/fileProcessing', () => ({
  getFileProcessingMarkdownArtifactPath: vi.fn(),
  getMineruContentListPath: vi.fn(() => 'D:\\reading-data\\book-id_content_list.json')
}))
vi.mock('@shared/utils/file', () => ({ createFilePathHandle: vi.fn() }))
vi.mock('uuid', () => ({ v4: () => 'book-id' }))
vi.mock('../epubExtraction', () => ({ extractEpubReadingChapters: extractEpubReadingChaptersMock }))

const { ReadingService } = await import('../ReadingService')
const service = new ReadingService()

describe('ReadingService EPUB import', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    copyFileMock.mockResolvedValue(undefined)
    removeFileMock.mockResolvedValue(undefined)
    assistantCreateMock.mockReturnValue({ id: 'assistant-id' })
    createBookTxMock.mockReturnValue({ id: 'book-id' })
    getSourcePathMock.mockReturnValue('D:\\reading-data\\book-id.epub')
    extractEpubReadingChaptersMock.mockResolvedValue([
      { title: 'Chapter 1', level: 1, orderIndex: 0, blockStart: 0, blockEnd: 1, content: 'Text' }
    ])
  })

  it('parses EPUB locally and completes the book without submitting a MinerU job', async () => {
    await expect(
      service.importBook({ sourcePath: 'C:\\imports\\book.epub', sourceName: 'book.epub', title: 'Book' })
    ).resolves.toEqual({ bookId: 'book-id', assistantId: 'assistant-id' })

    expect(copyFileMock).toHaveBeenCalledWith('C:\\imports\\book.epub', 'D:\\reading-data\\book-id.epub')
    expect(extractEpubReadingChaptersMock).toHaveBeenCalledWith('D:\\reading-data\\book-id.epub')
    expect(completeParseMock).toHaveBeenCalledWith('book-id', [
      { title: 'Chapter 1', level: 1, orderIndex: 0, blockStart: 0, blockEnd: 1, content: 'Text' }
    ])
    expect(fileProcessingStartJobMock).not.toHaveBeenCalled()
  })

  it('marks the book failed when local EPUB parsing fails', async () => {
    extractEpubReadingChaptersMock.mockRejectedValue(new Error('Invalid EPUB'))

    await expect(
      service.importBook({ sourcePath: 'C:\\imports\\book.epub', sourceName: 'book.epub', title: 'Book' })
    ).rejects.toThrow('Invalid EPUB')

    expect(markFailedMock).toHaveBeenCalledWith('book-id', 'Invalid EPUB')
    expect(completeParseMock).not.toHaveBeenCalled()
    expect(fileProcessingStartJobMock).not.toHaveBeenCalled()
  })

  it('removes the managed EPUB source when deleting the book', async () => {
    await service.deleteBook({ bookId: 'book-id' })

    expect(getSourcePathMock).toHaveBeenCalledWith('book-id')
    expect(removeFileMock).toHaveBeenCalledWith('D:\\reading-data\\book-id.epub', { force: true })
  })
})
