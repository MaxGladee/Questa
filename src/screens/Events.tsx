import { Link } from 'react-router-dom'
import { TabScreen } from '../components/Layout'
import { EventListCard } from '../components/EventCard'
import { Empty, Failed, Loading } from '../components/States'
import { useAuth } from '../lib/auth'
import { listEvents } from '../lib/api'
import { useAsync } from '../lib/useAsync'

/** Свои ивенты: те, где пользователь организатор или участник. */
export default function Events () {
  const { profile } = useAuth()
  const { data, error, loading, reload } = useAsync(
    () => listEvents(profile?.id ?? null), [profile?.id],
  )

  const mine = (data ?? []).filter((event) => event.myRole !== 'guest')

  return (
    <TabScreen>
      <div className="space-y-5 px-5 pt-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[24px]">Мои ивенты</h1>
          <Link
            to="/create"
            className="btn-primary rounded-full px-5 py-3 text-[16px] font-semibold text-white"
          >
            Создать
          </Link>
        </div>

        {loading && <Loading />}
        {error && <Failed message={error} onRetry={reload} />}
        {!loading && !error && mine.length === 0 && (
          <Empty label="Вы пока никуда не записались. Создайте свой ивент или загляните в рекомендации." />
        )}

        <div className="space-y-3">
          {mine.map((event) => <EventListCard key={event.id} event={event} />)}
        </div>
      </div>
    </TabScreen>
  )
}
