import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PlainScreen } from '../components/Layout'
import { Avatar, Button, Chip, Field } from '../components/ui'
import { Failed, Loading } from '../components/States'
import { BackIcon, ChevronIcon, PinIcon, StarIcon } from '../components/icons'
import { Cover } from '../components/Art'
import { categoryTitle, formatDate, formatTime } from '../data/demo'
import { cancelEvent, finishEvent, getEvent, joinEvent, leaveEvent, openChat } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { useAuth } from '../lib/auth'
import { useToast } from '../components/Toast'

const STATUS_LABEL = {
  active: 'Ожидание',
  in_progress: 'В процессе',
  finished: 'Завершён',
  cancelled: 'Отменён',
} as const

/**
 * Карточка ивента в трёх режимах — гость, участник, организатор (ЧТЗ 5.6).
 * Набор кнопок внизу зависит от роли.
 */
export default function EventDetails () {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const toast = useToast()
  const [joining, setJoining] = useState(false)
  const [actionError, setActionError] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const { data: event, error, loading, reload } = useAsync(
    () => getEvent(id!, profile?.id ?? null), [id, profile?.id],
  )

  if (loading) return <PlainScreen title="Ивент"><Loading /></PlainScreen>
  if (error) return <PlainScreen title="Ивент"><Failed message={error} onRetry={reload} /></PlainScreen>
  if (!event) {
    return (
      <PlainScreen title="Ивент не найден">
        <p className="px-6 py-10 text-center text-[17px] text-muted">
          Возможно, организатор его отменил.
        </p>
      </PlainScreen>
    )
  }

  const organizer = event.participants.find((person) => person.role === 'organizer')
  const full = event.participants.length >= event.maxParticipants
  const started = new Date(event.startsAt).getTime() <= Date.now()

  async function act (action: () => Promise<void>, done?: () => void) {
    setBusy(true)
    setActionError('')
    try {
      await action()
      setJoining(false)
      setCancelling(false)
      if (done) done()
      else reload()
    } catch (cause) {
      // Без этого отказ выглядел так, будто кнопка просто не нажалась.
      setActionError(cause instanceof Error ? cause.message : 'Не удалось выполнить действие')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PlainScreen
      left={<button onClick={() => navigate(-1)} aria-label="Назад"><BackIcon className="size-7" /></button>}
    >
      <div className="space-y-4 px-4 pb-8">
        <div className="relative">
          <Cover
            src={event.coverUrl} category={event.category}
            className="h-56 w-full rounded-[24px]" emojiClassName="text-7xl"
          />
          {event.myRole !== 'guest' && (
            <span className="absolute right-3 top-3 rounded-full bg-green-800/90 px-5 py-2.5
                             text-[16px] font-semibold">
              {event.myRole === 'organizer' ? 'Ты организатор' : 'Ты участвуешь'}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Chip tone="accent">{categoryTitle(event.category)}</Chip>
          <Chip tone="accent">+ {event.qpReward} QP</Chip>
          <Chip tone="accent">{STATUS_LABEL[event.status]}</Chip>
        </div>

        <h1 className="text-[25px]">{event.title}</h1>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-card bg-surface-2 p-3.5">
            <p className="text-[15px] text-muted">Дата</p>
            <p className="text-[18px] font-semibold">{formatDate(event.startsAt)}</p>
          </div>
          <div className="rounded-card bg-surface-2 p-3.5">
            <p className="text-[15px] text-muted">Время</p>
            <p className="text-[18px] font-semibold">{formatTime(event.startsAt)}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-card bg-surface-2 p-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] text-muted">Место</p>
            <p className="truncate text-[18px] font-semibold">{event.address}</p>
          </div>
          <Link to="/map" aria-label="Показать на карте">
            <PinIcon className="size-7 text-accent" />
          </Link>
        </div>

        <div className="rounded-card bg-surface-2 p-3.5">
          <p className="text-[15px] text-muted">
            Участники · {event.participants.length} из {event.maxParticipants}
          </p>
          <div className="mt-3 flex items-center">
            {event.participants.slice(0, 4).map((person, index) => (
              <Avatar
                key={person.id} name={person.nickname} src={person.avatarUrl} size={46}
                className={index > 0 ? '-ml-3 ring-2 ring-surface-2' : ''}
              />
            ))}
            {event.participants.length > 4 && (
              <span className="-ml-3 grid size-[46px] place-items-center rounded-full bg-bg
                               text-[18px] font-semibold ring-2 ring-surface-2">
                +{event.participants.length - 4}
              </span>
            )}
          </div>
        </div>

        {event.description && (
          <div className="rounded-card bg-surface-2 p-3.5">
            <p className="text-[15px] text-muted">Описание</p>
            <p className="mt-1 text-[17px] leading-snug">{event.description}</p>
          </div>
        )}

        {organizer && (
          <div className="flex items-center gap-3 rounded-card bg-surface-2 p-3.5">
            <Avatar name={organizer.nickname} src={organizer.avatarUrl} size={52} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[18px] font-semibold">{organizer.nickname}</p>
              <p className="flex items-center gap-1.5 text-[16px]">
                <StarIcon className="size-4 text-yellow-400" /> 4.8
              </p>
            </div>
            <ChevronIcon className="size-5 shrink-0 text-muted" />
          </div>
        )}

        {/* Действия зависят от роли — таблица режимов из ЧТЗ 5.6. */}
        {event.myRole === 'guest' ? (
          <Button disabled={full || busy} onClick={() => setJoining(true)}>
            {full ? 'Мест нет' : 'Присоединиться к ивенту'}
          </Button>
        ) : (
          <div className="space-y-3">
            {event.status === 'in_progress' && (
              <Button onClick={() => navigate(`/event/${event.id}/quest`)}>
                Перейти к заданиям
              </Button>
            )}
            {event.chatOpened ? (
              <Button
                variant={event.status === 'in_progress' ? 'ghost' : 'primary'}
                onClick={() => navigate(`/event/${event.id}/chat`)}
              >
                Открыть чат
              </Button>
            ) : event.myRole === 'organizer'
                && event.participants.length >= event.minParticipants ? (
              <Button disabled={busy} onClick={() => act(() => openChat(event.id))}>
                Создать чат
              </Button>
            ) : (
              <p className="rounded-card bg-surface-2 py-4 text-center text-[16px] text-muted">
                Чат откроется, когда наберётся {event.minParticipants} участника
              </p>
            )}
            {event.myRole === 'participant' && event.status === 'active' && (
              <button
                disabled={busy}
                onClick={() => act(
                  () => leaveEvent(event.id, profile!.id),
                  () => { toast('Вы покинули ивент'); reload() },
                )}
                className="w-full py-2 text-center text-[17px] text-muted"
              >
                Покинуть ивент
              </button>
            )}

            {/* До начала ивент отменяют, после — завершают (ЧТЗ 5.13).
                Кнопка меняется по времени начала, а не отказывает при нажатии. */}
            {event.myRole === 'organizer' && event.status === 'active' && !started && (
              <button
                disabled={busy} onClick={() => setCancelling(true)}
                className="w-full py-2 text-center text-[17px] text-red-400"
              >
                Отменить ивент
              </button>
            )}

            {event.myRole === 'organizer' && started
              && (event.status === 'active' || event.status === 'in_progress') && (
              <button
                disabled={busy}
                onClick={() => act(
                  () => finishEvent(event.id, profile!.id),
                  () => { toast('Ивент завершён'); navigate('/events') },
                )}
                className="w-full py-2 text-center text-[17px] text-muted"
              >
                Завершить ивент
              </button>
            )}

            {actionError && (
              <p className="text-center text-[15px] text-red-400">{actionError}</p>
            )}
          </div>
        )}
      </div>

      {/* Отмена с причиной: участникам важно узнать, почему встречи не будет. */}
      {cancelling && (
        <div className="absolute inset-0 z-30 flex items-end bg-black/60 px-4 pb-6">
          <div className="w-full space-y-4 rounded-[28px] bg-surface p-6">
            <h2 className="text-center text-[22px]">Отменить ивент?</h2>
            <p className="text-center text-[16px] leading-snug text-muted">
              {event.participants.length > 1
                ? `${event.participants.length - 1} чел. уже записались — им придёт уведомление с причиной.`
                : 'Ивент пропадёт из поиска и с карты.'}
            </p>

            <Field
              placeholder="Причина: заболел, перенос, не набралась группа…"
              value={reason} onChange={(e) => setReason(e.target.value)} maxLength={120}
            />

            <p className="text-center text-[14px] leading-snug text-muted">
              Отмена не возвращает недельную квоту на создание ивентов.
            </p>

            {actionError && <p className="text-[15px] text-red-400">{actionError}</p>}

            <Button
              disabled={busy || reason.trim().length < 3}
              onClick={() => act(
                () => cancelEvent(event.id, profile!.id, reason.trim()),
                () => { toast('Ивент отменён'); navigate('/events') },
              )}
            >
              {busy ? 'Отменяем…' : 'Отменить ивент'}
            </Button>
            <Button variant="quiet" onClick={() => setCancelling(false)}>Не отменять</Button>
          </div>
        </div>
      )}

      {/* Подтверждение вступления — модальное окно из ЧТЗ 5.7, шаг 3. */}
      {joining && (
        <div className="absolute inset-0 z-30 flex items-end bg-black/60 px-4 pb-6">
          <div className="w-full space-y-4 rounded-[28px] bg-surface p-6">
            <h2 className="text-center text-[24px]">Присоединиться к ивенту?</h2>

            <div className="rounded-card bg-surface-2 p-3.5">
              <p className="text-[19px] font-bold">{event.title}</p>
              <p className="mt-1 text-[16px] text-muted">
                {formatDate(event.startsAt)}, {formatTime(event.startsAt)} · {event.address}
              </p>
            </div>

            <p className="text-center text-[16px] leading-snug text-muted">
              Чат будет создан после набора минимального количества участников
            </p>

            <Button
              disabled={busy}
              onClick={() => act(
                () => joinEvent(event.id, profile!.id),
                () => { toast('Вы записались'); reload() },
              )}
            >
              {busy ? 'Занимаем место…' : 'Подтвердить'}
            </Button>
            <Button variant="quiet" onClick={() => setJoining(false)}>Отмена</Button>
          </div>
        </div>
      )}
    </PlainScreen>
  )
}
