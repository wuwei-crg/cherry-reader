import { application } from '@application'
import { loggerService } from '@logger'
import { atomicWriteFile } from '@main/utils/file'
import { sanitizeRemoteUrl } from '@main/utils/remoteUrlSafety'
import { type AbsoluteFilePath, AbsoluteFilePathSchema } from '@shared/types/file'
import { redactUrlToOrigin } from '@shared/utils/redaction'
import { net } from 'electron'

import { readMarkdownFromResponseZip, readMineruArtifactsFromResponseZip } from './resultPersistence'

const logger = loggerService.withContext('MarkdownResultStore')

export type MarkdownPersistencePayload =
  | {
      kind: 'markdown'
      markdownContent: string
    }
  | {
      kind: 'remote-zip-url'
      downloadUrl: string
      configuredApiHost: string
    }
  | {
      kind: 'response-zip'
      response: Response
    }

class MarkdownResultStore {
  async persistResultToPath(options: {
    jobId: string
    result: MarkdownPersistencePayload
    path: AbsoluteFilePath
    preserveMineruContentList?: boolean
    signal?: AbortSignal
  }): Promise<AbsoluteFilePath> {
    try {
      if (
        options.preserveMineruContentList &&
        (options.result.kind === 'remote-zip-url' || options.result.kind === 'response-zip')
      ) {
        const artifacts = await this.resolveMineruArtifacts(options.result, options.signal)
        await atomicWriteFile(options.path, artifacts.markdown)
        await atomicWriteFile(getMineruContentListPath(options.path), artifacts.contentList)
        return options.path
      }
      const data = await this.resolveMarkdownBytes(options)
      await atomicWriteFile(options.path, data)
      return options.path
    } catch (error) {
      logger.warn(
        'Markdown result path persistence failed',
        getSafeMarkdownPersistenceErrorForLog(error),
        getMarkdownPersistenceLogContext(options)
      )
      throw error
    }
  }

  private async resolveMineruArtifacts(
    result: Extract<MarkdownPersistencePayload, { kind: 'remote-zip-url' | 'response-zip' }>,
    signal?: AbortSignal
  ): Promise<{ markdown: Uint8Array; contentList: Uint8Array }> {
    if (result.kind === 'response-zip') {
      return await this.readMineruArtifactsFromZipResponse(result.response, signal)
    }
    const safeDownloadUrl = sanitizeRemoteUrl(result.downloadUrl, result.configuredApiHost)
    const response = await net.fetch(safeDownloadUrl, { method: 'GET', redirect: 'error', signal })
    if (!response.ok) throw new Error(`Markdown result download failed: ${response.status} ${response.statusText}`)
    if (response.headers.get('content-type') !== 'application/zip') {
      throw new Error(
        `Markdown result download returned unexpected content-type: ${response.headers.get('content-type')}`
      )
    }
    return await this.readMineruArtifactsFromZipResponse(response, signal)
  }

  private async resolveMarkdownBytes(options: {
    result: MarkdownPersistencePayload
    signal?: AbortSignal
  }): Promise<Uint8Array> {
    switch (options.result.kind) {
      case 'markdown':
        return new TextEncoder().encode(options.result.markdownContent)

      case 'response-zip':
        return await this.readMarkdownFromZipResponse(options.result.response, options.signal)

      case 'remote-zip-url': {
        const safeDownloadUrl = sanitizeRemoteUrl(options.result.downloadUrl, options.result.configuredApiHost)
        const response = await net.fetch(safeDownloadUrl, {
          method: 'GET',
          redirect: 'error',
          signal: options.signal
        })

        if (!response.ok) {
          throw new Error(`Markdown result download failed: ${response.status} ${response.statusText}`)
        }

        const contentType = response.headers.get('content-type')
        if (contentType !== 'application/zip') {
          throw new Error(`Markdown result download returned unexpected content-type: ${contentType}`)
        }

        return await this.readMarkdownFromZipResponse(response, options.signal)
      }
    }
  }

  private async readMarkdownFromZipResponse(response: Response, signal?: AbortSignal): Promise<Uint8Array> {
    return await readMarkdownFromResponseZip({
      response,
      tempDir: application.getPath('feature.file_processing.temp'),
      signal
    })
  }

  private async readMineruArtifactsFromZipResponse(
    response: Response,
    signal?: AbortSignal
  ): Promise<{ markdown: Uint8Array; contentList: Uint8Array }> {
    return await readMineruArtifactsFromResponseZip({
      response,
      tempDir: application.getPath('feature.file_processing.temp'),
      signal
    })
  }
}

export function getMineruContentListPath(markdownPath: AbsoluteFilePath): AbsoluteFilePath {
  return AbsoluteFilePathSchema.parse(`${markdownPath}.content_list.json`)
}

export const markdownResultStore = new MarkdownResultStore()

function getMarkdownPersistenceLogContext(options: {
  jobId: string
  result: MarkdownPersistencePayload
}): Record<string, unknown> {
  const context: Record<string, unknown> = {
    jobId: options.jobId,
    resultKind: options.result.kind
  }

  if (options.result.kind === 'remote-zip-url') {
    context.downloadUrl = redactUrlToOrigin(options.result.downloadUrl)
    context.configuredApiHost = options.result.configuredApiHost
  }

  return context
}

function getSafeMarkdownPersistenceErrorForLog(error: unknown): Error {
  if (!(error instanceof Error)) {
    return new Error(String(error))
  }

  if (error.message.startsWith('Markdown result download failed:')) {
    const safeError = new Error('Markdown result download failed')
    safeError.name = error.name
    return safeError
  }

  return error
}
