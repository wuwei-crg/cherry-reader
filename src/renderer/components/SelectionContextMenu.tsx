import { loggerService } from '@logger'
import { CommandContextMenu, type CommandContextMenuExtraItem } from '@renderer/components/command'
import { toast } from '@renderer/services/toast'
import { createContext, use, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

const logger = loggerService.withContext('SelectionContextMenu')

const TEXT_BLOCK_TAGS = new Set(['BLOCKQUOTE', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'P', 'PRE', 'TR'])

interface SelectionContextMenuProps {
  children: React.ReactNode
}

interface SelectionContextMenuActions {
  onTranslate?: (text: string) => void
}

const SelectionContextMenuActionsContext = createContext<SelectionContextMenuActions>({})

export function SelectionContextMenuActionsProvider({
  children,
  onTranslate
}: SelectionContextMenuActions & { children: React.ReactNode }) {
  const value = useMemo(() => ({ onTranslate }), [onTranslate])
  return <SelectionContextMenuActionsContext value={value}>{children}</SelectionContextMenuActionsContext>
}

/**
 * Extract text content from a Selection, restoring KaTeX formulas to their TeX source and
 * filtering out line numbers in code viewers.
 */
function extractSelectedText(selection: Selection): string {
  if (selection.rangeCount === 0 || selection.isCollapsed) {
    return ''
  }

  const range = selection.getRangeAt(0).cloneRange()
  const startElement =
    range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement
  const endElement = range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement
  const startKatex = startElement?.closest('.katex')
  const endKatex = endElement?.closest('.katex')

  if (startKatex) range.setStartBefore(startKatex)
  if (endKatex) range.setEndAfter(endKatex)

  const fragment = range.cloneContents()
  const hasLineNumbers = fragment.querySelectorAll('.line-number').length > 0
  const katexMathMlElements = fragment.querySelectorAll('.katex-mathml')
  const hasKatex = katexMathMlElements.length > 0

  if (!hasLineNumbers && !hasKatex) {
    return selection.toString()
  }

  fragment.querySelectorAll('.line-number').forEach((el) => el.remove())
  fragment.querySelectorAll('.katex-mathml + .katex-html').forEach((el) => el.remove())
  katexMathMlElements.forEach((element) => {
    const texSource = element.querySelector('annotation')?.textContent
    if (texSource !== null && texSource !== undefined) {
      element.replaceWith(document.createTextNode(texSource))
    }
  })

  const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null)

  let result = ''
  let node = walker.nextNode()

  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element
      if (element.tagName === 'BR') {
        result += '\n'
      } else if (
        result.length > 0 &&
        !result.endsWith('\n') &&
        (TEXT_BLOCK_TAGS.has(element.tagName) || element.classList.contains('line'))
      ) {
        result += '\n'
      }
    }

    node = walker.nextNode()
  }

  return result
}

/**
 * Right-click menu for selected text regions. Copy and quote are always available;
 * scoped actions such as translation can be added by a provider. No selection means
 * no selection-specific actions.
 */
const SelectionContextMenu: React.FC<SelectionContextMenuProps> = ({ children }) => {
  const { t } = useTranslation()
  const { onTranslate } = use(SelectionContextMenuActionsContext)
  const [selectedText, setSelectedText] = useState('')

  const getSelectedText = useCallback((): string => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return ''
    }
    return extractSelectedText(selection)
  }, [])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) return
      setSelectedText(getSelectedText())
    },
    [getSelectedText]
  )

  const handleCopy = useCallback(
    (text: string) => {
      navigator.clipboard
        .writeText(text)
        .then(() => toast.success(t('message.copied')))
        .catch((error) => {
          logger.error('clipboard write failed', error as Error)
          toast.error(t('message.copy.failed'))
        })
    },
    [t]
  )

  const handleQuote = useCallback((text: string) => {
    void window.api.quoteToMainWindow(text)
  }, [])

  const getMenuItems = useCallback(
    (text: string): CommandContextMenuExtraItem[] => {
      if (text.length === 0) return []

      const items: CommandContextMenuExtraItem[] = []
      if (onTranslate) {
        items.push({
          type: 'item',
          id: 'selection.translate',
          label: t('selection.action.builtin.translate'),
          onSelect: () => onTranslate(text)
        })
      }
      items.push(
        {
          type: 'item',
          id: 'selection.copy',
          label: t('common.copy'),
          onSelect: () => handleCopy(text)
        },
        {
          type: 'item',
          id: 'selection.quote',
          label: t('chat.message.quote'),
          onSelect: () => handleQuote(text)
        }
      )
      return items
    },
    [handleCopy, handleQuote, onTranslate, t]
  )

  const extraItems = useMemo(() => getMenuItems(selectedText), [getMenuItems, selectedText])
  const getExtraItems = useCallback(() => {
    const text = getSelectedText()
    setSelectedText(text)
    return getMenuItems(text)
  }, [getMenuItems, getSelectedText])

  return (
    <CommandContextMenu
      location="chat.message.context"
      extraItems={extraItems}
      getExtraItems={getExtraItems}
      onOpenChange={handleOpenChange}>
      {children}
    </CommandContextMenu>
  )
}

export default SelectionContextMenu
