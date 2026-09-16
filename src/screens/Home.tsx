import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TabScreen } from '../components/Layout'
import { EventListCard } from '../components/EventCard'
import { Avatar, Progress } from '../components/ui'
import { BellIcon, ChevronIcon, MicIcon, SearchIcon } from '../components/icons'
import { EVENTS, ME } from '../data/demo'

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
  const [day, setDay] = useState(0)
  const [query, setQuery] = useState('')

  // Активный ивент показывается отдельной карточкой наверху (ЧТЗ 5.3, пункт 4).
  const active = EVENTS.find((event) => event.status === 'in_progress')
  const done = active?.quest?.tasks.filter((task) => task.completed).length ?? 0
  const total = active?.quest?.tasks.length ?? 0

  // Рекомендации: чужие ивенты, которые ещё не начались (ЧТЗ 5.3).
  const recommended = EVENTS.filter(
    (event) => event.status === 'active'
      && event.title.toLowerCase().includes(query.trim().toLowerCase()),
  )

  return (
    <TabScreen>
      <div className="space-y-5 px-5 pt-3">
        <header className="flex items-center gap-3">
          <Link to="/profile">
            <Avatar name={ME.nickname} src={ME.avatarUrl} size={48} className="rounded-2xl" />
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
            <div className="mt-4 flex items-center gap-3 pl-[88px]">
              <Progress value={total ? done / total : 0} />
            </div>
            <p className="mt-2 pl-[88px] text-[14px] text-muted">
              {done} из {total} заданий выполнено
            </p>
          </Link>
        )}

        <DateStrip value={day} onChange={setDay} />

        <section className="space-y-4">
          <h2 className="text-[28px]">Рекомендации</h2>
          {recommended.map((event) => <EventListCard key={event.id} event={event} />)}
          {recommended.length === 0 && (
            <p className="py-8 text-center text-[17px] text-muted">Ничего не нашлось</p>
          )}
        </section>
      </div>
    </TabScreen>
  )
}
