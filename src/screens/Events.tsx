import { Link } from 'react-router-dom'
import { TabScreen } from '../components/Layout'
import { EventListCard } from '../components/EventCard'
import { Empty, Failed, Loading } from '../components/States'
import type { QuestaEvent } from '../data/demo'
import { useAuth } from '../lib/auth'
import { listEvents, myEventRatings, unreadChats } from '../lib/api'
import { useAsync } from '../lib/useAsync'

/**
 * Свои ивенты: те, где пользователь организатор или участник.
 *
 * Список разделён по состоянию встречи. Одной лентой он читался плохо:
 * идущая прямо сейчас встреча терялась среди прошлогодних, а прошедшие
 * мешали увидеть ближайшие планы. Порядок разделов — по срочности.
 */
export default function Events () {
  const { profile } = useAuth()
  const { data, error, loading, reload } = useAsync(
    () => listEvents(profile?.id ?? null), [profile?.id],
  )

  // Свои оценки встреч — чтобы на карточке было видно, что оценка уже
  // поставлена. Промах запроса ничего не ломает: подписи просто не будет.
  const { data: scores } = useAsync(
    () => profile ? myEventRatings(profile.id) : Promise.resolve<Record<string, number>>({}),
    [profile?.id],
  )

  // Непрочитанные сообщения — одним запросом на все встречи.
  const { data: unread } = useAsync(
    () => profile ? unreadChats() : Promise.resolve<Record<string, number>>({}), [profile?.id],
  )

  const mine = (data ?? []).filter((event) => event.myRole !== 'guest')

  const groups: { title: string; events: QuestaEvent[] }[] = [
    {
      title: 'Идут сейчас',
      events: mine.filter((event) => event.status === 'in_progress'),
    },
    {
      title: 'Скоро',
      events: mine
        .filter((event) => event.status === 'active')
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    },
    {
      title: 'Прошедшие',
      events: mine
        .filter((event) => event.status === 'finished' || event.status === 'cancelled')
        .sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
    },
  ].filter((group) => group.events.length > 0)

  return (
    <TabScreen>
      <div className="space-y-5 px-5 pt-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[24px]">Мои ивенты</h1>
          <Link
            to="/create"
            className="btn-primary rounded-full px-5 py-3 text-[16px] font-semibold text-white"
          >
            Создать
          </Link>
        </div>

        {loading && <Loading />}
        {error && <Failed message={error} onRetry={reload} />}
        {!loading && !error && mine.length === 0 && (
          <Empty label="Вы пока никуда не записались. Создайте свой ивент или загляните в рекомендации." />
        )}

        {groups.map((group) => (
          <section key={group.title} className="space-y-3">
            <h2 className="text-[17px] text-muted">
              {group.title} · {group.events.length}
            </h2>
            {group.events.map((event) => (
              <EventListCard
                key={event.id} event={event}
                myScore={scores?.[event.id]} unread={unread?.[event.id]}
              />
            ))}
          </section>
        ))}
      </div>
    </TabScreen>
  )
}
