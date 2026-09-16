import { TabScreen } from '../components/Layout'
import { EventListCard } from '../components/EventCard'
import { Link } from 'react-router-dom'
import { EVENTS } from '../data/demo'

/** Свои ивенты: те, где пользователь организатор или участник. */
export default function Events () {
  const mine = EVENTS.filter((event) => event.myRole !== 'guest')

  return (
    <TabScreen>
      <div className="space-y-5 px-5 pt-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[28px]">Мои ивенты</h1>
          <Link
            to="/create"
            className="btn-primary rounded-full px-5 py-3 text-[16px] font-semibold text-white"
          >
            Создать
          </Link>
        </div>

        <div className="space-y-4">
          {mine.map((event) => <EventListCard key={event.id} event={event} />)}
        </div>
      </div>
    </TabScreen>
  )
}
