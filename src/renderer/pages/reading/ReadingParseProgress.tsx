import { CircularProgress } from '@cherrystudio/ui'
import { useJob, useJobProgress } from '@renderer/hooks/useJob'
import { useTranslation } from 'react-i18next'

function getProgressLabelKey(progress: number, status: string | undefined, stage: unknown): string {
  if (status === 'pending' || status === 'delayed') return 'reading.progress.queued'
  if (stage === 'started') return 'reading.progress.submitted'
  if (progress >= 99) return 'reading.progress.finalizing'
  if (progress > 0) return 'reading.progress.processing'
  return 'reading.progress.queued'
}

export default function ReadingParseProgress({ jobId }: { jobId: string }) {
  const { t } = useTranslation()
  const { data: job } = useJob(jobId)
  const { detail, progress } = useJobProgress(jobId)
  const roundedProgress = Math.round(progress)
  const stage = typeof detail === 'object' && detail !== null ? (detail as { stage?: unknown }).stage : undefined
  const label = t(getProgressLabelKey(progress, job?.status, stage))

  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 text-center">
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={roundedProgress}>
        <CircularProgress
          value={roundedProgress}
          size={72}
          strokeWidth={5}
          showLabel
          renderLabel={(value) => `${Math.round(value)}%`}
        />
      </div>
      <p className="text-foreground text-sm">{label}</p>
    </div>
  )
}
