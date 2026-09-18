import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PlainScreen } from '../components/Layout'
import { Avatar, Button, Chip, Field } from '../components/ui'
import { Failed, Loading } from '../components/States'
import {
  BackIcon, ChevronIcon, FlagIcon, PencilIcon, PinIcon, ShareIcon, StarIcon,
} from '../components/icons'
import { Cover } from '../components/Art'
import { categoryTitle, formatDate, formatTime } from '../data/demo'
import {
  AUTO_FINISH_HOURS, MIN_EVENT_MINUTES, autoFinishAt, cancelEvent, fileComplaint,
  finishEvent, getEvent, joinEvent, leaveEvent, openChat, startEvent, willCount,
} from '../lib/api'
import { ReportSheet } from '../components/ReportSheet'
import { Lightbox } from '../components/Lightbox'
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
/**
 * Карандаш рядом с полем.
 *
 * Кнопка «Изменить» внизу экрана нашлась не сразу: до неё нужно
 * прокрутить мимо участников, описания и организатора. Карандаш стоит там,
 * где смотрят на само значение, и ведёт на ту же форму.
 */
function EditPencil ({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to} aria-label={label}
      className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-accent-soft
                 transition active:scale-95"
    >
      <PencilIcon className="size-5" />
    </Link>
  )
}

/** Сколько минут идёт встреча — для предупреждения о раннем завершении. */
function minutesRunning (event: { startedAt?: string }): number {
  if (!event.startedAt) return 0
  return Math.max(0, Math.round((Date.now() - new Date(event.startedAt).getTime()) / 60_000))
}

