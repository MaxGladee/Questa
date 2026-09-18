import type { User } from '../data/demo'
import { levelFromExp } from '../data/demo'

/**
 * Ачивки (ЧТЗ 5.12).
 *
 * Ничего не хранится отдельно: каждая выводится из того, что и так есть в
 * профиле. Отдельная таблица достижений потребовала бы начислений,
 * идемпотентности и триггеров — а показать то же самое можно честнее,
 * пересчитав по текущим числам, и рассинхрона тогда не бывает.
 */
interface Achievement {
  icon: string
  title: string
  /** Условие, которое видно, пока ачивка не получена. */
  goal: string
  earned: boolean
}

export function achievementsFor (profile: User): Achievement[] {
  const level = levelFromExp(profile.expTotal)

  return [
    {
      icon: '🚀', title: 'Первый шаг', goal: 'Сходить на первую встречу',
      earned: profile.eventsAttended >= 1,
    },
    {
      icon: '👥', title: 'Свой круг', goal: '5 встреч за плечами',
      earned: profile.eventsAttended >= 5,
    },
    {
      icon: '🏅', title: 'Завсегдатай', goal: '15 встреч за плечами',
      earned: profile.eventsAttended >= 15,
    },
    {
      icon: '📣', title: 'Организатор', goal: 'Провести свою встречу',
      earned: profile.eventsHosted >= 1,
    },
    {
      icon: '🎪', title: 'Хозяин вечера', goal: 'Провести 5 встреч',
      earned: profile.eventsHosted >= 5,
    },
    {
      icon: '🔥', title: 'Неделя подряд', goal: '7 дней серии входов',
      earned: profile.streakDays >= 7,
    },
    {
      icon: '💎', title: 'Две недели', goal: '14 дней серии входов',
      earned: profile.streakDays >= 14,
    },
    {
      icon: '⭐', title: 'Пятый уровень', goal: 'Набрать 5-й уровень',
      earned: level >= 5,
    },
    {
      icon: '💜', title: 'Нравится людям', goal: 'Средняя оценка 4.5 и выше',
      earned: profile.averageRating >= 4.5,
    },
  ]
}

export function Achievements ({ profile }: { profile: User }) {
  const list = achievementsFor(profile)
  const earned = list.filter((item) => item.earned).length

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[20px]">Ачивки</h2>
        <span className="text-[15px] text-muted">{earned} из {list.length}</span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {list.map((item) => (
          <div
            key={item.title}
            title={item.earned ? item.title : item.goal}
            className={`flex flex-col items-center gap-1.5 rounded-card p-3 text-center ${
              item.earned ? 'bg-surface-3 ring-1 ring-accent/50' : 'bg-surface-2'}`}
          >
            <span className={`text-[26px] leading-none ${item.earned ? '' : 'opacity-30 grayscale'}`}>
              {item.icon}
            </span>
            <span className={`text-[13px] leading-tight ${item.earned ? '' : 'text-muted'}`}>
              {item.title}
            </span>
            {!item.earned && (
              <span className="text-[11px] leading-tight text-muted/70">{item.goal}</span>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
