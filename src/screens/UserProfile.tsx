import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PlainScreen } from '../components/Layout'
import { Avatar, Chip, Progress } from '../components/ui'
import { Failed, Loading } from '../components/States'
import { BackIcon, FlagIcon, StarIcon } from '../components/icons'
import { ReportSheet } from '../components/ReportSheet'
import { useToast } from '../components/Toast'
import { INTERESTS, levelFromExp, levelProgress } from '../data/demo'
import { achievementsFor } from '../components/Achievements'
import { fileComplaint, getPublicProfile } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { useAuth } from '../lib/auth'

/** «на 2 встречах» / «на 1 встрече» / «на 5 встречах». */
function meetingsWord (count: number): string {
  const tens = count % 100
  const ones = count % 10
  if (tens > 10 && tens < 20) return 'встречах'
  return ones === 1 ? 'встрече' : 'встречах'
}

function Stat ({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex-1 rounded-card bg-surface-2 p-4 text-center">
      <p className="text-[26px] font-extrabold leading-none">{value}</p>
      <p className="mt-1.5 text-[14px] leading-snug text-muted">{label}</p>
    </div>
  )
}

/**
 * Профиль другого участника.
 *
 * Открывается отовсюду, где видно человека: из карточки ивента, из чата,
 * из итогов. Показывает то, по чему решают, идти ли на встречу с
 * незнакомым: оценка от других, сколько встреч посетил и провёл, чем
 * интересуется. Баланс QP не показывается — он ни о чём не говорит,
 * кроме того, сколько человек потратил.
 */
export default function UserProfile () {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const toast = useToast()
  const [reporting, setReporting] = useState(false)

  const { data: person, error, loading, reload } = useAsync(
    () => getPublicProfile(id!, profile?.id), [id, profile?.id],
  )

  if (loading) return <PlainScreen title="Профиль"><Loading /></PlainScreen>
  if (error || !person) {
    return (
      <PlainScreen title="Профиль">
        <Failed message={error ?? 'Профиль не найден'} onRetry={reload} />
      </PlainScreen>
    )
  }

  const earned = achievementsFor(person).filter((item) => item.earned)
  const level = levelFromExp(person.expTotal)
  const { current, next } = levelProgress(person.expTotal)
  const mine = person.id === profile?.id

  return (
    <PlainScreen
      title="Профиль"
      left={<button onClick={() => navigate(-1)} aria-label="Назад"><BackIcon className="size-7" /></button>}
      right={mine ? undefined : (
        <button
          onClick={() => setReporting(true)} aria-label="Пожаловаться"
          className="grid size-10 place-items-center rounded-full bg-surface-2 text-red-400/80"
        >
          <FlagIcon className="size-5" />
        </button>
      )}
    >
      <div className="space-y-6 px-5 pb-10 pt-1">
        <header className="flex flex-col items-center text-center">
          <Avatar
            name={person.nickname} src={person.avatarUrl} size={116}
            className="rounded-[26px]"
          />
          <h1 className="mt-4 text-[25px]">{person.nickname}</h1>
          <p className="text-[17px] text-white/80">{person.city}</p>

          <p className="mt-2 flex items-center gap-1.5 text-[17px]">
            <StarIcon className="size-5 text-warning" />
            {person.averageRating > 0
              ? `${person.averageRating.toFixed(1)} по оценкам участников`
              : 'пока без оценок'}
          </p>
        </header>

        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <h2 className="text-[20px]">Уровень {level}</h2>
            <span className="text-[15px] text-muted">{current} / {next}</span>
          </div>
          <Progress value={current / next} />
        </section>

        <div className="flex gap-3">
          <Stat value={person.eventsAttended} label="Посетил" />
          <Stat value={person.eventsHosted} label="Провёл" />
          <Stat value={person.streakDays} label="Дней подряд" />
        </div>

        {/* Общие встречи говорят о незнакомце больше, чем средний балл:
            человека, с которым уже ходили, и зовут иначе. */}
        {!mine && person.together > 0 && (
          <p className="rounded-card bg-surface-3 p-3.5 text-center text-[16px]">
            Вы были вместе на {person.together} {meetingsWord(person.together)}
          </p>
        )}

        {earned.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[20px]">Ачивки · {earned.length}</h2>
            <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
              {earned.map((item) => (
                <div
                  key={item.code} title={item.about}
                  className="flex w-[108px] shrink-0 flex-col items-center gap-2 rounded-card
                             bg-surface-3 p-3 text-center ring-1 ring-accent/50"
                >
                  <span className="grid size-12 place-items-center rounded-2xl bg-accent/20
                                   text-[26px] leading-none">
                    {item.icon}
                  </span>
                  <span className="text-[13px] leading-tight">{item.title}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {person.interests.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[20px]">Интересы</h2>
            <div className="flex flex-wrap gap-2">
              {person.interests.map((code) => (
                <Chip key={code}>
                  {INTERESTS.find((item) => item.code === code)?.title ?? code}
                </Chip>
              ))}
            </div>
          </section>
        )}

        <p className="text-center text-[15px] text-muted">В Questa с {person.since}</p>

      </div>

      {reporting && profile && (
        <ReportSheet
          title="Пожаловаться"
          onClose={() => setReporting(false)}
          onSubmit={async ({ reason, comment }) => {
            await fileComplaint({
              authorId: profile.id, targetUserId: person.id, reason, comment,
            })
            setReporting(false)
            toast('Жалоба отправлена модерации')
          }}
        />
      )}
    </PlainScreen>
  )
}
