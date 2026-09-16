import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { TabScreen } from '../components/Layout'
import { CATEGORIES, categoryTitle, formatTime, type CategoryCode, type QuestaEvent } from '../data/demo'
import { listEvents } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { useAuth } from '../lib/auth'

// Карта на OpenStreetMap. В ТЗ 11.1 указан MapKit Яндекса — он требует
// платного ключа и заявки, поэтому в прототипе подключён бесплатный источник
// тайлов. Замена провайдера затрагивает только этот файл.
const CENTER: [number, number] = [56.8389, 60.6057]   // Екатеринбург

const ICON_EMOJI: Record<CategoryCode, string> = {
  party: '🎉', chill: '🌿', bar: '🍸', walk: '🚶', boardgames: '🎲', other: '✨',
}

function marker (emoji: string) {
  return L.divIcon({
    className: '',
    html: `<span style="display:grid;place-items:center;width:38px;height:38px;
                        border-radius:999px;background:#8769FF;border:2px solid #fff;
                        font-size:18px;box-shadow:0 4px 12px rgb(0 0 0 / .45)">${emoji}</span>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  })
}

export default function MapScreen () {
  const { profile } = useAuth()
  const { data } = useAsync(() => listEvents(profile?.id ?? null), [profile?.id])
  const events: QuestaEvent[] = data ?? []
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [categories, setCategories] = useState<CategoryCode[]>([])

  useEffect(() => {
    if (!container.current || map.current) return

    map.current = L.map(container.current, { zoomControl: false, attributionControl: false })
      .setView(CENTER, 12)

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 })
      .addTo(map.current)

    return () => { map.current?.remove(); map.current = null }
  }, [])

  // Маркеры пересобираются при смене фильтра категорий (ЧТЗ 5.4).
  useEffect(() => {
    const instance = map.current
    if (!instance) return

    const layer = L.layerGroup().addTo(instance)
    const shown = events.filter(
      (event) => categories.length === 0 || categories.includes(event.category),
    )

    for (const event of shown) {
      L.marker([event.lat, event.lng], { icon: marker(ICON_EMOJI[event.category]) })
        .addTo(layer)
        .on('click', () => setSelected(event.id))
    }

    return () => { layer.remove() }
  }, [categories, events])

  const toggle = (code: CategoryCode) =>
    setCategories((list) =>
      list.includes(code) ? list.filter((c) => c !== code) : [...list, code])

  const event = events.find((item) => item.id === selected)

  return (
    <TabScreen>
      <div className="relative h-full">
        <div ref={container} className="absolute inset-0 bg-surface" />

        <div className="no-scrollbar pointer-events-auto absolute inset-x-0 top-0 z-10 flex gap-2
                        overflow-x-auto px-4 py-3">
          {CATEGORIES.map(({ code, title }) => (
            <button
              key={code} onClick={() => toggle(code)}
              className={`shrink-0 rounded-full px-4 py-2.5 text-[15px] font-semibold shadow-lg
                          transition ${
                categories.includes(code) ? 'bg-accent text-white' : 'bg-surface text-white'}`}
            >
              {title}
            </button>
          ))}
        </div>

        {event && (
          <Link
            to={`/event/${event.id}`}
            className="absolute inset-x-4 bottom-24 z-10 flex items-center gap-3 rounded-card
                       bg-surface p-3 shadow-2xl"
          >
            <img
              src={event.coverUrl} alt="" width={96} height={96}
              className="size-14 shrink-0 rounded-xl object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[18px] font-bold">{event.title}</p>
              <p className="truncate text-[15px] text-muted">
                {categoryTitle(event.category)} · {formatTime(event.startsAt)}
              </p>
            </div>
          </Link>
        )}
      </div>
    </TabScreen>
  )
}
