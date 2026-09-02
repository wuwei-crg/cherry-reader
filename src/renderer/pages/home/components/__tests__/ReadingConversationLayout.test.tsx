import type { AbsoluteFilePath } from '@shared/types/file'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  actionItems: [
    {
      enabled: true,
      icon: 'languages',
      id: 'translate',
      isBuiltIn: true,
      name: 'selection.action.builtin.translate'
    }
  ],
  ipcRequest: vi.fn()
}))

vi.mock('@data/hooks/usePreference', () => ({
  usePreference: () => [mocks.actionItems, vi.fn()]
}))

vi.mock('@renderer/ipc', () => ({
  ipcApi: { request: mocks.ipcRequest }
}))

vi.mock('@renderer/components/SelectionContextMenu', () => ({
  SelectionContextMenuActionsProvider: ({
    children,
    onTranslate
  }: {
    children: ReactNode
    onTranslate: (text: string) => void
  }) => (
    <div data-testid="selection-actions-provider">
      <button type="button" onClick={() => onTranslate('selected text')}>
        translate
      </button>
      {children}
    </div>
  )
}))

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
  afterEach(() => {
    mocks.ipcRequest.mockReset()
  })

  it('keeps the whole source PDF beside the reading conversation', () => {
    render(
      <ReadingConversationLayout
        source={{
          bookId: 'book-1',
          title: 'Book',
          sourcePath: 'C:/books/book.pdf' as AbsoluteFilePath,
          topicId: 'topic-1'
        }}>
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

  it('routes the reading PDF translation action through the existing selection window', () => {
    render(
      <ReadingConversationLayout
        source={{
          bookId: 'book-1',
          title: 'Book',
          sourcePath: 'C:/books/book.pdf' as AbsoluteFilePath,
          topicId: 'topic-1'
        }}>
        <div>Chat</div>
      </ReadingConversationLayout>
    )

    screen.getByRole('button', { name: 'translate' }).click()

    expect(mocks.ipcRequest).toHaveBeenNthCalledWith(1, 'selection.process_action', {
      actionItem: { ...mocks.actionItems[0], selectedText: 'selected text' },
      isFullScreen: false
    })
    expect(mocks.ipcRequest).toHaveBeenNthCalledWith(2, 'selection.hide_toolbar')
  })
})
