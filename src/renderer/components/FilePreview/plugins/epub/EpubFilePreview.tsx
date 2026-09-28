import { EmptyState } from '@cherrystudio/ui'
import { loggerService } from '@logger'
import { ipcApi } from '@renderer/ipc'
import { toast } from '@renderer/services/toast'
import { safeOpen } from '@renderer/utils/file/safeOpen'
import { createFilePathHandle } from '@shared/utils/file'
import ePub, { type Book, type Location, type NavItem, type Rendition } from 'epubjs'
import BookOpen from 'lucide-react/dist/esm/icons/book-open'
import FileWarning from 'lucide-react/dist/esm/icons/file-warning'
import LoaderCircle from 'lucide-react/dist/esm/icons/loader-circle'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FilePreviewLayout } from '../../FilePreviewLayout'
import type { FilePreviewPluginProps } from '../../types'
import { EpubFilePreviewToolbar } from './EpubFilePreviewToolbar'

const logger = loggerService.withContext('EpubFilePreview')
const EPUB_MAX_SIZE_MIB = 256
const EPUB_MAX_SIZE_BYTES = EPUB_MAX_SIZE_MIB * 1024 * 1024
const MIN_FONT_SIZE = 80
const MAX_FONT_SIZE = 180
const FONT_SIZE_STEP = 10
const EPUB_CSP = [
  "default-src 'none'",
  'img-src data: blob:',
  'media-src data: blob:',
  'font-src data: blob:',
  "style-src 'unsafe-inline' blob:",
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

type EpubLoadStatus = 'error' | 'loading' | 'ready' | 'too_large'

interface FlatNavItem {
  depth: number
  href: string
  id: string
  label: string
}

function flattenNavigation(items: NavItem[], depth = 0): FlatNavItem[] {
  return items.flatMap((item) => [
    { depth, href: item.href, id: item.id, label: item.label.trim() },
    ...flattenNavigation(item.subitems ?? [], depth + 1)
  ])
}

function isBlockedUrl(value: string): boolean {
  const normalized = [...value.trim()]
    .filter((character) => character.charCodeAt(0) > 0x1f && character !== '\u007f')
    .join('')
    .toLowerCase()
  return (
    normalized.startsWith('javascript:') ||
    normalized.startsWith('vbscript:') ||
    normalized.startsWith('file:') ||
    normalized.startsWith('http:') ||
    normalized.startsWith('https:') ||
    normalized.startsWith('//')
  )
}

/** Applies defense-in-depth before epub.js serializes a spine document into its sandboxed iframe. */
export function sanitizeEpubDocument(document: Document): void {
  document.querySelectorAll('script, iframe, frame, object, embed, form').forEach((element) => element.remove())
  document.querySelectorAll<HTMLElement>('*').forEach((element) => {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase()
      if (name.startsWith('on') || name === 'srcdoc') element.removeAttribute(attribute.name)
    }

    for (const name of ['href', 'src', 'poster', 'xlink:href']) {
      const value = element.getAttribute(name)
      if (value && isBlockedUrl(value)) element.removeAttribute(name)
    }
  })

  let head = document.querySelector('head')
  if (!head) {
    const namespace = document.documentElement.namespaceURI
    const createdHead = namespace ? document.createElementNS(namespace, 'head') : document.createElement('head')
    head = createdHead as HTMLHeadElement
    document.documentElement.insertBefore(head, document.documentElement.firstChild)
  }
  head.querySelector('meta[http-equiv="Content-Security-Policy"]')?.remove()
  const policy = head.namespaceURI
    ? document.createElementNS(head.namespaceURI, 'meta')
    : document.createElement('meta')
  policy.setAttribute('http-equiv', 'Content-Security-Policy')
  policy.setAttribute('content', EPUB_CSP)
  head.prepend(policy)
}

async function displayRendition(rendition: Rendition, target?: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const handleDisplayError = (error: unknown) => {
      cleanup()
      reject(error)
    }
    const cleanup = () => rendition.off('displayError', handleDisplayError)
    rendition.on('displayError', handleDisplayError)
    rendition.display(target).then(
      () => {
        cleanup()
        resolve()
      },
      (error) => {
        cleanup()
        reject(error)
      }
    )
  })
}

