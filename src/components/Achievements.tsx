import { useEffect, useState } from 'react'
import { levelFromExp } from '../data/demo'
import { syncAchievements } from '../lib/api'
import { CloseIcon } from './icons'

/**
 * Ачивки (ЧТЗ 5.12).
 *
 * Сами награды нигде не лежат: каждая выводится из того, что и так есть в
 * профиле. Отдельная таблица достижений потребовала бы начислений,
 * идемпотентности и триггеров — а показать то же самое можно честнее,
 * пересчитав по текущим числам, и рассинхрона тогда не бывает.
 *
 * Единственное, чего из чисел не достать, — дата получения: по ним видно
 * «выполнено», но не «когда». Её и запоминает таблица achievement
 * (миграция 007), куда экран дописывает новые ачивки при заходе.
 */
export interface Achievement {
  code: string
  icon: string
  title: string
  /** Условие одной строкой — видно, пока ачивка не получена. */
  goal: string
  /** Зачем она нужна: это читают, уже открыв ачивку. */
  about: string
  earned: boolean
  /** Насколько условие выполнено — для полосы в карточке. */
  now: number
  need: number
  earnedAt?: string
}

/**
 * Всё, что нужно для подсчёта ачивок. Не профиль целиком: те же ачивки
 * показываются и в чужом профиле, а там полей меньше.
 */
export interface AchievementSource {
  expTotal: number
  eventsAttended: number
  eventsHosted: number
  streakDays: number
  averageRating: number
}

