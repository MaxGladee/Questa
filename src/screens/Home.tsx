import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TabScreen } from '../components/Layout'
import { EventListCard } from '../components/EventCard'
import { Avatar, Progress } from '../components/ui'
import { Empty, Failed, Loading } from '../components/States'
import { BellIcon, ChevronIcon, MicIcon, SearchIcon } from '../components/icons'
import { useAuth } from '../lib/auth'
import { getQuest, listEvents } from '../lib/api'
import { useAsync } from '../lib/useAsync'

/** Горизонтальный календарь на пять дней вперёд (ЧТЗ 5.3, пункт 5). */
function DateStrip ({ value, onChange }: { value: number; onChange: (day: number) => void }) {
  const today = new Date()
  const days = Array.from({ length: 5 }, (_, offset) => {
    const date = new Date(today)
    date.setDate(today.getDate() + offset)
    return date
  })

  return (
    <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5">
      {days.map((date, index) => {
        const active = index === value
        return (
          <button
            key={index} onClick={() => onChange(index)}
            className={`flex w-[74px] shrink-0 flex-col items-center gap-1 rounded-[20px] py-4
                        transition ${active ? 'bg-white text-bg' : 'bg-surface text-white'}`}
          >
            <span className="text-[26px] font-bold leading-none">{date.getDate()}</span>
            <span className={`text-[13px] ${active ? 'text-bg/60' : 'text-muted'}`}>
              {date.toLocaleDateString('ru-RU', { weekday: 'short' })}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default function Home () {
  const { profile } = useAuth()
  const [day, setDay] = useState(0)
  const [query, setQuery] = useState('')

  const { data: events, error, loading, reload } = useAsync(
    () => listEvents(profile?.id ?? null), [profile?.id],
  )

  // Активный ивент — тот, что уже идёт и в котором пользователь участвует.
  const active = events?.find(
    (event) => event.status === 'in_progress' && event.myRole !== 'guest',
  )

  const { data: quest } = useAsync(
    () => active ? getQuest(active.id, profile?.id ?? null) : Promise.resolve(null),
    [active?.id, profile?.id],
  )

  const done = quest?.quest?.tasks.filter((task) => task.completed).length ?? 0
  const total = quest?.quest?.tasks.length ?? 0

  // Рекомендации: ивенты, которые ещё не начались и которые пользователь
  // не создавал и в которые не вступал (ЧТЗ 5.3).
  const chosenDay = new Date()
  chosenDay.setDate(chosenDay.getDate() + day)

  const recommended = (events ?? []).filter((event) => {
    if (event.status !== 'active' || event.myRole !== 'guest') return false
    if (!event.title.toLowerCase().includes(query.trim().toLowerCase())) return false
    return new Date(event.startsAt).toDateString() === chosenDay.toDateString() || query.trim() !== ''
  })

  return (
    <TabScreen>
      <div className="space-y-5 px-5 pt-3">
        <header className="flex items-center gap-3">
          <Link to="/profile">
            <Avatar
              name={profile?.nickname ?? '?'} src={profile?.avatarUrl}
              size={48} className="rounded-2xl"
            />
          </Link>

          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl bg-surface px-3.5 py-3">
            <SearchIcon className="size-5 text-muted" />
            <input
              value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск" aria-label="Поиск ивента"
              className="min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted"
            />
            <MicIcon className="size-5 text-muted" />
          </label>

          <button aria-label="Уведомления" className="shrink-0 rounded-2xl bg-surface p-3">
            <BellIcon className="size-6" />
          </button>
        </header>

        {active && (
          <Link to={`/event/${active.id}/quest`} className="block rounded-card bg-surface p-4">
            <div className="flex items-start gap-4">
              <img
                src={active.coverUrl} alt="" width={112} height={112}
                className="size-[72px] shrink-0 rounded-2xl object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <h3 className="min-w-0 flex-1 truncate text-[20px]">{active.title}</h3>
                  <ChevronIcon className="mt-1 size-5 shrink-0" />
                </div>
                <p className="mt-1 line-clamp-2 text-[16px] leading-snug text-muted">
                  {active.description}
                </p>
              </div>
            </div>
            {total > 0 && (
              <>
                <div className="mt-4 pl-[88px]"><Progress value={done / total} /></div>
                <p className="mt-2 pl-[88px] text-[14px] text-muted">
                  {done} из {total} заданий выполнено
                </p>
              </>
            )}
          </Link>
        )}

        <DateStrip value={day} onChange={setDay} />

        <section className="space-y-4">
          <h2 className="text-[28px]">Рекомендации</h2>

          {loading && <Loading />}
          {error && <Failed message={error} onRetry={reload} />}
          {!loading && !error && recommended.length === 0 && (
            <Empty label={query ? 'Ничего не нашлось' : 'На этот день ивентов пока нет'} />
          )}
          {recommended.map((event) => <EventListCard key={event.id} event={event} />)}
        </section>
      </div>
    </TabScreen>
  )
}
