import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PlainScreen } from '../components/Layout'
import { Empty, Failed, Loading } from '../components/States'
import { BackIcon, BellIcon, FlameIcon, SparkIcon, UserIcon } from '../components/icons'
import { listNotifications, markNotificationsRead } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { useAuth } from '../lib/auth'

const ICON: Record<string, typeof BellIcon> = {
  join: UserIcon,
  group: FlameIcon,
  task: SparkIcon,
}

/** Центр уведомлений (ЧТЗ 5.16). Открытие помечает всё прочитанным. */
export default function Notifications () {
  const navigate = useNavigate()
  const { profile } = useAuth()

  const { data, error, loading, reload } = useAsync(
    () => profile ? listNotifications(profile.id) : Promise.resolve([]), [profile?.id],
  )

  useEffect(() => {
    if (profile && data?.some((item) => !item.isRead)) markNotificationsRead(profile.id)
  }, [profile?.id, data])

  return (
    <PlainScreen
      title="Уведомления"
      left={<button onClick={() => navigate(-1)} aria-label="Назад"><BackIcon className="size-7" /></button>}
    >
      <div className="space-y-3 px-4 pb-10 pt-2">
        {loading && <Loading />}
        {error && <Failed message={error} onRetry={reload} />}
        {!loading && !error && data?.length === 0 && (
          <Empty label="Пока тихо. Здесь появятся заявки в ваши ивенты, сообщения о наборе группы и выполненных заданиях." />
        )}

        {data?.map((item) => {
          const Icon = ICON[item.type] ?? BellIcon
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
            ? <Link key={item.id} to={`/event/${item.eventId}`} className="block">{content}</Link>
            : <div key={item.id}>{content}</div>
        })}
      </div>
    </PlainScreen>
  )
}