export default function EventDetails () {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const toast = useToast()
  const [joining, setJoining] = useState(false)
  const [actionError, setActionError] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [zoomed, setZoomed] = useState<string | null>(null)

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

  // Карандаши показываются только тому, кто может править, и только пока
  // встреча не началась: после начала менять нечего.
  const canEdit = event.myRole === 'organizer' && event.status === 'active'
    && new Date(event.startsAt).getTime() > Date.now()
  const editTo = `/event/${event.id}/edit`

  const organizer = event.participants.find((person) => person.role === 'organizer')
  const full = event.participants.length >= event.maxParticipants
  const started = new Date(event.startsAt).getTime() <= Date.now()

  async function act (action: () => Promise<unknown>, done?: () => void) {
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

  /**
   * Начало встречи. Итог подбора заданий не прячется: если модель не
   * ответила, организатор должен об этом знать — иначе он смотрит на
   * шаблонные задания и думает, что это и есть «сгенерировано ИИ».
   */
  const start = async () => {
    setBusy(true)
    setActionError('')
    try {
      const outcome = await startEvent(event.id, profile!.id)

      if (outcome.source === 'ai') toast('Ивент начался — задания придумал ИИ')
      else if (outcome.source === 'template') toast('Ивент начался — взяли квест из коллекции')
      else toast('Ивент начался — оставили прежние задания')

      if (outcome.reason) setActionError(`Модель не ответила: ${outcome.reason}`)
      reload()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Не удалось начать ивент')
    } finally {
      setBusy(false)
    }
  }

  /**
   * Позвать знакомых. На телефоне открывается системное окно «поделиться»,
   * на компьютере ссылка просто копируется. Тот, кто перейдёт по ней без
   * входа, после входа попадёт сразу на этот ивент, а не на главную.
   */
  const share = async () => {
    const link = `${window.location.origin}${import.meta.env.BASE_URL}#/event/${event.id}`

    // К ссылке идёт короткий рассказ о встрече и о самом приложении: в
    // мессенджере видна одна строка, и «зайди сюда» без объяснения
    // выглядит как спам, а не как приглашение.
    const text = [
      `${event.title} — ${formatDate(event.startsAt)}, ${formatTime(event.startsAt)}`,
      event.address,
      '',
      'Собираемся через Questa: приложение для небольших встреч, где каждая',
      'превращается в квест с заданиями и очками. Присоединяйся 👇',
    ].join('\n')

    try {
      if (navigator.share) {
        await navigator.share({ title: event.title, text, url: link })
        return
      }

      // Без системного окна копируем приглашение целиком, а не голую ссылку.
      await navigator.clipboard.writeText(`${text}\n${link}`)
      toast('Приглашение скопировано')
    } catch {
      // Отказ в системном окне — не ошибка, человек просто передумал.
    }
  }

  return (
    <PlainScreen
      left={<button onClick={() => navigate(-1)} aria-label="Назад"><BackIcon className="size-7" /></button>}
      right={(
        <span className="flex items-center gap-2">
          <button
            onClick={share} aria-label="Поделиться ивентом"
            className="grid size-10 place-items-center rounded-full bg-surface-2"
          >
            <ShareIcon className="size-5" />
          </button>

          {/* Жалоба стоит отдельно от действий с самим ивентом: рядом с
              «покинуть» её слишком легко нажать не глядя. */}
          {event.myRole !== 'organizer' && (
            <button
              onClick={() => setReporting(true)} aria-label="Пожаловаться"
              className="grid size-10 place-items-center rounded-full bg-surface-2 text-red-400/80"
            >
              <FlagIcon className="size-5" />
            </button>
          )}
        </span>
      )}
    >
      <div className="space-y-4 px-4 pb-8">
        <div className="relative">
          {/* Обложка обрезана по высоте карточки — по нажатию показываем её
              целиком: на ней бывает важное, вроде афиши или вида места. */}
          <button
            onClick={() => event.coverUrl && setZoomed(event.coverUrl)}
            className="block w-full" aria-label="Открыть обложку"
          >
            <Cover
              src={event.coverUrl} category={event.category}
              className="h-56 w-full rounded-[24px]" emojiClassName="text-7xl"
            />
          </button>
          {event.myRole !== 'guest' && (
            <span className="pointer-events-none absolute right-3 top-3 rounded-full
                             bg-green-800/90 px-5 py-2.5
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

        <div className="flex items-start gap-2">
          <h1 className="min-w-0 flex-1 text-[25px]">{event.title}</h1>
          {canEdit && <EditPencil to={editTo} label="Изменить название" />}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 rounded-card bg-surface-2 p-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] text-muted">Дата</p>
              <p className="text-[18px] font-semibold">{formatDate(event.startsAt)}</p>
            </div>
            {canEdit && <EditPencil to={editTo} label="Изменить дату" />}
          </div>
          <div className="flex items-center gap-2 rounded-card bg-surface-2 p-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] text-muted">Время</p>
              <p className="text-[18px] font-semibold">{formatTime(event.startsAt)}</p>
            </div>
            {canEdit && <EditPencil to={editTo} label="Изменить время" />}
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-card bg-surface-2 p-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] text-muted">Место</p>
            <p className="truncate text-[18px] font-semibold">{event.address}</p>
          </div>
          {canEdit && <EditPencil to={editTo} label="Изменить место" />}
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
              <Link
                key={person.id} to={`/user/${person.id}`} aria-label={`Профиль: ${person.nickname}`}
                className={index > 0 ? '-ml-3' : ''}
              >
                <Avatar
                  name={person.nickname} src={person.avatarUrl} size={46}
                  className={index > 0 ? 'ring-2 ring-surface-2' : ''}
                />
              </Link>
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
          <div className="flex items-start gap-2 rounded-card bg-surface-2 p-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] text-muted">Описание</p>
              <p className="mt-1 text-[17px] leading-snug">{event.description}</p>
            </div>
            {canEdit && <EditPencil to={editTo} label="Изменить описание" />}
          </div>
        )}

        {organizer && (
          <Link
            to={`/user/${organizer.id}`}
            className="flex items-center gap-3 rounded-card bg-surface-2 p-3.5"
          >
            <Avatar name={organizer.nickname} src={organizer.avatarUrl} size={52} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[18px] font-semibold">{organizer.nickname}</p>
              <p className="flex items-center gap-1.5 text-[16px]">
                <StarIcon className="size-4 text-warning" />
                {organizer.rating ? organizer.rating.toFixed(1) : 'пока без оценок'}
              </p>
            </div>
            <ChevronIcon className="size-5 shrink-0 text-muted" />
          </Link>
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

            {/* Пока организатор не начал встречу, заданий нет ни у кого. */}
            {event.myRole === 'organizer' && event.status === 'active' && (
              <Button disabled={busy} onClick={start}>
                {/* Ожидание честное: в этот момент модель придумывает
                    задания под собравшуюся компанию, это занимает секунды. */}
                {busy ? 'Придумываем задания…' : 'Начать ивент'}
              </Button>
            )}

            {event.myRole === 'participant' && event.status === 'active' && (
              <p className="rounded-card bg-surface-2 py-3 text-center text-[15px] text-muted">
                Задания откроются, когда организатор начнёт встречу
              </p>
            )}
            {/* Завершённый ивент ведёт к итогам: сколько кто набрал и оценки. */}
            {event.status === 'finished' && (
              <Button onClick={() => navigate(`/event/${event.id}/summary`)}>
                Итоги и оценки
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
                className="w-full py-2 text-center text-[17px] text-red-400/90"
              >
                Покинуть ивент
              </button>
            )}

            {/* Пока встреча не началась, её можно поправить: перенести,
                сменить место, дописать описание. Раньше для этого
                оставалась только отмена. */}
            {event.myRole === 'organizer' && event.status === 'active' && !started && (
              <Button
                variant="ghost" disabled={busy}
                onClick={() => navigate(`/event/${event.id}/edit`)}
              >
                Изменить ивент
              </Button>
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

            {/* Пока встреча идёт, видно, когда она закроется сама: это
                ответ на «а что будет, если я забуду нажать». */}
            {event.status === 'in_progress' && (
              <p className="text-center text-[15px] leading-snug text-muted">
                Ивент закроется сам в {formatTime(autoFinishAt(event).toISOString())} —
                через {AUTO_FINISH_HOURS} часов после начала
              </p>
            )}

            {event.myRole === 'organizer' && started
              && (event.status === 'active' || event.status === 'in_progress') && (
              <button
                disabled={busy}
                onClick={() => (willCount(event)
                  ? act(
                      () => finishEvent(event.id, profile!.id),
                      () => {
                        toast('Ивент завершён')
                        navigate(`/event/${event.id}/summary`)
                      },
                    )
                  : setFinishing(true))}
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

      {reporting && (
        <ReportSheet
          title="Пожаловаться"
          targets={organizer
            ? [{ key: 'event', label: 'На ивент' }, { key: 'organizer', label: 'На организатора' }]
            : [{ key: 'event', label: 'На ивент' }]}
          onClose={() => setReporting(false)}
          onSubmit={async ({ reason: cause, comment, target }) => {
            await fileComplaint({
              authorId: profile!.id,
              targetEventId: target === 'event' ? event.id : undefined,
              targetUserId: target === 'organizer' ? organizer?.id : undefined,
              reason: cause,
              comment,
            })
            setReporting(false)
            toast('Жалоба отправлена модерации')
          }}
        />
      )}

      {zoomed && <Lightbox src={zoomed} alt="Обложка ивента" onClose={() => setZoomed(null)} />}

      {/* Завершение раньше срока.
          Встречу можно закрыть когда угодно — планы меняются. Но в
          статистику идут только состоявшиеся: иначе «провёл 20 встреч»
          набивалось бы за вечер, а цифра в профиле перестала бы
          что-либо значить. Здесь об этом говорится до нажатия. */}
      {finishing && (
        <div className="absolute inset-0 z-30 flex items-end bg-black/60 px-4 pb-6">
          <div className="w-full space-y-4 rounded-[28px] bg-surface p-6">
            <h2 className="text-center text-[22px]">Завершить сейчас?</h2>

            <p className="text-center text-[16px] leading-snug text-muted">
              {!event.startedAt
                ? 'Встречу так и не начали, поэтому она не попадёт ни в вашу статистику, ни в статистику участников.'
                : minutesRunning(event) < MIN_EVENT_MINUTES
                  ? `Встреча идёт ${minutesRunning(event)} мин. В зачёт идут ивенты длиннее ${MIN_EVENT_MINUTES} минут — этот в статистику не попадёт.`
                  : 'Отметились меньше двух человек, поэтому встреча не попадёт в статистику.'}
            </p>

            <p className="text-center text-[15px] leading-snug text-muted">
              Очки за уже выполненные задания останутся у всех, и ивент уйдёт в архив.
            </p>

            {actionError && <p className="text-[15px] text-red-400">{actionError}</p>}

            <Button
              disabled={busy}
              onClick={() => act(
                () => finishEvent(event.id, profile!.id),
                () => {
                  toast('Ивент завершён')
                  navigate(`/event/${event.id}/summary`)
                },
              )}
            >
              {busy ? 'Завершаем…' : 'Всё равно завершить'}
            </Button>
            <Button variant="quiet" onClick={() => setFinishing(false)}>Продолжить встречу</Button>
          </div>
        </div>
      )}

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
