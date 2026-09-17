import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PlainScreen } from '../components/Layout'
import { Avatar, Button, Field } from '../components/ui'
import { Failed, Loading } from '../components/States'
import { BackIcon, StarIcon } from '../components/icons'
import { useToast } from '../components/Toast'
import { getEvent, getQuest, listMyRatings, rateUser } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { useAuth } from '../lib/auth'

const PLACE = ['🥇', '🥈', '🥉']

/** Ряд звёзд: и показывает поставленную оценку, и принимает новую. */
function Stars (
  { value, onPick, disabled }:
  { value: number; onPick: (score: number) => void; disabled?: boolean },
) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((score) => (
        <button
          key={score} disabled={disabled} onClick={() => onPick(score)}
          aria-label={`Оценка ${score}`}
          className={`p-0.5 transition ${disabled ? '' : 'active:scale-90'} ${
            score <= value ? 'text-warning' : 'text-white/25'}`}
        >
          <StarIcon className="size-6" />
        </button>
      ))}
    </div>
  )
}

/**
 * Итоги ивента и взаимные оценки (ЧТЗ 5.13, 5.14).
 *
 * Сначала — кто сколько заработал: ради этого и проходили квест. Оценки
 * ниже и ставятся по одной, сразу: анкета «оцените всех и нажмите
 * отправить» заполняется куда хуже, чем пять звёзд напротив имени.
 */
export default function Summary () {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const toast = useToast()

  const { data: event, error, loading } = useAsync(
    () => getEvent(id!, profile?.id ?? null), [id, profile?.id],
  )
  const { data: quest } = useAsync(() => getQuest(id!, profile?.id ?? null), [id, profile?.id])

  const [given, setGiven] = useState<Record<string, number>>({})
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id || !profile) return
    listMyRatings(id, profile.id).then((list) => {
      setGiven(Object.fromEntries(
        list.map((item) => [item.targetUserId ?? 'event', item.score]),
      ))
    })
  }, [id, profile?.id])

  if (loading) return <Loading label="Считаем итоги…" />
  if (error || !event) return <Failed message={error ?? 'Ивент не найден'} />

  const earned = quest?.earned ?? {}
  const table = [...event.participants]
    .map((person) => ({ ...person, qp: earned[person.id] ?? person.qpEarned ?? 0 }))
    .sort((a, b) => b.qp - a.qp)

  const mine = table.find((person) => person.id === profile?.id)
  const others = table.filter((person) => person.id !== profile?.id)
  const total = table.reduce((sum, person) => sum + person.qp, 0)

  async function rate (targetUserId: string | null, score: number) {
    if (!profile || !id || busy) return
    const key = targetUserId ?? 'event'
    if (given[key]) return                       // оценка ставится один раз

    setBusy(true)
    setGiven((list) => ({ ...list, [key]: score }))
    try {
      await rateUser({
        eventId: id, authorId: profile.id, targetUserId, score,
        comment: targetUserId === null ? comment : undefined,
      })
      toast(targetUserId === null ? 'Спасибо за отзыв' : 'Оценка отправлена')
    } catch {
      setGiven((list) => {
        const next = { ...list }
        delete next[key]
        return next
      })
      toast('Не удалось отправить оценку')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PlainScreen
      title="Итоги"
      left={<button onClick={() => navigate(-1)} aria-label="Назад"><BackIcon className="size-7" /></button>}
    >
      <div className="space-y-6 px-5 pb-8 pt-1">
        <section className="rounded-card bg-surface-2 p-5 text-center">
          <p className="text-[17px] text-muted">{event.title}</p>
          <p className="mt-2 text-[40px] font-extrabold leading-none text-accent">
            +{mine?.qp ?? 0} QP
          </p>
          <p className="mt-2 text-[15px] leading-snug text-muted">
            {mine
              ? `Ваш результат · команда набрала ${total} QP`
              : `Команда набрала ${total} QP`}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[20px]">Кто сколько набрал</h2>
          {table.map((person, index) => (
            <Link
              key={person.id} to={`/user/${person.id}`}
              className={`flex items-center gap-3 rounded-card p-3.5 ${
                person.id === profile?.id ? 'bg-surface-3' : 'bg-surface-2'}`}
            >
              <span className="w-6 shrink-0 text-center text-[18px]">
                {PLACE[index] ?? index + 1}
              </span>
              <Avatar name={person.nickname} src={person.avatarUrl} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[17px] font-semibold">
                  {person.nickname}
                </span>
                <span className="block text-[14px] text-muted">
                  {person.role === 'organizer' ? 'Организатор' : 'Участник'}
                  {person.checkedIn ? ' · отметился' : ''}
                </span>
              </span>
              <span className="shrink-0 text-[17px] font-bold text-accent">+{person.qp}</span>
            </Link>
          ))}
        </section>

        {others.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[20px]">Оцените участников</h2>
            <p className="text-[15px] leading-snug text-muted">
              Оценка видна только как средний балл в профиле — кто её поставил,
              не показывается никому.
            </p>
            {others.map((person) => (
              <div key={person.id} className="flex items-center gap-3 rounded-card bg-surface-2 p-3.5">
                <Avatar name={person.nickname} src={person.avatarUrl} size={40} />
                <span className="min-w-0 flex-1 truncate text-[17px] font-semibold">
                  {person.nickname}
                </span>
                <Stars
                  value={given[person.id] ?? 0}
                  disabled={busy || Boolean(given[person.id])}
                  onPick={(score) => rate(person.id, score)}
                />
              </div>
            ))}
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-[20px]">Как вам сам ивент</h2>
          {!given.event && (
            <Field
              placeholder="Пара слов о встрече — по желанию"
              value={comment} onChange={(e) => setComment(e.target.value)} maxLength={200}
            />
          )}
          <div className="flex items-center justify-between rounded-card bg-surface-2 p-3.5">
            <span className="text-[17px]">{given.event ? 'Спасибо за отзыв' : 'Ваша оценка'}</span>
            <Stars
              value={given.event ?? 0}
              disabled={busy || Boolean(given.event)}
              onPick={(score) => rate(null, score)}
            />
          </div>
        </section>

        <Button onClick={() => navigate('/events')}>Готово</Button>
      </div>
    </PlainScreen>
  )
}
