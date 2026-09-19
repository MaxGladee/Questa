import { Link, useNavigate } from 'react-router-dom'
import { PlainScreen } from '../components/Layout'
import { EventListCard } from '../components/EventCard'
import { Failed, Loading } from '../components/States'
import { BackIcon, ChevronIcon } from '../components/icons'
import type { QuestaEvent } from '../data/demo'
import { listEvents, myEventRatings, unreadChats } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { useAuth } from '../lib/auth'

/**
 * Архив ивентов: всё, где человек участвовал или что вёл сам.
 *
 * Раньше этот список жил прямо в профиле и оттеснял вниз всё остальное —
 * уровень, награду, статистику. Здесь ему просторнее, а прошедшие встречи
 * отделены от тех, что ещё впереди.
 */
export default function Archive () {
  const navigate = useNavigate()
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
      title: 'Ещё впереди',
      events: mine
        .filter((event) => event.status === 'active' || event.status === 'in_progress')
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    },
    {
      title: 'Прошли',
      events: mine
        .filter((event) => event.status === 'finished')
        .sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
    },
    {
      title: 'Отменённые',
      events: mine
        .filter((event) => event.status === 'cancelled')
        .sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
    },
  ].filter((group) => group.events.length > 0)

  return (
    <PlainScreen
      title="Архив ивентов"
      left={<button onClick={() => navigate(-1)} aria-label="Назад"><BackIcon className="size-7" /></button>}
    >
      <div className="space-y-5 px-5 pb-10 pt-1">
        {loading && <Loading />}
        {error && <Failed message={error} onRetry={reload} />}
        {!loading && !error && mine.length === 0 && <EmptyArchive />}

        {groups.map((group) => (
          <section key={group.title} className="space-y-3">
            <h2 className="text-[17px] text-muted">{group.title} · {group.events.length}</h2>
            {group.events.map((event) => (
              <EventListCard
                key={event.id} event={event}
                myScore={scores?.[event.id]} unread={unread?.[event.id]}
              />
            ))}
          </section>
        ))}
      </div>
    </PlainScreen>
  )
}

/**
 * Пустой архив.
 *
 * Строчки «здесь появятся встречи» человеку ничего не дают: он и так видит,
 * что пусто, а что с этим делать — нет. Поэтому здесь сказано, зачем архив
 * вообще нужен, и рядом стоят те же два пути, что и на главной: собрать
 * свою встречу или зайти в чужую.
 */
function EmptyArchive () {
  const ways = [
    { to: '/create', title: 'Собрать встречу', note: 'Название, место и время — остальное приложение сделает само' },
    { to: '/map', title: 'Зайти в чужую', note: 'На карте видно всё, что собирают поблизости' },
  ]

  return (
    <section className="space-y-3 pt-6">
      <div className="px-1">
        <h2 className="text-[20px]">Пока пусто</h2>
        <p className="mt-1 text-[15px] leading-snug text-muted">
          Сюда попадает каждая встреча, где вы были или которую вели сами — с оценками,
          снимками и заданиями, которые прошла компания.
        </p>
      </div>

      {ways.map((way) => (
        <Link
          key={way.to} to={way.to}
          className="flex items-center gap-3 rounded-card bg-surface-2 p-4 transition active:scale-[0.99]"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/20
                           text-[17px] text-accent-soft">
            →
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-semibold">{way.title}</span>
            <span className="block text-[15px] leading-snug text-muted">{way.note}</span>
          </span>
          <ChevronIcon className="size-5 shrink-0 text-muted" />
        </Link>
      ))}
    </section>
  )
}
