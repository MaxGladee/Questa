import { useEffect, useState } from 'react'
import { claimDailyReward, getDailyReward, type DailyReward } from '../lib/api'
import { FlameIcon } from './icons'
import { useToast } from './Toast'
import { useAuth } from '../lib/auth'

/** «через 7 ч 12 мин» — без секунд: они только мельтешат. */
function untilLabel (iso: string): string {
  const left = new Date(iso).getTime() - Date.now()
  if (left <= 0) return 'вот-вот'

  const hours = Math.floor(left / 3_600_000)
  const minutes = Math.floor((left % 3_600_000) / 60_000)

  return hours > 0 ? `${hours} ч ${minutes} мин` : `${minutes} мин`
}

/**
 * Ежедневная награда за вход подряд (ЧТЗ 5.12.3).
 *
 * Награду забирают руками: серия, которая растёт сама от факта открытия
 * приложения, ничего не значит. После получения следующая открывается
 * через сутки, а если не прийти двое суток — серия начинается заново, и
 * об этом честно предупреждает сама карточка.
 */
export function DailyRewardCard () {
  const { profile, refreshProfile } = useAuth()
  const toast = useToast()

  const [state, setState] = useState<DailyReward | null>(null)
  const [busy, setBusy] = useState(false)
  // Перерисовка раз в полминуты: таймер должен идти, пока экран открыт.
  const [, tick] = useState(0)

  useEffect(() => {
    if (!profile) return
    getDailyReward(profile.id).then(setState).catch(() => {})
  }, [profile?.id])

  useEffect(() => {
    const timer = setInterval(() => tick((value) => value + 1), 30_000)
    return () => clearInterval(timer)
  }, [])

  if (!profile || !state) return null

  async function claim () {
    if (!profile || busy) return
    setBusy(true)
    try {
      const { day, amount } = await claimDailyReward(profile.id)
      toast(`День ${day} · +${amount} QP`)
      setState(await getDailyReward(profile.id))
      await refreshProfile()
    } catch (problem) {
      toast(problem instanceof Error ? problem.message : 'Не получилось забрать награду')
    } finally {
      setBusy(false)
    }
  }

  const breaksSoon = Boolean(
    state.canClaim && state.breaksAt && new Date(state.breaksAt).getTime() > Date.now(),
  )

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-[20px]">Награда за вход</h2>
        {/* Правила игры прячутся за знаком вопроса: на экране им места нет,
            но узнать их должно быть можно в одно касание. */}
        <button
          onClick={() => toast(
            'Заходите каждый день и забирайте награду: 10 QP в первый день, '
            + 'дальше +5 за каждый день серии, до 75. Пропустили двое суток — '
            + 'серия начинается заново.',
          )}
          aria-label="Как работает награда"
          className="grid size-5 place-items-center rounded-full border border-white/25
                     text-[12px] font-bold text-muted"
        >
          ?
        </button>
      </div>

      <button
        onClick={claim} disabled={!state.canClaim || busy}
        className={`w-full rounded-card p-4 text-left transition ${
          state.canClaim
            ? 'bg-accent active:scale-[0.98]'
            : 'bg-surface-2'}`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`grid size-12 shrink-0 place-items-center rounded-full ${
              state.canClaim ? 'bg-white/20' : 'bg-accent/20'}`}
          >
            <FlameIcon className={`size-6 ${state.canClaim ? 'text-white' : 'text-accent-soft'}`} />
          </span>

          <span className="min-w-0 flex-1">
            <span className="block text-[18px] font-bold">
              {state.canClaim
                ? `Забрать +${state.amount} QP`
                : `Серия: ${state.streak} ${state.streak === 1 ? 'день' : 'дней'} подряд`}
            </span>
            <span className={`block text-[15px] leading-snug ${
              state.canClaim ? 'text-white/85' : 'text-muted'}`}
            >
              {state.canClaim
                ? state.day === 1 && state.streak > 0
                  ? 'Серия прервалась — начинаем заново с первого дня'
                  : `Это ${state.day}-й день подряд`
                : state.nextAt
                  ? `Следующая — через ${untilLabel(state.nextAt)}`
                  : 'Приходите завтра'}
            </span>
          </span>
        </div>
      </button>

      {breaksSoon && state.breaksAt && (
        <p className="text-[14px] leading-snug text-muted">
          Серия прервётся через {untilLabel(state.breaksAt)}, если не забрать награду.
        </p>
      )}

    </section>
  )
}
