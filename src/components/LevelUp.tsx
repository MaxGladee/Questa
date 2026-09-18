import { useEffect, useState } from 'react'
import { Button } from './ui'
import { SparkIcon } from './icons'
import { levelFromExp } from '../data/demo'
import { claimLevelReward, levelReward } from '../lib/api'
import { useAuth } from '../lib/auth'

/** Где запоминается последний показанный уровень — отдельно для каждого человека. */
const seenKey = (userId: string) => `questa:level:${userId}`

function readSeen (userId: string): number | null {
  try {
    const value = localStorage.getItem(seenKey(userId))
    return value === null ? null : Number(value)
  } catch {
    return null
  }
}

function rememberSeen (userId: string, level: number) {
  try {
    localStorage.setItem(seenKey(userId), String(level))
  } catch {
    // Приватный режим запрещает хранилище: поздравление просто повторится.
  }
}

/**
 * Поздравление с новым уровнем (ЧТЗ 5.12.4).
 *
 * Уровень не хранится в базе — он выводится из опыта, поэтому «повышение»
 * приложение замечает само: сравнивает нынешний уровень с тем, что
 * показывало в прошлый раз. Первый запуск ничего не показывает, иначе
 * человек с пятым уровнем при входе с нового устройства получил бы
 * поздравление на пустом месте.
 *
 * Очки за уровень начисляются с ключом, в котором записан номер уровня, —
 * дважды за один и тот же уровень они не придут.
 */
export function LevelUp () {
  const { profile, refreshProfile } = useAuth()
  const [level, setLevel] = useState<number | null>(null)
  const [reward, setReward] = useState(0)

  useEffect(() => {
    if (!profile) return

    const current = levelFromExp(profile.expTotal)
    const seen = readSeen(profile.id)

    if (seen === null) {
      rememberSeen(profile.id, current)
      return
    }

    if (current <= seen) return

    rememberSeen(profile.id, current)
    setLevel(current)

    claimLevelReward(profile.id, current)
      .then((amount) => {
        setReward(amount)
        return refreshProfile()
      })
      .catch(() => setReward(levelReward(current)))
  }, [profile?.id, profile?.expTotal])

  if (level === null) return null

  return (
    <div
      className="absolute inset-0 z-[80] flex flex-col items-center justify-center gap-6
                 px-8 text-center"
      /* Фон непрозрачный: сквозь полупрозрачный просвечивал профиль, и
         поздравление выглядело всплывающим окном, а не событием. */
      style={{
        background:
          'radial-gradient(120% 60% at 50% 30%, rgb(135 105 255 / .28), transparent 70%),'
          + ' var(--color-bg)',
      }}
    >
      <span className="animate-pop text-[96px] leading-none">🎉</span>

      <div className="space-y-2">
        <p className="text-[19px] font-semibold text-accent-soft">Новый уровень</p>
        <p className="animate-pop text-[72px] font-extrabold leading-none text-accent">
          {level}
        </p>
      </div>

      <p className="text-[17px] leading-snug text-white/80">
        {levelText(level)}
      </p>

      <p className="flex items-center gap-2 rounded-full bg-accent/20 px-5 py-2.5 text-[18px]
                    font-bold text-accent-soft">
        <SparkIcon className="size-5" />
        +{reward || levelReward(level)} QP за уровень
      </p>

      <Button className="mt-2" onClick={() => setLevel(null)}>Спасибо!</Button>
    </div>
  )
}

/** Подпись под цифрой — чтобы поздравление не было одинаковым каждый раз. */
function levelText (level: number): string {
  if (level <= 2) return 'Начало положено: первые встречи позади.'
  if (level <= 4) return 'Вас уже узнают на встречах — так держать.'
  if (level <= 6) return 'Опытный участник: заданий пройдено немало.'
  if (level <= 9) return 'До десятого уровня осталось совсем чуть-чуть.'
  return 'Десятый и выше — это уже уровень завсегдатая Questa.'
}