export function achievementsFor (
  profile: AchievementSource, dates: Record<string, string> = {},
): Achievement[] {
  const level = levelFromExp(profile.expTotal)

  const list: Omit<Achievement, 'earned' | 'earnedAt'>[] = [
    {
      code: 'first_step', icon: '🚀', title: 'Первый шаг',
      goal: 'Сходить на первую встречу',
      about: 'Выдаётся за первую встречу, до которой вы дошли. Дальше проще: '
           + 'самое трудное в Questa — решиться в первый раз.',
      now: profile.eventsAttended, need: 1,
    },
    {
      code: 'circle', icon: '👥', title: 'Свой круг',
      goal: '5 встреч за плечами',
      about: 'Пять встреч — это уже не случайность, а привычка выходить к людям.',
      now: profile.eventsAttended, need: 5,
    },
    {
      code: 'regular', icon: '🏅', title: 'Завсегдатай',
      goal: '15 встреч за плечами',
      about: 'Пятнадцать встреч. Вас уже узнают в компании — и зовут ещё.',
      now: profile.eventsAttended, need: 15,
    },
    {
      code: 'host', icon: '📣', title: 'Организатор',
      goal: 'Провести свою встречу',
      about: 'Даётся за первую встречу, которую вы собрали сами и довели до конца.',
      now: profile.eventsHosted, need: 1,
    },
    {
      code: 'host_five', icon: '🎪', title: 'Хозяин вечера',
      goal: 'Провести 5 встреч',
      about: 'Пять своих встреч. Собирать людей у вас получается лучше, чем у большинства.',
      now: profile.eventsHosted, need: 5,
    },
    {
      code: 'week', icon: '🔥', title: 'Неделя подряд',
      goal: '7 дней серии входов',
      about: 'Семь дней подряд забранной ежедневной награды. Серия рвётся, '
           + 'если пропустить двое суток.',
      now: profile.streakDays, need: 7,
    },
    {
      code: 'fortnight', icon: '💎', title: 'Две недели',
      goal: '14 дней серии входов',
      about: 'Максимальная серия входов: четырнадцатый день даёт самую большую '
           + 'ежедневную награду.',
      now: profile.streakDays, need: 14,
    },
    {
      code: 'level_five', icon: '⭐', title: 'Пятый уровень',
      goal: 'Набрать 5-й уровень',
      about: 'Опыт идёт за выполненные задания квестов и за сами встречи. '
           + 'Пятый уровень — примерно середина пути.',
      now: level, need: 5,
    },
    {
      code: 'loved', icon: '💜', title: 'Нравится людям',
      goal: 'Средняя оценка 4.5 и выше',
      about: 'Средняя оценка от тех, с кем вы встречались. Считается только '
           + 'после нескольких встреч — и это самая честная ачивка здесь.',
      now: Math.round(profile.averageRating * 10) / 10, need: 4.5,
    },
  ]

  return list.map((item) => ({
    ...item,
    earned: item.now >= item.need,
    earnedAt: dates[item.code],
  }))
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

function earnedDate (iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  const year = date.getFullYear() === new Date().getFullYear()
    ? '' : ` ${date.getFullYear()}`
  return `${date.getDate()} ${MONTHS[date.getMonth()]}${year}`
}

/**
 * Одна ачивка крупно.
 *
 * На плитке остаются только картинка и название — иначе в строку не влезает
 * ничего, кроме мелкого текста. Всё остальное — условие, зачем она нужна,
 * дата получения — показывается здесь, по нажатию.
 */
function AchievementCard ({ item, onClose }: { item: Achievement; onClose: () => void }) {
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)

    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const left = Math.max(0, item.need - item.now)
  const date = item.earnedAt ? earnedDate(item.earnedAt) : ''

  return (
    <div
      onClick={onClose}
      className="absolute inset-0 z-[70] flex items-center justify-center bg-black/75 p-6"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="animate-message relative w-full max-w-[330px] rounded-[28px] bg-surface p-6
                   text-center shadow-2xl"
      >
        <button
          onClick={onClose} aria-label="Закрыть"
          className="absolute right-3 top-3 grid size-9 place-items-center rounded-full
                     bg-white/10 text-white"
        >
          <CloseIcon className="size-5" />
        </button>

        <span
          className={`mx-auto grid size-[86px] place-items-center rounded-[26px] text-[44px] ${
            item.earned ? 'bg-accent/25 ring-1 ring-accent/60' : 'bg-surface-2 grayscale'}`}
        >
          <span className={item.earned ? '' : 'opacity-40'}>{item.icon}</span>
        </span>

        <h3 className="mt-4 text-[22px]">{item.title}</h3>

        <p className={`mt-1 text-[15px] font-semibold ${
          item.earned ? 'text-success' : 'text-muted'}`}
        >
          {item.earned
            ? (date ? `Получена ${date}` : 'Получена')
            : 'Ещё не получена'}
        </p>

        <p className="mt-3 text-[16px] leading-snug text-white/85">{item.about}</p>

        <div className="mt-4 rounded-card bg-surface-2 p-3 text-left">
          <p className="text-[14px] text-muted">Условие</p>
          <p className="text-[16px]">{item.goal}</p>

          {!item.earned && (
            <p className="mt-1 text-[14px] text-muted">
              Сейчас {item.now} из {item.need} — осталось {Math.round(left * 10) / 10}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export function Achievements ({ profile }: { profile: AchievementSource & { id: string } }) {
  const [dates, setDates] = useState<Record<string, string>>({})
  const [open, setOpen] = useState<Achievement | null>(null)

  const list = achievementsFor(profile, dates)
  const earned = list.filter((item) => item.earned)

  // Даты подтягиваются и дописываются одним запросом при заходе в профиль.
  // Промах ничего не портит: ачивки видны и без дат.
  useEffect(() => {
    let alive = true
    const codes = achievementsFor(profile).filter((item) => item.earned)
      .map((item) => item.code)

    syncAchievements(profile.id, codes)
      .then((result) => { if (alive) setDates(result) })
      .catch(() => {})

    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id, profile.eventsAttended, profile.eventsHosted,
    profile.streakDays, profile.expTotal, profile.averageRating])

  // Полученные идут первыми: строка начинается с того, что уже есть, а не
  // с чужих пока условий.
  const shown = [...earned, ...list.filter((item) => !item.earned)]

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[20px]">Ачивки</h2>
        <span className="text-[15px] text-muted">{earned.length} из {list.length}</span>
      </div>

      {/* Строка с прокруткой вместо сетки девять на три: сетка занимала
          пол-экрана профиля ради значков, которые смотрят раз в неделю. */}
      <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
        {shown.map((item) => (
          <button
            key={item.code} onClick={() => setOpen(item)}
            aria-label={`Ачивка «${item.title}»`}
            className={`flex w-[108px] shrink-0 flex-col items-center gap-2 rounded-card p-3
                        text-center transition active:scale-[0.97] ${
              item.earned ? 'bg-surface-3 ring-1 ring-accent/50' : 'bg-surface-2'}`}
          >
            <span
              className={`grid size-12 place-items-center rounded-2xl text-[26px] leading-none ${
                item.earned ? 'bg-accent/20' : 'bg-white/5'}`}
            >
              <span className={item.earned ? '' : 'opacity-30 grayscale'}>{item.icon}</span>
            </span>
            <span className={`text-[13px] leading-tight ${item.earned ? '' : 'text-muted'}`}>
              {item.title}
            </span>
          </button>
        ))}
      </div>

      {open && <AchievementCard item={open} onClose={() => setOpen(null)} />}
    </section>
  )
}
