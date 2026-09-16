import { Link } from 'react-router-dom'
import { CalendarIcon, ChevronIcon, PinIcon } from './icons'
import { formatDate, formatTime, type QuestaEvent } from '../data/demo'

/** Карточка ивента в списке — состав элементов задан в ЧТЗ 5.3. */
export function EventListCard ({ event }: { event: QuestaEvent }) {
  return (
    <Link
      to={`/event/${event.id}`}
      className="block rounded-card bg-surface p-4 transition active:scale-[0.99]"
    >
      <div className="flex gap-4">
        <img
          src={event.coverUrl} alt="" width={112} height={112}
          className="size-[72px] shrink-0 rounded-2xl object-cover"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 truncate text-[20px]">{event.title}</h3>
            <ChevronIcon className="mt-1 size-5 shrink-0 text-white" />
          </div>
          <p className="mt-1 line-clamp-2 text-[16px] leading-snug text-muted">
            {event.description}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="flex items-center gap-2 rounded-xl bg-chip px-3 py-2 text-[15px]">
          <CalendarIcon className="size-4" />
          {formatDate(event.startsAt)}, {formatTime(event.startsAt)}
        </span>
        <span className="flex items-center gap-2 rounded-xl bg-chip px-3 py-2 text-[15px]">
          <PinIcon className="size-4" />
          {event.address}
        </span>
      </div>
    </Link>
  )
}
