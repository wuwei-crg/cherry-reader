import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  jobStatus: 'running' as 'pending' | 'running',
  progress: 0,
  stage: undefined as string | undefined
}))

vi.mock('@renderer/hooks/useJob', () => ({
  useJob: () => ({ data: { status: mocks.jobStatus } }),
  useJobProgress: () => ({
    progress: mocks.progress,
    ...(mocks.stage ? { detail: { stage: mocks.stage } } : {})
  })
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'reading.progress.finalizing': 'Preparing parsed content',
        'reading.progress.processing': 'MinerU is parsing document pages',
        'reading.progress.queued': 'Waiting for MinerU to start parsing',
        'reading.progress.submitted': 'Document uploaded, waiting for MinerU'
      })[key] ?? key
  })
}))

import ReadingParseProgress from '../ReadingParseProgress'

afterEach(() => {
  cleanup()
})

describe('ReadingParseProgress', () => {
  beforeEach(() => {
    mocks.jobStatus = 'running'
    mocks.progress = 0
    mocks.stage = undefined
  })

  it('shows MinerU page progress while the remote parser reports completed pages', () => {
    // Regression: the reading page previously exposed only a generic spinner during a long MinerU parse.
    mocks.progress = 42
    mocks.stage = 'polling'

    render(<ReadingParseProgress jobId="parse-job" />)

    expect(screen.getByRole('progressbar', { name: 'MinerU is parsing document pages' })).toHaveAttribute(
      'aria-valuenow',
      '42'
    )
    expect(screen.getByText('42%')).toBeInTheDocument()
  })

  it('explains that MinerU is still waiting when no page progress is available', () => {
    mocks.jobStatus = 'pending'

    render(<ReadingParseProgress jobId="parse-job" />)

    expect(screen.getByRole('progressbar', { name: 'Waiting for MinerU to start parsing' })).toHaveAttribute(
      'aria-valuenow',
      '0'
    )
  })
})
