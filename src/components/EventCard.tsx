import { Link } from 'react-router-dom'
import { CalendarIcon, ChatIcon, ChevronIcon, PinIcon, StarIcon, UserIcon } from './icons'
import { Cover } from './Art'
import { formatDate, formatTime, type EventStatus, type QuestaEvent } from '../data/demo'

// Подписывается только то, что требует внимания: идущий, отменённый и
// прошедший. У ивента, который просто ждёт своего часа, подписи нет.
const STATUS_LABEL: Partial<Record<EventStatus, string>> = {
  in_progress: 'Идёт сейчас',
  finished: 'Завершён',
  cancelled: 'Отменён',
}

/** «1 сообщение» / «3 сообщения» / «7 сообщений». */
function messagesWord (count: number): string {
  const tens = count % 100
  const ones = count % 10
  if (tens > 10 && tens < 20) return 'сообщений'
  if (ones === 1) return 'сообщение'
  if (ones >= 2 && ones <= 4) return 'сообщения'
  return 'сообщений'
}

/** Карточка ивента в списке — состав элементов задан в ЧТЗ 5.3. */
export function EventListCard (
  { event, myScore, unread }: {
    event: QuestaEvent
    /** Балл, который человек уже поставил этой встрече, если оценивал. */
    myScore?: number
    /** Сколько сообщений в чате человек ещё не видел. */
    unread?: number
  },
) {
  return (
    <Link
      to={`/event/${event.id}`}
      className="block rounded-card bg-surface p-3.5 transition active:scale-[0.99]"
    >
      <div className="flex gap-4">
        <Cover
          src={event.coverUrl} category={event.category}
          className="size-16 shrink-0 rounded-2xl" emojiClassName="text-3xl"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 truncate text-[18px]">{event.title}</h3>
            <ChevronIcon className="mt-1 size-5 shrink-0 text-white" />
          </div>

          {STATUS_LABEL[event.status] && (
            <span className={`mt-1 inline-block rounded-full px-2.5 py-1 text-[13px] font-semibold
                              ${event.status === 'cancelled'
                                ? 'bg-red-500/20 text-red-300'
                                : 'bg-white/10 text-muted'}`}>
              {STATUS_LABEL[event.status]}
            </span>
          )}
          <p className="mt-1 line-clamp-2 text-[15px] leading-snug text-muted">
            {event.description}
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-2">
        <span className="flex items-center gap-2 rounded-xl bg-chip px-3 py-1.5 text-[14px]">
          <CalendarIcon className="size-4" />
          {formatDate(event.startsAt)}, {formatTime(event.startsAt)}
        </span>
        <span className="flex items-center gap-2 rounded-xl bg-chip px-3 py-1.5 text-[14px]">
          <PinIcon className="size-4" />
          {event.address}
        </span>
        {/* Сколько мест занято — по этому решают, успеют ли записаться. */}
        <span className="flex items-center gap-2 rounded-xl bg-chip px-3 py-1.5 text-[14px]">
          <UserIcon className="size-4" />
          {event.participants.length} из {event.maxParticipants}
          {event.myRole === 'organizer' ? ' · вы организатор' : ''}
        </span>

        {/* Новые сообщения: иначе о них узнаёшь, только зайдя в чат.
            Считаются только написанные людьми — служебные объявления вроде
            «ивент начался» и так приходят уведомлениями. */}
        {(unread ?? 0) > 0 && (
          <span className="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5
                           text-[14px] font-semibold">
            <ChatIcon className="size-4" />
            {unread} {messagesWord(unread!)}
          </span>
        )}

        {/* Оценка ставится один раз, поэтому важно видеть, что она уже
            поставлена, не открывая итоги. */}
        {myScore !== undefined && (
          <span className="flex items-center gap-1.5 rounded-xl bg-warning/15 px-3 py-1.5
                           text-[14px] text-warning">
            <StarIcon className="size-4" />
            Вы оценили на {myScore}
          </span>
        )}
      </div>
    </Link>
  )
}
