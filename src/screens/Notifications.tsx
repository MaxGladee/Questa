import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PlainScreen } from '../components/Layout'
import { Empty, Failed, Loading } from '../components/States'
import { BackIcon, BellIcon, ClockIcon, FlagIcon, FlameIcon, SparkIcon, UserIcon } from '../components/icons'
import {
  clearNotifications, listNotifications, markNotificationRead, markNotificationsRead,
} from '../lib/api'
import { useToast } from '../components/Toast'
import { useAsync } from '../lib/useAsync'
import { useAuth } from '../lib/auth'

const ICON: Record<string, typeof BellIcon> = {
  join: UserIcon,
  group: FlameIcon,
  task: SparkIcon,
  reminder: ClockIcon,
  start: FlameIcon,
  finish: FlagIcon,
  cancel: FlagIcon,
}

/**
 * Центр уведомлений (ЧТЗ 5.16).
 *
 * Раньше всё помечалось прочитанным само при открытии — и непрочитанное
 * нельзя было ни разглядеть, ни оставить на потом. Теперь этим управляет
 * человек: две кнопки сверху, обе появляются только когда есть что делать.
 */
export default function Notifications () {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [confirmingClear, setConfirmingClear] = useState(false)

  const { data, error, loading, reload } = useAsync(
    () => profile ? listNotifications(profile.id) : Promise.resolve([]), [profile?.id],
  )

  const unread = data?.filter((item) => !item.isRead).length ?? 0

  async function act (work: () => Promise<void>, done: string) {
    if (!profile || busy) return
    setBusy(true)
    try {
      await work()
      toast(done)
      reload()
    } catch (problem) {
      toast(problem instanceof Error ? problem.message : 'Не получилось')
    } finally {
      setBusy(false)
      setConfirmingClear(false)
    }
  }

  return (
    <PlainScreen
      title="Уведомления"
      left={<button onClick={() => navigate(-1)} aria-label="Назад"><BackIcon className="size-7" /></button>}
    >
      <div className="space-y-3 px-4 pb-10 pt-2">
        {(data?.length ?? 0) > 0 && (
          <div className="flex gap-2">
            <button
              disabled={busy || unread === 0}
              onClick={() => act(() => markNotificationsRead(profile!.id), 'Всё прочитано')}
              className="flex-1 rounded-full bg-surface-2 py-2.5 text-[15px] font-semibold
                         disabled:opacity-40"
            >
              {unread > 0 ? `Прочитать все · ${unread}` : 'Все прочитаны'}
            </button>
            <button
              disabled={busy}
              onClick={() => confirmingClear
                ? act(() => clearNotifications(profile!.id), 'Уведомления удалены')
                : setConfirmingClear(true)}
              className={`flex-1 rounded-full py-2.5 text-[15px] font-semibold disabled:opacity-40 ${
                confirmingClear ? 'bg-red-500/20 text-red-300' : 'bg-surface-2 text-red-400/90'}`}
            >
              {confirmingClear ? 'Точно удалить?' : 'Удалить все'}
            </button>
          </div>
        )}

        {loading && <Loading />}
        {error && <Failed message={error} onRetry={reload} />}
        {!loading && !error && data?.length === 0 && (
          <Empty label="Пока тихо. Здесь появятся заявки в ваши ивенты, сообщения о наборе группы и выполненных заданиях." />
        )}

        {data?.map((item) => {
          const Icon = ICON[item.type] ?? BellIcon

          /**
           * Нажатие само снимает отметку «непрочитано»: человек его уже
           * прочёл. Список при этом не перезагружается — экран всё равно
           * сменяется, а на обратном пути данные подтянутся заново.
           */
          const open = () => {
            if (!item.isRead) markNotificationRead(item.id).catch(() => {})
          }
          const content = (
            <div
              className={`flex gap-3 rounded-card p-4 ${
                item.isRead ? 'bg-surface-2' : 'bg-surface-3 ring-1 ring-accent/40'}`}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/20">
                <Icon className="size-5 text-accent-soft" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[17px] font-semibold">{item.title}</p>
                {item.body && (
                  <p className="mt-0.5 text-[16px] leading-snug text-muted">{item.body}</p>
                )}
                <p className="mt-1 text-[14px] text-muted">{item.at}</p>
              </div>
            </div>
          )

          return item.eventId
            ? (
                <Link
                  key={item.id} to={`/event/${item.eventId}`} onClick={open}
                  className="block"
                >
                  {content}
                </Link>
              )
            : (
                // Уведомлению без ивента идти некуда, но прочитанным оно
                // тоже должно становиться от нажатия.
                <button
                  key={item.id} onClick={() => { open(); reload() }}
                  className="block w-full text-left"
                >
                  {content}
                </button>
              )
        })}
      </div>
    </PlainScreen>
  )
}
