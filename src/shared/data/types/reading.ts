export type ReadingBookStatus = 'pending' | 'processing' | 'ready' | 'failed'

export interface ReadingChapter {
  id: string
  bookId: string
  revision: number
  title: string
  level: number
  orderIndex: number
  pageStart?: number
  blockStart: number
  blockEnd: number
  content: string
  createdAt: string
  updatedAt: string
}

export interface ReadingBook {
  id: string
  assistantId: string
  title: string
  sourceName: string
  status: ReadingBookStatus
  parseJobId?: string
  parseRevision: number
  errorMessage?: string
  createdAt: string
  updatedAt: string
}

export interface ReadingTopicContext {
  topicId: string
  bookId: string
  revision: number
  startOrderIndex: number
  endOrderIndex: number
  estimatedTokens: number
  createdAt: string
  updatedAt: string
}
