import { Link } from 'react-router-dom'
import { TabScreen } from '../components/Layout'
import { Avatar, Progress } from '../components/ui'
import { Loading } from '../components/States'
import { ChevronIcon, GearIcon } from '../components/icons'

import { levelFromExp, levelProgress } from '../data/demo'
import { listEvents } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { useAuth } from '../lib/auth'
import { DailyRewardCard } from '../components/DailyReward'
import { Achievements } from '../components/Achievements'

/** «12 встреч» / «1 встреча» / «22 встречи» — счёт по-русски. */
function eventsWord (count: number): string {
  const tens = count % 100
  const ones = count % 10
  if (tens > 10 && tens < 20) return 'встреч'
  if (ones === 1) return 'встреча'
  if (ones >= 2 && ones <= 4) return 'встречи'
  return 'встреч'
}

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
  const { profile } = useAuth()
  const { data: events, loading } = useAsync(
    () => listEvents(profile?.id ?? null), [profile?.id],
  )

  if (!profile) return <TabScreen><Loading /></TabScreen>

  const level = levelFromExp(profile.expTotal)
  const { current, next } = levelProgress(profile.expTotal)
  const history = (events ?? []).filter((event) => event.myRole !== 'guest')

  return (
    <TabScreen>
      <div className="space-y-6 px-5 pt-4">
        <header className="relative flex flex-col items-center">
          <Link to="/settings" aria-label="Настройки" className="absolute right-0 top-2">
            <GearIcon className="size-7" />
          </Link>

          <div className="relative">
            <Avatar name={profile.nickname} src={profile.avatarUrl} size={130} className="rounded-[28px]" />
            <span className="absolute -bottom-3 right-2 rounded-full bg-accent px-4 py-1.5
                             text-[17px] font-bold">
              {profile.qpBalance} QP
            </span>
          </div>

          <h1 className="mt-5 text-[27px]">{profile.nickname}</h1>
          <p className="text-[18px] text-white/80">{profile.city}</p>
        </header>

        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <h2 className="text-[20px]">Уровень {level}</h2>
            <span className="text-[15px] text-muted">{current} / {next}</span>
          </div>
          <Progress value={current / next} />
        </section>

        <DailyRewardCard />

        <section className="space-y-3">
          <h2 className="text-[20px]">Статистика</h2>
          <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5">
            <Stat value={profile.streakDays} label="Дней подряд" tone="bright" />
            <Stat value={profile.eventsAttended} label="Посещено" tone="dim" />
            <Stat value={profile.eventsHosted} label="Проведено" tone="dim" />
          </div>
        </section>

        <Achievements profile={profile} />

        {/* Прошедшие встречи вынесены на отдельный экран: в профиле их
            список оттеснял всё остальное вниз. */}
        <Link
          to="/archive"
          className="flex items-center gap-3 rounded-card bg-surface-2 p-4"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-semibold">Архив ивентов</span>
            <span className="block text-[15px] text-muted">
              {loading ? 'Считаем…' : `${history.length} ${eventsWord(history.length)}`}
            </span>
          </span>
          <ChevronIcon className="size-5 shrink-0 text-muted" />
        </Link>
      </div>
    </TabScreen>
  )
}
