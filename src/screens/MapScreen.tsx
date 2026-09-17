import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { addMapTiles, eventPin } from '../lib/map'
import { TabScreen } from '../components/Layout'
import { Cover } from '../components/Art'
import {
  CATEGORIES, categoryTitle, formatDate, formatTime,
  type CategoryCode, type QuestaEvent,
} from '../data/demo'
import { Avatar } from '../components/ui'
import { PinIcon } from '../components/icons'
import { distanceMeters, formatDistance } from '../lib/geo'
import { listEvents } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { useAuth } from '../lib/auth'

// Карта на OpenStreetMap. В ТЗ 11.1 указан MapKit Яндекса — он требует
// платного ключа и заявки, поэтому в прототипе подключён бесплатный источник
// тайлов. Замена провайдера затрагивает только этот файл.
const CENTER: [number, number] = [56.8389, 60.6057]   // Екатеринбург

export default function MapScreen () {
  const { profile } = useAuth()
  const { data } = useAsync(() => listEvents(profile?.id ?? null), [profile?.id])
  // Отменённые и завершённые на карте не нужны — туда уже не придёшь.
  const events: QuestaEvent[] = (data ?? []).filter(
    (event) => event.status === 'active' || event.status === 'in_progress',
  )
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [categories, setCategories] = useState<CategoryCode[]>([])
  const [me, setMe] = useState<[number, number] | null>(null)

  useEffect(() => {
    if (!container.current || map.current) return

    map.current = L.map(container.current, { zoomControl: false })
      .setView(CENTER, 12)

    addMapTiles(map.current)

    return () => { map.current?.remove(); map.current = null }
  }, [])

  // Своя точка на карте: без неё непонятно, далеко ли до ивентов.
  useEffect(() => {
    if (!('geolocation' in navigator)) return

    const watch = navigator.geolocation.watchPosition(
      ({ coords }) => setMe([coords.latitude, coords.longitude]),
      () => {},
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
    )

    return () => navigator.geolocation.clearWatch(watch)
  }, [])

  useEffect(() => {
    const instance = map.current
    if (!instance || !me) return

    const dot = L.circleMarker(me, {
      radius: 8, color: '#fff', weight: 3, fillColor: '#00C400', fillOpacity: 1,
    }).addTo(instance)

    return () => { dot.remove() }
  }, [me])

  // Маркеры пересобираются при смене фильтра категорий (ЧТЗ 5.4).
  useEffect(() => {
    const instance = map.current
    if (!instance) return

    const layer = L.layerGroup().addTo(instance)
    const shown = events.filter(
      (event) => categories.length === 0 || categories.includes(event.category),
    )

    for (const event of shown) {
      L.marker([event.lat, event.lng], {
        icon: eventPin({
          cover: event.coverUrl,
          category: event.category,
          selected: event.id === selected,
        }),
        // Выбранная метка поднимается над соседними, иначе её перекрывают.
        zIndexOffset: event.id === selected ? 1000 : 0,
      })
        .addTo(layer)
        .on('click', () => setSelected(event.id))
    }

    return () => { layer.remove() }
  }, [categories, events, selected])

  const toggle = (code: CategoryCode) =>
    setCategories((list) =>
      list.includes(code) ? list.filter((c) => c !== code) : [...list, code])

  const event = events.find((item) => item.id === selected)

  return (
    <TabScreen fullBleed>
      <div className="relative h-full">
        {/*
          z-0 на контейнере карты создаёт отдельный контекст наложения:
          внутренние слои Leaflet со своими z-index 400-700 остаются внутри
          него и перестают перекрывать фильтры, карточку и нижнюю панель.
        */}
        <div ref={container} className="absolute inset-0 z-0 bg-surface" />

        <div className="no-scrollbar pointer-events-auto absolute inset-x-0 top-0 z-10 flex gap-2
                        overflow-x-auto px-4 pb-3 pt-4">
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

        {/* Карточка по нажатию на маркер: всё, по чему решают, идти или нет. */}
        {event && (
          <div className="absolute inset-x-3 bottom-24 z-10 space-y-3 rounded-card bg-surface
                          p-3.5 shadow-2xl">
            <div className="flex items-start gap-3">
              <Cover
                src={event.coverUrl} category={event.category}
                className="size-16 shrink-0 rounded-2xl" emojiClassName="text-3xl"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[18px] font-bold">{event.title}</p>
                <p className="mt-0.5 line-clamp-2 text-[14px] leading-snug text-muted">
                  {event.description}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)} aria-label="Скрыть карточку"
                className="shrink-0 px-1 text-[20px] leading-none text-muted"
              >
                ×
              </button>
            </div>

            <div className="flex flex-wrap gap-2 text-[13px]">
              <span className="rounded-full bg-chip px-3 py-1.5">
                {categoryTitle(event.category)}
              </span>
              <span className="rounded-full bg-chip px-3 py-1.5">
                {formatDate(event.startsAt)}, {formatTime(event.startsAt)}
              </span>
              <span className="rounded-full bg-chip px-3 py-1.5">
                {event.participants.length} из {event.maxParticipants} мест занято
              </span>
              {me && (
                <span className="rounded-full bg-chip px-3 py-1.5">
                  {formatDistance(distanceMeters(me, [event.lat, event.lng]))} отсюда
                </span>
              )}
            </div>

            <p className="flex items-center gap-2 text-[14px] text-muted">
              <PinIcon className="size-4 shrink-0" />
              <span className="truncate">{event.address}</span>
            </p>

            {event.participants.length > 0 && (
              <div className="flex items-center">
                {event.participants.slice(0, 5).map((person, index) => (
                  <Avatar
                    key={person.id} name={person.nickname} src={person.avatarUrl} size={30}
                    className={index > 0 ? '-ml-2 ring-2 ring-surface' : ''}
                  />
                ))}
              </div>
            )}

            <Link
              to={`/event/${event.id}`}
              className="btn-primary block rounded-[18px] py-3 text-center text-[16px]
                         font-semibold text-white"
            >
              Открыть ивент
            </Link>
          </div>
        )}

        {/* Пустая карта без объяснения выглядит как поломка. */}
        {!event && events.length === 0 && (
          <div className="absolute inset-x-4 bottom-24 z-10 rounded-card bg-surface p-4
                          text-center shadow-2xl">
            <p className="text-[17px] font-semibold">Рядом пока пусто</p>
            <p className="mt-1 text-[15px] leading-snug text-muted">
              Никто не создал ивент поблизости. Можно стать первым — идеи есть на главной.
            </p>
          </div>
        )}
      </div>
    </TabScreen>
  )
}
