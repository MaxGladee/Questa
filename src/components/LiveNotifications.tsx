import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BellIcon, FlameIcon, SparkIcon, UserIcon } from './icons'
import { subscribeNotifications, type Notification } from '../lib/api'
import { useAuth } from '../lib/auth'

const ICON: Record<string, typeof BellIcon> = {
  join: UserIcon,
  group: FlameIcon,
  task: SparkIcon,
  start: SparkIcon,
}

/**
 * Всплывающие уведомления поверх приложения.
 *
 * Колокольчик хорош, когда о событии уже знаешь и хочешь перечитать. Узнать
 * из него нельзя: человек сидит в чате и не видит, что группа набралась или
 * что кто-то выполнил задание. Плашка приходит сверху, живёт несколько
 * секунд и по нажатию открывает тот ивент, о котором речь.
 *
 * На самом экране уведомлений плашка не показывается — там и так всё видно.
 */
export function LiveNotifications () {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [shown, setShown] = useState<Notification | null>(null)

  useEffect(() => {
    if (!profile) return

    return subscribeNotifications(profile.id, (notification) => {
      setShown(notification)
      window.setTimeout(
        () => setShown((current) => (current?.id === notification.id ? null : current)),
        6000,
      )
    })
  }, [profile?.id])

  if (!shown || pathname === '/notifications') return null

  const Icon = ICON[shown.type] ?? BellIcon

  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-[70]">
      <button
        onClick={() => {
          setShown(null)
          navigate(shown.eventId ? `/event/${shown.eventId}` : '/notifications')
        }}
        className="animate-sheet pointer-events-auto flex w-full items-center gap-3 rounded-card
                   bg-surface-3 p-3.5 text-left shadow-2xl ring-1 ring-accent/40"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/20">
          <Icon className="size-5 text-accent-soft" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold">{shown.title}</span>
          {shown.body && (
            <span className="block truncate text-[14px] text-muted">{shown.body}</span>
          )}
        </span>

        <span
          role="presentation"
          onClick={(event) => { event.stopPropagation(); setShown(null) }}
          className="shrink-0 px-1 text-[20px] leading-none text-muted"
        >
          ×
        </span>
      </button>
    </div>
  )
}