function positionStorageKey(filePath: string): string {
  return `file-preview:epub:position:${filePath}`
}

function getInitialTheme(): 'dark' | 'light' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function applyTheme(rendition: Rendition, theme: 'dark' | 'light'): void {
  rendition.themes.select(theme)
}

export default function EpubFilePreview({ filePath, fileName, metadata, refreshKey }: FilePreviewPluginProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const bookRef = useRef<Book | null>(null)
  const renditionRef = useRef<Rendition | null>(null)
  const [status, setStatus] = useState<EpubLoadStatus>('loading')
  const [toc, setToc] = useState<FlatNavItem[]>([])
  const [tocOpen, setTocOpen] = useState(false)
  const [fontSize, setFontSize] = useState(100)
  const [theme, setTheme] = useState<'dark' | 'light'>(getInitialTheme)
  const [location, setLocation] = useState<Location | null>(null)
  const fontSizeRef = useRef(fontSize)
  const themeRef = useRef(theme)
  fontSizeRef.current = fontSize
  themeRef.current = theme

  const currentLabel = useMemo(() => {
    const href = location?.start.href.split('#', 1)[0]
    return href ? toc.find((item) => item.href.split('#', 1)[0] === href)?.label : undefined
  }, [location, toc])

  const openWithDefaultApp = useCallback(() => {
    void safeOpen(createFilePathHandle(filePath)).catch(() => toast.error(t('file_preview.epub.open_error')))
  }, [filePath, t])

  useEffect(() => {
    const container = containerRef.current
    if (!container || metadata.size > EPUB_MAX_SIZE_BYTES) {
      if (metadata.size > EPUB_MAX_SIZE_BYTES) setStatus('too_large')
      return
    }

    let cancelled = false
    let book: Book | null = null
    let rendition: Rendition | null = null
    let resizeObserver: ResizeObserver | null = null
    let cleanupListeners = () => {}

    setStatus('loading')
    setToc([])
    setLocation(null)

    void (async () => {
      try {
        const result = await ipcApi.request('file.read', {
          handle: createFilePathHandle(filePath),
          options: { mode: 'full', encoding: 'binary' }
        })
        if (cancelled) return

        book = ePub()
        book.spine.hooks.content.register(sanitizeEpubDocument)
        const bytes = result.content.slice()
        await book.open(bytes.buffer)
        if (cancelled) return
        await book.ready
        if (cancelled) return

        rendition = book.renderTo(container as unknown as string, {
          width: '100%',
          height: '100%',
          flow: 'paginated',
          spread: 'none',
          allowScriptedContent: false
        })
        rendition.themes.register('light', {
          body: { background: '#ffffff !important', color: '#202124 !important', padding: '0 4% !important' },
          'a:link': { color: '#2563eb !important' }
        })
        rendition.themes.register('dark', {
          body: { background: '#171717 !important', color: '#e5e5e5 !important', padding: '0 4% !important' },
          'a:link': { color: '#93c5fd !important' }
        })
        applyTheme(rendition, themeRef.current)
        rendition.themes.fontSize(`${fontSizeRef.current}%`)

        const handleRelocated = (nextLocation: Location) => {
          setLocation(nextLocation)
          const cfi = nextLocation.start.cfi
          if (cfi) window.localStorage.setItem(positionStorageKey(filePath), cfi)
        }
        const handleKeyDown = (event: KeyboardEvent) => {
          if (event.key === 'ArrowLeft') void rendition?.prev()
          if (event.key === 'ArrowRight') void rendition?.next()
        }
        rendition.on('relocated', handleRelocated)
        container.addEventListener('keydown', handleKeyDown)
        cleanupListeners = () => {
          rendition?.off('relocated', handleRelocated)
          container.removeEventListener('keydown', handleKeyDown)
        }

        bookRef.current = book
        renditionRef.current = rendition
        setToc(flattenNavigation(book.navigation.toc))
        const savedPosition = window.localStorage.getItem(positionStorageKey(filePath))
        await displayRendition(rendition, savedPosition?.startsWith('epubcfi(') ? savedPosition : undefined)
        if (cancelled) return

        resizeObserver = new ResizeObserver(([entry]) => {
          if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
            rendition?.resize(entry.contentRect.width, entry.contentRect.height)
          }
        })
        resizeObserver.observe(container)
        setStatus('ready')
      } catch (error) {
        if (cancelled) return
        const normalized = error instanceof Error ? error : new Error(String(error))
        logger.error(`Failed to load EPUB preview: ${filePath}`, normalized)
        setStatus('error')
      }
    })()

    return () => {
      cancelled = true
      cleanupListeners()
      resizeObserver?.disconnect()
      rendition?.destroy()
      book?.destroy()
      if (renditionRef.current === rendition) renditionRef.current = null
      if (bookRef.current === book) bookRef.current = null
      container.replaceChildren()
    }
  }, [filePath, metadata.size, refreshKey])

  useEffect(() => {
    const rendition = renditionRef.current
    if (rendition) applyTheme(rendition, theme)
  }, [theme])

  useEffect(() => {
    renditionRef.current?.themes.fontSize(`${fontSize}%`)
  }, [fontSize])

  const displayHref = useCallback((href: string) => {
    void renditionRef.current?.display(href)
    setTocOpen(false)
  }, [])

  const canNavigate = status === 'ready'

  return (
    <FilePreviewLayout.Frame>
      <EpubFilePreviewToolbar
        canNavigate={canNavigate}
        fontSize={fontSize}
        onNextPage={() => void renditionRef.current?.next()}
        onPreviousPage={() => void renditionRef.current?.prev()}
        onToggleContents={() => setTocOpen((open) => !open)}
        onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
        onZoomIn={() => setFontSize((size) => Math.min(MAX_FONT_SIZE, size + FONT_SIZE_STEP))}
        onZoomOut={() => setFontSize((size) => Math.max(MIN_FONT_SIZE, size - FONT_SIZE_STEP))}
        theme={theme}
        tocOpen={tocOpen}
      />
      <FilePreviewLayout.Content composerInset={false}>
        <div className="relative flex h-full min-h-0 overflow-hidden bg-background">
          {tocOpen && canNavigate ? (
            <nav
              aria-label={t('file_preview.epub.contents')}
              className="w-64 shrink-0 overflow-y-auto border-border-subtle border-r bg-background-subtle p-2">
              {toc.map((item, index) => (
                <button
                  type="button"
                  key={`${item.id}:${item.href}:${index}`}
                  className="block w-full truncate rounded px-2 py-1.5 text-left text-foreground text-sm hover:bg-accent"
                  style={{ paddingLeft: `${item.depth * 14 + 8}px` }}
                  title={item.label}
                  onClick={() => displayHref(item.href)}>
                  {item.label}
                </button>
              ))}
            </nav>
          ) : null}
          <div className="relative min-w-0 flex-1 bg-background">
            <div
              ref={containerRef}
              data-testid="epub-file-preview"
              role="region"
              aria-label={fileName}
              tabIndex={0}
              className="absolute inset-0 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
            />
            {status === 'loading' ? (
              <div
                role="status"
                className="absolute inset-0 flex items-center justify-center gap-2 bg-background text-muted-foreground text-sm">
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
                <span>{t('file_preview.loading')}</span>
              </div>
            ) : status === 'error' || status === 'too_large' ? (
              <div role="alert" className="absolute inset-0 bg-background">
                <EmptyState
                  icon={FileWarning}
                  title={t(
                    status === 'too_large' ? 'file_preview.epub.too_large.title' : 'file_preview.epub.read_error.title'
                  )}
                  description={
                    status === 'too_large'
                      ? t('file_preview.epub.too_large.description', { limit: EPUB_MAX_SIZE_MIB })
                      : t('file_preview.load_error.description')
                  }
                  actionLabel={t('file_preview.epub.open')}
                  onAction={openWithDefaultApp}
                  className="h-full"
                />
              </div>
            ) : null}
            {status === 'ready' && currentLabel ? (
              <div className="pointer-events-none absolute right-3 bottom-2 left-3 truncate text-center text-muted-foreground text-xs">
                <BookOpen className="mr-1 inline size-3" aria-hidden />
                {currentLabel}
                {location?.start.displayed.total
                  ? ` · ${location.start.displayed.page}/${location.start.displayed.total}`
                  : ''}
              </div>
            ) : null}
          </div>
        </div>
      </FilePreviewLayout.Content>
    </FilePreviewLayout.Frame>
  )
}
