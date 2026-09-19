import { useState } from 'react'
import { Button, Field } from './ui'
import { CloseIcon } from './icons'
import { COMPLAINT_REASONS } from '../lib/api'

export interface ReportTarget {
  key: string
  label: string
}

/**
 * Жалоба (ЧТЗ 5.17).
 *
 * Отдельный экран для жалобы был бы лишним: она пишется в одно касание из
 * того места, где увидели нарушение. Причина выбирается из списка, а
 * комментарий не обязателен — иначе до отправки дело не доходит.
 */
export function ReportSheet (
  { title, targets, onClose, onSubmit }: {
    title: string
    /** Несколько целей — когда жаловаться можно и на сообщение, и на автора. */
    targets?: ReportTarget[]
    onClose: () => void
    onSubmit: (input: { reason: string; comment: string; target: string }) => Promise<void>
  },
) {
  const [target, setTarget] = useState(targets?.[0]?.key ?? '')
  const [reason, setReason] = useState('')
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  async function send () {
    if (!reason) return
    setSending(true)
    setError('')
    try {
      await onSubmit({ reason, comment, target })
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Жалоба не отправилась')
      setSending(false)
    }
  }

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end bg-black/60" onClick={onClose}>
      <div
        onClick={(event) => event.stopPropagation()}
        className="animate-sheet flex max-h-[88%] flex-col rounded-t-[28px] bg-surface"
      >
        <div className="pt-3">
          <span className="mx-auto block h-1.5 w-12 rounded-full bg-white/30" />
        </div>

        <header className="flex items-center gap-3 px-5 py-3">
          <h2 className="min-w-0 flex-1 truncate text-[20px]">{title}</h2>
          <button onClick={onClose} aria-label="Закрыть"><CloseIcon className="size-6" /></button>
        </header>

        <div className="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-2">
          {targets && targets.length > 1 && (
            <div className="flex gap-2 rounded-full bg-surface-2 p-1">
              {targets.map((item) => (
                <button
                  key={item.key} onClick={() => setTarget(item.key)}
                  className={`flex-1 rounded-full py-2.5 text-[15px] font-semibold transition ${
                    target === item.key ? 'bg-accent text-white' : 'text-muted'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-2">
            {COMPLAINT_REASONS.map((item) => (
              <button
                key={item} onClick={() => setReason(item)}
                className={`flex w-full items-center gap-3 rounded-card p-3.5 text-left text-[17px]
                            ${reason === item ? 'bg-surface-3 ring-1 ring-accent' : 'bg-surface-2'}`}
              >
                <span className="flex-1">{item}</span>
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-full text-[14px]
                              font-bold ${reason === item
                                ? 'bg-accent text-white' : 'border border-white/20'}`}
                >
                  {reason === item ? '✓' : ''}
                </span>
              </button>
            ))}
          </div>

          <Field
            placeholder="Что произошло — по желанию"
            value={comment} onChange={(event) => setComment(event.target.value)} maxLength={300}
          />

          {error && <p className="text-[15px] text-red-400">{error}</p>}
        </div>

        <div className="space-y-2 p-5 pb-[calc(1.25rem+var(--safe-bottom))]">
          <Button disabled={!reason || sending} onClick={send}>
            {sending ? 'Отправляем…' : 'Отправить жалобу'}
          </Button>
          <p className="text-center text-[13px] leading-snug text-muted">
            Жалобу увидит модерация. Автор не узнает, кто пожаловался.
          </p>
        </div>
      </div>
    </div>
  )
}
