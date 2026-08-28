import fs from 'node:fs/promises'
import path from 'node:path'

import { application } from '@application'
import { assistantDataService } from '@data/services/AssistantService'
import { jobService } from '@data/services/JobService'
import { loggerService } from '@logger'
import { BaseService, DependsOn, Injectable, Phase, ServicePhase } from '@main/core/lifecycle'
import { readingBookService } from '@main/data/services/ReadingBookService'
import { topicService } from '@main/data/services/TopicService'
import { getFileProcessingMarkdownArtifactPath, getMineruContentListPath } from '@main/features/fileProcessing'
import type { JobSnapshot } from '@shared/data/api/schemas/jobs'
import { AbsoluteFilePathSchema } from '@shared/types/file'
import { createFilePathHandle } from '@shared/utils/file'
import { estimateTokenCount } from 'tokenx'
import { v4 as uuidv4 } from 'uuid'

import { extractReadingChapters } from './chapterExtraction'

const logger = loggerService.withContext('ReadingService')
const MAX_SELECTED_CONTEXT_TOKENS = 100_000
const READING_ASSISTANT_PROMPT =
  'You are a reading assistant. Base your answers on the selected book sections, explain concepts clearly, and distinguish the book text from your own inferences. Ask a focused follow-up question when it helps learning.'

@Injectable('ReadingService')
@ServicePhase(Phase.WhenReady)
@DependsOn(['FileProcessingService'])
export class ReadingService extends BaseService {
  protected onInit(): void {
    for (const book of readingBookService.list()) {
      if (book.status === 'processing' && book.parseJobId) void this.finishWhenSettled(book.id, book.parseJobId)
    }
  }

  async importPdf(input: {
    sourcePath: string
    sourceName: string
    title: string
  }): Promise<{ bookId: string; assistantId: string }> {
    const assistant = assistantDataService.create({
      name: input.title,
      description: input.sourceName,
      emoji: '📖',
      prompt: READING_ASSISTANT_PROMPT
    })
    const book = application
      .get('DbService')
      .withWriteTx((tx) => readingBookService.createBookTx(tx, { assistantId: assistant.id, ...input }))
    const outputPath = AbsoluteFilePathSchema.parse(
      path.join(application.getPath('feature.reading.data'), `${book.id}.md`)
    )
    try {
      const snapshot = await application.get('FileProcessingService').startJob({
        feature: 'document_to_markdown',
        processorId: 'mineru',
        file: createFilePathHandle(AbsoluteFilePathSchema.parse(input.sourcePath)),
        output: { kind: 'path', path: outputPath, preserveMineruContentList: true },
        context: { dataId: uuidv4() }
      })
      readingBookService.markProcessing(book.id, snapshot.id)
      void this.finishWhenSettled(book.id, snapshot.id)
      return { bookId: book.id, assistantId: assistant.id }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      readingBookService.markFailed(book.id, message)
      throw error
    }
  }

  renameBook(input: { bookId: string; title: string }): { title: string } {
    const book = application.get('DbService').withWriteTx((tx) => {
      const current = readingBookService.getByIdTx(tx, input.bookId)
      assistantDataService.restoreDeletedTx(tx, current.assistantId)
      assistantDataService.renameTx(tx, current.assistantId, input.title)
      return readingBookService.renameTx(tx, current.id, input.title)
    })
    readingBookService.notifyBookChange(book.id)
    return { title: book.title }
  }

  async deleteBook(input: { bookId: string }): Promise<void> {
    const current = readingBookService.getById(input.bookId)
    if (current.status === 'processing' && current.parseJobId) {
      await application.get('JobManager').cancel(current.parseJobId, 'Reading book deleted')
    }

    const { book, deletedTopicIds } = application.get('DbService').withWriteTx((tx) => {
      const book = readingBookService.deleteTx(tx, input.bookId)
      // Older versions allowed the linked assistant to be soft-deleted from
      // the general assistant library. Clean up its topics and book even when
      // the assistant row is already soft-deleted.
      const deletedTopicIds = topicService.deleteByAssistantIdTx(tx, book.assistantId, { validateAssistant: false })
      assistantDataService.deleteTx(tx, book.assistantId, { allowReadingOwner: true })
      return { book, deletedTopicIds }
    })
    readingBookService.notifyBookChange(book.id)
    assistantDataService.notifyDeleted(book.assistantId, deletedTopicIds)

    const markdownPath = this.getMarkdownPath(book.id)
    try {
      await Promise.all([
        fs.rm(markdownPath, { force: true }),
        fs.rm(getMineruContentListPath(markdownPath), { force: true })
      ])
    } catch (error) {
      logger.warn('Failed to remove reading artifacts after deleting book', { bookId: book.id, error })
    }
  }

