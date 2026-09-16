import { Link } from 'react-router-dom'
import { TabScreen } from '../components/Layout'
import { Avatar, Progress } from '../components/ui'
import { ChevronIcon, GearIcon } from '../components/icons'
import { EVENTS, ME, levelFromExp, levelProgress } from '../data/demo'

function Stat (
  { value, label, badge, tone }:
  { value: number; label: string; badge?: string; tone: 'bright' | 'dim' },
) {
  return (
    <div
      className={`min-w-[150px] flex-1 rounded-card p-4 ${
        tone === 'bright' ? 'bg-accent' : 'bg-accent/45'}`}
    >
      <div className="flex items-center gap-2">
        <span className="text-[36px] font-extrabold leading-none">{value}</span>
        {badge && (
          <span className="whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-[13px]
                           font-bold text-accent">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-1 text-[16px] text-white/85">{label}</p>
    </div>
  )
}

export default function Profile () {
  const level = levelFromExp(ME.expTotal)
  const { current, next } = levelProgress(ME.expTotal)
  const history = EVENTS.filter((event) => event.myRole !== 'guest')

  return (
    <TabScreen>
      <div className="space-y-6 px-5 pt-4">
        <header className="relative flex flex-col items-center">
          <button aria-label="Настройки" className="absolute right-0 top-2">
            <GearIcon className="size-7" />
          </button>

          <div className="relative">
            <Avatar name={ME.nickname} src={ME.avatarUrl} size={130} className="rounded-[28px]" />
            <span className="absolute -bottom-3 right-2 rounded-full bg-accent px-4 py-1.5
                             text-[17px] font-bold">
              {ME.qpBalance} QP
            </span>
          </div>

          <h1 className="mt-5 text-[30px]">{ME.nickname}</h1>
          <p className="text-[18px] text-white/80">{ME.city}</p>
        </header>

        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <h2 className="text-[22px]">Уровень {level}</h2>
            <span className="text-[15px] text-muted">{current} / {next}</span>
          </div>
          <Progress value={current / next} />
        </section>

        <section className="space-y-3">
          <h2 className="text-[22px]">Статистика</h2>
          <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5">
            <Stat value={ME.streakDays} label="Дней подряд" badge="+10 QP" tone="bright" />
            <Stat value={ME.eventsAttended} label="Посещено" tone="dim" />
            <Stat value={ME.eventsHosted} label="Проведено" tone="dim" />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-[22px]">Ачивки</h2>
          <div className="rounded-card bg-surface-2 px-4 py-6 text-center text-[17px] text-muted">
            Скоро
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-[22px]">История</h2>
          {history.map((event) => (
            <Link
              key={event.id} to={`/event/${event.id}`}
              className="flex items-center gap-4 rounded-card bg-surface-3 p-4"
            >
              <img
                src={event.coverUrl} alt="" width={96} height={96}
                className="size-12 shrink-0 rounded-xl object-cover"
              />
              <span className="min-w-0 flex-1 truncate text-[17px]">{event.title}</span>
              <ChevronIcon className="size-5 shrink-0 text-muted" />
            </Link>
          ))}
        </section>

        <Link
          to="/login"
          className="block rounded-card bg-surface-2 py-4 text-center text-[17px] text-muted"
        >
          Выйти
        </Link>
      </div>
    </TabScreen>
  )
}
