import ChevronLeft from 'lucide-react/dist/esm/icons/chevron-left'
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right'
import ListTree from 'lucide-react/dist/esm/icons/list-tree'
import Moon from 'lucide-react/dist/esm/icons/moon'
import Sun from 'lucide-react/dist/esm/icons/sun'
import ZoomIn from 'lucide-react/dist/esm/icons/zoom-in'
import ZoomOut from 'lucide-react/dist/esm/icons/zoom-out'
import { useTranslation } from 'react-i18next'

import { FilePreviewToolbar } from '../../FilePreviewToolbar'
import { FilePreviewToolbarButton } from '../../FilePreviewToolbarButton'

interface EpubFilePreviewToolbarProps {
  canNavigate: boolean
  fontSize: number
  onNextPage: () => void
  onPreviousPage: () => void
  onToggleContents: () => void
  onToggleTheme: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  theme: 'dark' | 'light'
  tocOpen: boolean
}

export function EpubFilePreviewToolbar({
  canNavigate,
  fontSize,
  onNextPage,
  onPreviousPage,
  onToggleContents,
  onToggleTheme,
  onZoomIn,
  onZoomOut,
  theme,
  tocOpen
}: EpubFilePreviewToolbarProps) {
  const { t } = useTranslation()

  return (
    <FilePreviewToolbar aria-label={t('file_preview.epub.toolbar')}>
      <FilePreviewToolbarButton
        label={t('file_preview.epub.contents')}
        disabled={!canNavigate}
        pressed={tocOpen}
        onClick={onToggleContents}>
        <ListTree aria-hidden />
      </FilePreviewToolbarButton>
      <FilePreviewToolbarButton label={t('common.previous')} disabled={!canNavigate} onClick={onPreviousPage}>
        <ChevronLeft aria-hidden />
      </FilePreviewToolbarButton>
      <FilePreviewToolbarButton label={t('common.next')} disabled={!canNavigate} onClick={onNextPage}>
        <ChevronRight aria-hidden />
      </FilePreviewToolbarButton>
      <span className="mx-1 h-4 w-px bg-border-subtle" aria-hidden />
      <FilePreviewToolbarButton label={t('preview.zoom_out')} disabled={!canNavigate} onClick={onZoomOut}>
        <ZoomOut aria-hidden />
      </FilePreviewToolbarButton>
      <span className="min-w-11 px-1 text-center text-muted-foreground text-xs tabular-nums">{fontSize}%</span>
      <FilePreviewToolbarButton label={t('preview.zoom_in')} disabled={!canNavigate} onClick={onZoomIn}>
        <ZoomIn aria-hidden />
      </FilePreviewToolbarButton>
      <FilePreviewToolbarButton label={t('file_preview.epub.theme')} disabled={!canNavigate} onClick={onToggleTheme}>
        {theme === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}
      </FilePreviewToolbarButton>
    </FilePreviewToolbar>
  )
}
