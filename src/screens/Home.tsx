import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TabScreen } from '../components/Layout'
import { EventListCard } from '../components/EventCard'
import { Avatar, Progress, useAutofillGuard } from '../components/ui'
import { Empty, Failed, Loading } from '../components/States'
import { BellIcon, ChevronIcon, MicIcon, SearchIcon } from '../components/icons'
import { Cover } from '../components/Art'
import { ideasForToday } from '../data/ideas'
import { categoryTitle } from '../data/demo'
import { useAuth } from '../lib/auth'
import { countUnread, getQuest, listEvents } from '../lib/api'
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
  const guard = useAutofillGuard()

  const { data: events, error, loading, reload } = useAsync(
    () => listEvents(profile?.id ?? null), [profile?.id],
  )

  const { data: unread } = useAsync(
    () => profile ? countUnread(profile.id) : Promise.resolve(0), [profile?.id],
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

  const ideas = ideasForToday()

  const recommended = (events ?? []).filter((event) => {
    if (event.status !== 'active' || event.myRole !== 'guest') return false
    if (!event.title.toLowerCase().includes(query.trim().toLowerCase())) return false
    return new Date(event.startsAt).toDateString() === chosenDay.toDateString() || query.trim() !== ''
  })

  return (
    <TabScreen>
      <div className="space-y-4 px-5 pt-3">
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
              {...guard} type="search" name="event-search"
              value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск" aria-label="Поиск ивента"
              className="min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted"
            />
            <MicIcon className="size-5 text-muted" />
          </label>

          <Link
            to="/notifications" aria-label="Уведомления"
            className="relative shrink-0 rounded-2xl bg-surface p-3"
          >
            <BellIcon className="size-6" />
            {(unread ?? 0) > 0 && (
              <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full
                               bg-accent px-1.5 text-[12px] font-bold">
                {unread! > 9 ? '9+' : unread}
              </span>
            )}
          </Link>
        </header>

        {active && (
          <Link to={`/event/${active.id}/quest`} className="block rounded-card bg-surface p-3.5">
            <div className="flex items-start gap-4">
              <Cover
                src={active.coverUrl} category={active.category}
                className="size-16 shrink-0 rounded-2xl" emojiClassName="text-3xl"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <h3 className="min-w-0 flex-1 truncate text-[18px]">{active.title}</h3>
                  <ChevronIcon className="mt-1 size-5 shrink-0" />
                </div>
                <p className="mt-1 line-clamp-2 text-[15px] leading-snug text-muted">
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

        <section className="space-y-3">
          <h2 className="text-[24px]">Рекомендации</h2>

          {loading && <Loading />}
          {error && <Failed message={error} onRetry={reload} />}
          {!loading && !error && recommended.length === 0 && (
            <Empty label={query ? 'Ничего не нашлось' : 'На этот день чужих ивентов пока нет'} />
          )}
          {recommended.map((event) => <EventListCard key={event.id} event={event} />)}
        </section>

        {/* Когда рядом пусто, список идей полезнее пустого места. */}
        <section className="space-y-3 pb-2">
          <h2 className="text-[24px]">Идеи для встречи</h2>
          <p className="-mt-1 text-[15px] leading-snug text-muted">
            Нажмите — и форма создания заполнится сама, останется выбрать место и время.
          </p>

          {ideas.map((idea) => (
            <Link
              key={idea.title} to="/create" state={{ idea }}
              className="flex items-center gap-3 rounded-card bg-surface p-3.5 transition
                         active:scale-[0.99]"
            >
              <Cover
                category={idea.category}
                className="size-14 shrink-0 rounded-2xl" emojiClassName="text-2xl"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[17px] font-bold leading-tight">{idea.title}</p>
                <p className="mt-0.5 line-clamp-2 text-[15px] leading-snug text-muted">
                  {idea.pitch}
                </p>
                <p className="mt-1 text-[13px] text-accent-soft">
                  {categoryTitle(idea.category)}
                </p>
              </div>
            </Link>
          ))}
        </section>
      </div>
    </TabScreen>
  )
}
