import { Button, Checkbox, ConfirmDialog } from '@cherrystudio/ui'
import EditNameDialog from '@renderer/components/EditNameDialog'
import { useDataChange, useQuery } from '@renderer/data/hooks/useDataApi'
import { useFiles } from '@renderer/hooks/useFiles'
import { ipcApi } from '@renderer/ipc'
import { type ChapterRange, toggleChapterRange } from '@renderer/pages/reading/chapterSelection'
import ReadingParseProgress from '@renderer/pages/reading/ReadingParseProgress'
import { toast } from '@renderer/services/toast'
import { formatErrorMessageWithPrefix } from '@renderer/utils/error'
import { cn } from '@renderer/utils/style'
import type { ReadingBook, ReadingChapter } from '@shared/data/types/reading'
import { AbsoluteFilePathSchema } from '@shared/types/file'
import { useNavigate } from '@tanstack/react-router'
import { BookOpen, FileUp, LoaderCircle, MessageCircle, PencilLine, RotateCcw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

function getBookStatusKey(status: ReadingBook['status']): string {
  return `reading.status.${status}`
}

export default function ReadingPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { onSelectFile, selecting } = useFiles({ extensions: ['pdf'] })
  const { data: books = [], refetch: refreshBooks } = useQuery('/reading-books')
  useDataChange('/reading-books', () => void refreshBooks())

  // Notifications are best-effort across windows. While a remote MinerU job is
  // active, keep a small polling fallback so completion cannot leave this page
  // stuck on its last cached progress value until the next app restart.
  const hasProcessingBook = books.some((book) => book.status === 'processing' && book.parseJobId)
  useEffect(() => {
    if (!hasProcessingBook) return
    const timer = window.setInterval(() => void refreshBooks(), 1_500)
    return () => window.clearInterval(timer)
  }, [hasProcessingBook, refreshBooks])

  const [selectedBookId, setSelectedBookId] = useState<string>()
  const selectedBook = useMemo(
    () => books.find((book) => book.id === selectedBookId) ?? books[0],
    [books, selectedBookId]
  )
  const { data: chapters = [] } = useQuery('/reading-books/:id/chapters', {
    params: { id: selectedBook?.id ?? '' },
    enabled: Boolean(selectedBook?.id && selectedBook.status === 'ready')
  })
  const [range, setRange] = useState<ChapterRange>()
  const [isImporting, setIsImporting] = useState(false)
  const [isCreatingTopic, setIsCreatingTopic] = useState(false)
  const [renamingBook, setRenamingBook] = useState<ReadingBook>()
  const [deletingBook, setDeletingBook] = useState<ReadingBook>()

  const selectBook = useCallback((bookId: string) => {
    setSelectedBookId(bookId)
    setRange(undefined)
  }, [])

  const importBook = useCallback(async () => {
    const [file] = await onSelectFile({ multipleSelections: false })
    if (!file?.path) return
    const title = file.name.replace(/\.pdf$/i, '').trim() || file.name
    setIsImporting(true)
    try {
      const result = await ipcApi.request('reading.import_pdf', {
        sourcePath: AbsoluteFilePathSchema.parse(file.path),
        sourceName: file.name,
        title
      })
      setSelectedBookId(result.bookId)
      setRange(undefined)
      await refreshBooks()
    } catch (error) {
      toast.error(formatErrorMessageWithPrefix(error, t('common.error')))
    } finally {
      setIsImporting(false)
    }
  }, [onSelectFile, refreshBooks, t])

  const selectChapter = useCallback(
    (chapter: ReadingChapter) => {
      setRange((current) => toggleChapterRange(chapters, current, chapter))
    },
    [chapters]
  )

  const renameBook = useCallback(
    async (title: string) => {
      if (!renamingBook) return
      try {
        await ipcApi.request('reading.rename_book', { bookId: renamingBook.id, title })
        await refreshBooks()
      } catch (error) {
        toast.error(formatErrorMessageWithPrefix(error, t('common.error')))
        throw error
      }
    },
    [refreshBooks, renamingBook, t]
  )

  const deleteBook = useCallback(async () => {
    if (!deletingBook) return
    try {
      await ipcApi.request('reading.delete_book', { bookId: deletingBook.id })
      if (selectedBook?.id === deletingBook.id) {
        setSelectedBookId(undefined)
        setRange(undefined)
      }
      await refreshBooks()
    } catch (error) {
      toast.error(formatErrorMessageWithPrefix(error, t('common.error')))
      throw error
    }
  }, [deletingBook, refreshBooks, selectedBook?.id, t])

  const startConversation = useCallback(async () => {
    if (!selectedBook || !range) return
    setIsCreatingTopic(true)
    try {
      const result = await ipcApi.request('reading.create_topic', {
        bookId: selectedBook.id,
        startOrderIndex: range.start,
        endOrderIndex: range.end
      })
      await navigate({ to: '/app/chat', search: { topicId: result.topicId } })
    } catch (error) {
      toast.error(formatErrorMessageWithPrefix(error, t('common.error')))
    } finally {
      setIsCreatingTopic(false)
    }
  }, [navigate, range, selectedBook, t])

  const selectedChapters = useMemo(
    () => chapters.filter((chapter) => range && chapter.orderIndex >= range.start && chapter.orderIndex <= range.end),
    [chapters, range]
  )

  return (
    <main className="flex min-h-0 flex-1 overflow-hidden bg-background">
      <aside className="flex w-72 shrink-0 flex-col border-border-subtle border-r bg-background-subtle/30">
        <div className="flex items-center justify-between gap-3 border-border-subtle border-b px-4 py-3">
          <h1 className="truncate font-medium text-foreground text-sm">{t('reading.title')}</h1>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => void importBook()}
            disabled={selecting || isImporting}
            aria-label={t('reading.import')}
            title={t('reading.import')}>
            {isImporting ? <LoaderCircle className="size-4 animate-spin" /> : <FileUp className="size-4" />}
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {books.length === 0 ? (
            <p className="px-2 py-4 text-muted-foreground text-xs leading-5">{t('reading.empty')}</p>
          ) : (
            <div className="space-y-1">
              {books.map((book) => (
                <div
                  key={book.id}
                  className={cn(
                    'group flex items-center rounded-md hover:bg-accent/60',
                    selectedBook?.id === book.id && 'bg-accent'
                  )}>
                  <button
                    type="button"
                    onClick={() => selectBook(book.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left">
                    <BookOpen className="size-4 shrink-0 text-foreground-tertiary" />
                    <span className="min-w-0 flex-1 truncate text-foreground text-sm">{book.title}</span>
                    <span className="shrink-0 text-foreground-tertiary text-xs">
                      {t(getBookStatusKey(book.status))}
                    </span>
                  </button>
                  <div className="mr-1 flex shrink-0 items-center opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setRenamingBook(book)}
                      aria-label={t('common.rename')}
                      title={t('common.rename')}>
                      <PencilLine className="size-3.5" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setDeletingBook(book)}
                      aria-label={t('common.delete')}
                      title={t('common.delete')}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {!selectedBook ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
            {t('reading.empty')}
          </div>
        ) : selectedBook.status !== 'ready' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            {selectedBook.status === 'processing' && selectedBook.parseJobId ? (
              <ReadingParseProgress jobId={selectedBook.parseJobId} />
            ) : (
              <>
                {selectedBook.status === 'processing' && (
                  <LoaderCircle className="size-5 animate-spin text-foreground-tertiary" />
                )}
                <p className="text-foreground text-sm">{t(getBookStatusKey(selectedBook.status))}</p>
              </>
            )}
            {selectedBook.status === 'failed' && selectedBook.errorMessage && (
              <p className="max-w-lg text-error text-xs">{selectedBook.errorMessage}</p>
            )}
            <Button
              size="icon"
              variant="outline"
              onClick={() => void refreshBooks()}
              aria-label={t('common.refresh')}
              title={t('common.refresh')}>
              <RotateCcw className="size-4" />
            </Button>
          </div>
        ) : (
          <>
            <header className="flex shrink-0 items-center justify-between gap-4 border-border-subtle border-b px-6 py-3">
              <div className="min-w-0">
                <h2 className="truncate font-medium text-foreground text-sm">{selectedBook.title}</h2>
                <p className="text-muted-foreground text-xs">{t('reading.select_sections')}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {range && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setRange(undefined)}
                    aria-label={t('common.reset')}
                    title={t('common.reset')}>
                    <RotateCcw className="size-4" />
                  </Button>
                )}
                <Button
                  onClick={() => void startConversation()}
                  disabled={!range || isCreatingTopic}
                  loading={isCreatingTopic}>
                  <MessageCircle className="size-4" />
                  {t('reading.start_conversation')}
                </Button>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              <div className="mx-auto max-w-3xl space-y-1">
                {chapters.map((chapter) => {
                  const checked = Boolean(range && chapter.orderIndex >= range.start && chapter.orderIndex <= range.end)
                  return (
                    <div
                      key={chapter.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 hover:bg-accent/50"
                      style={{ paddingLeft: `${Math.min(chapter.level, 6) * 18 + 8}px` }}>
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => selectChapter(chapter)}
                        aria-label={chapter.title}
                      />
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left text-foreground text-sm"
                        onClick={() => selectChapter(chapter)}>
                        {chapter.title}
                      </button>
                      {chapter.pageStart !== undefined && (
                        <span className="text-foreground-tertiary text-xs">{chapter.pageStart + 1}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
            {selectedChapters.length > 0 && (
              <footer className="shrink-0 border-border-subtle border-t px-6 py-2 text-muted-foreground text-xs">
                {selectedChapters[0].title} - {selectedChapters.at(-1)?.title}
              </footer>
            )}
          </>
        )}
      </section>
      <EditNameDialog
        open={Boolean(renamingBook)}
        title={t('common.rename')}
        initialName={renamingBook?.title ?? ''}
        onSubmit={renameBook}
        onOpenChange={(open) => {
          if (!open) setRenamingBook(undefined)
        }}
      />
      <ConfirmDialog
        open={Boolean(deletingBook)}
        onOpenChange={(open) => {
          if (!open) setDeletingBook(undefined)
        }}
        title={t('common.delete')}
        description={t('common.delete_confirm')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        destructive
        onConfirm={deleteBook}
      />
    </main>
  )
}
