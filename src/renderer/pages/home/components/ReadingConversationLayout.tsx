import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@cherrystudio/ui'
import { FilePreview } from '@renderer/components/FilePreview'
import type { ReadingTopicSource } from '@shared/data/types/reading'
import type { ReactNode } from 'react'

interface ReadingConversationLayoutProps {
  source: ReadingTopicSource
  children: ReactNode
}

export function ReadingConversationLayout({ source, children }: ReadingConversationLayoutProps) {
  return (
    <ResizablePanelGroup direction="horizontal" className="h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden">
      <ResizablePanel id="reading-pdf" defaultSize="42%" minSize="25%" maxSize="65%" className="h-full min-h-0 min-w-0">
        <div className="flex h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden bg-background">
          <FilePreview filePath={source.sourcePath} />
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel id="reading-chat" defaultSize="58%" minSize="35%" className="h-full min-h-0 min-w-0">
        <div className="flex h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden">{children}</div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
