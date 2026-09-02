import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@cherrystudio/ui'
import { usePreference } from '@data/hooks/usePreference'
import { FilePreview } from '@renderer/components/FilePreview'
import { SelectionContextMenuActionsProvider } from '@renderer/components/SelectionContextMenu'
import { ipcApi } from '@renderer/ipc'
import type { SelectionActionItem } from '@shared/data/preference/preferenceTypes'
import type { ReadingTopicSource } from '@shared/data/types/reading'
import { type ReactNode, useCallback } from 'react'

interface ReadingConversationLayoutProps {
  source: ReadingTopicSource
  children: ReactNode
}

export function ReadingConversationLayout({ source, children }: ReadingConversationLayoutProps) {
  const [actionItems] = usePreference('feature.selection.action_items')
  const translateAction = actionItems.find((item) => item.id === 'translate' && item.isBuiltIn && item.enabled)
  const onTranslate = useCallback(
    (text: string) => {
      if (!translateAction) return

      const actionItem: SelectionActionItem = { ...translateAction, selectedText: text }
      void ipcApi.request('selection.process_action', { actionItem, isFullScreen: false })
      void ipcApi.request('selection.hide_toolbar')
    },
    [translateAction]
  )

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden">
      <ResizablePanel id="reading-pdf" defaultSize="42%" minSize="25%" maxSize="65%" className="h-full min-h-0 min-w-0">
        <div className="flex h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden bg-background">
          <SelectionContextMenuActionsProvider onTranslate={translateAction ? onTranslate : undefined}>
            <FilePreview filePath={source.sourcePath} />
          </SelectionContextMenuActionsProvider>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel id="reading-chat" defaultSize="58%" minSize="35%" className="h-full min-h-0 min-w-0">
        <div className="flex h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden">{children}</div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
