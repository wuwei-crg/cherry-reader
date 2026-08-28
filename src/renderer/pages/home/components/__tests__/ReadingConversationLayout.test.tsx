import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@renderer/components/FilePreview', () => ({
  FilePreview: ({ filePath }: { filePath: string }) => <div data-testid="pdf-preview">{filePath}</div>
}))

vi.mock('@cherrystudio/ui', () => ({
  ResizableHandle: () => <div data-testid="resize-handle" />,
  ResizablePanel: ({
    children,
    defaultSize,
    minSize,
    maxSize,
    id
  }: {
    children: ReactNode
    defaultSize?: string
    minSize?: string
    maxSize?: string
    id?: string
  }) => (
    <div
      data-testid={id ? `resizable-panel-${id}` : undefined}
      data-default-size={defaultSize}
      data-min-size={minSize}
      data-max-size={maxSize}>
      {children}
    </div>
  ),
  ResizablePanelGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

import { ReadingConversationLayout } from '../ReadingConversationLayout'

afterEach(cleanup)

describe('ReadingConversationLayout', () => {
  it('keeps the whole source PDF beside the reading conversation', () => {
    render(
      <ReadingConversationLayout
        source={{ bookId: 'book-1', title: 'Book', sourcePath: 'C:/books/book.pdf', topicId: 'topic-1' }}>
        <div>Chat</div>
      </ReadingConversationLayout>
    )

    expect(screen.getByTestId('pdf-preview')).toHaveTextContent('C:/books/book.pdf')
    expect(screen.getByText('Chat')).toBeInTheDocument()
    expect(screen.getByTestId('resize-handle')).toBeInTheDocument()
    expect(screen.getByTestId('resizable-panel-reading-pdf')).toHaveAttribute('data-default-size', '42%')
    expect(screen.getByTestId('resizable-panel-reading-pdf')).toHaveAttribute('data-min-size', '25%')
    expect(screen.getByTestId('resizable-panel-reading-pdf')).toHaveAttribute('data-max-size', '65%')
    expect(screen.getByTestId('resizable-panel-reading-chat')).toHaveAttribute('data-default-size', '58%')
    expect(screen.getByTestId('resizable-panel-reading-chat')).toHaveAttribute('data-min-size', '35%')
  })
})