  createTopic(input: { bookId: string; startOrderIndex: number; endOrderIndex: number }): { topicId: string } {
    const book = readingBookService.getById(input.bookId)
    if (book.status !== 'ready') throw new Error('The book is not ready for reading yet')
    if (input.startOrderIndex > input.endOrderIndex) throw new Error('The selected chapter range is invalid')
    const chapters = readingBookService
      .listChapters(book.id)
      .filter((chapter) => chapter.orderIndex >= input.startOrderIndex && chapter.orderIndex <= input.endOrderIndex)
    if (
      !chapters.length ||
      chapters[0].orderIndex !== input.startOrderIndex ||
      chapters.at(-1)?.orderIndex !== input.endOrderIndex
    ) {
      throw new Error('The selected chapter range is invalid')
    }
    const estimatedTokens = estimateTokenCount(chapters.map((chapter) => chapter.content).join('\n\n'))
    if (estimatedTokens > MAX_SELECTED_CONTEXT_TOKENS) {
      throw new Error(`The selected chapters contain about ${estimatedTokens} tokens. Please select a smaller range.`)
    }
    // A book may predate the isolation of reading assistants and have a
    // soft-deleted assistant. Restore that owner before creating a topic.
    application.get('DbService').withWriteTx((tx) => {
      assistantDataService.restoreDeletedTx(tx, book.assistantId)
    })
    const topic = topicService.create({ assistantId: book.assistantId })
    application.get('DbService').withWriteTx((tx) =>
      readingBookService.createTopicContextTx(tx, {
        topicId: topic.id,
        bookId: book.id,
        revision: book.parseRevision,
        startOrderIndex: input.startOrderIndex,
        endOrderIndex: input.endOrderIndex,
        estimatedTokens
      })
    )
    readingBookService.notifyTopicContextChange(topic.id)
    return { topicId: topic.id }
  }

  private async finishWhenSettled(bookId: string, jobId: string): Promise<void> {
    while (!this.isStopping) {
      const snapshot = jobService.getById(jobId)
      if (!snapshot) {
        readingBookService.markFailed(bookId, 'Document parsing job was not found')
        return
      }
      if (snapshot.status === 'completed' || snapshot.status === 'failed' || snapshot.status === 'cancelled') {
        await this.applyJobResult(bookId, snapshot)
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000))
    }
  }

  private async applyJobResult(bookId: string, snapshot: JobSnapshot): Promise<void> {
    if (snapshot.status !== 'completed') {
      if (readingBookService.findById(bookId)) {
        readingBookService.markFailed(bookId, snapshot.error?.message ?? 'MinerU document parsing failed')
      }
      return
    }
    try {
      const markdownPath = getFileProcessingMarkdownArtifactPath(snapshot)
      const contentList = JSON.parse(await fs.readFile(getMineruContentListPath(markdownPath), 'utf8'))
      const chapters = extractReadingChapters(contentList)
      if (!chapters.length) throw new Error('MinerU did not return readable document content')
      readingBookService.completeParse(bookId, chapters)
    } catch (error) {
      if (!readingBookService.findById(bookId)) return
      const message = error instanceof Error ? error.message : String(error)
      logger.error('Failed to import MinerU book result', { bookId, jobId: snapshot.id, error })
      readingBookService.markFailed(bookId, message)
    }
  }

  private getMarkdownPath(bookId: string) {
    return AbsoluteFilePathSchema.parse(path.join(application.getPath('feature.reading.data'), `${bookId}.md`))
  }
}
