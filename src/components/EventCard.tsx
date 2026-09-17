import { Link } from 'react-router-dom'
import { CalendarIcon, ChevronIcon, PinIcon } from './icons'
import { Cover } from './Art'
import { formatDate, formatTime, type QuestaEvent } from '../data/demo'

/** Карточка ивента в списке — состав элементов задан в ЧТЗ 5.3. */
export function EventListCard ({ event }: { event: QuestaEvent }) {
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
      </div>
    </Link>
  )
}
