import ReadingPage from '@renderer/pages/reading/ReadingPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/reading')({ component: ReadingPage })
