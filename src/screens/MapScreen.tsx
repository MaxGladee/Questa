import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { addMapTiles, eventPin } from '../lib/map'
import { TabScreen } from '../components/Layout'
import { Cover } from '../components/Art'
import {
  categoryTitle, formatDate, formatTime, type QuestaEvent,
} from '../data/demo'
import {
  MapFilters, NO_FILTERS, activeFilterCount, matchesFilters, type MapFilterState,
} from '../components/MapFilters'
import { renderToStaticMarkup } from 'react-dom/server'
import { Avatar } from '../components/ui'
import { LocateIcon, PinIcon } from '../components/icons'
import { GEO_QUICK, distanceMeters, formatDistance, geoErrorMessage } from '../lib/geo'
import { listEvents } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { useAuth } from '../lib/auth'
import { useToast } from '../components/Toast'
import { cityCenter } from '../data/cities'
import { placeEmoji, venuesAround, type NearbyPlace } from '../lib/places'

// Карта на OpenStreetMap. В ТЗ 11.1 указан MapKit Яндекса — он требует
// платного ключа и заявки, поэтому в прототипе подключён бесплатный источник
// тайлов. Замена провайдера затрагивает только этот файл.

export default function MapScreen () {
  const { profile } = useAuth()
  const { data } = useAsync(
    () => listEvents(profile?.id ?? null, profile?.city), [profile?.id, profile?.city],
  )
  // Отменённые и завершённые на карте не нужны — туда уже не придёшь.
  const events: QuestaEvent[] = (data ?? []).filter(
    (event) => event.status === 'active' || event.status === 'in_progress',
  )
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [filters, setFilters] = useState<MapFilterState>(NO_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [me, setMe] = useState<[number, number] | null>(null)
  const [venues, setVenues] = useState<NearbyPlace[] | null>(null)
  const [venue, setVenue] = useState<NearbyPlace | null>(null)
  const [loadingVenues, setLoadingVenues] = useState(false)
  // К своей точке карту подводим один раз — дальше её двигает человек.
  const centeredOnMe = useRef(false)
  const toast = useToast()

  useEffect(() => {
    if (!container.current || map.current) return

    map.current = L.map(container.current, { zoomControl: false })
      .setView(cityCenter(profile?.city), 12)

    addMapTiles(map.current)

    return () => { map.current?.remove(); map.current = null }
  }, [profile?.city])

  // Своя точка на карте: без неё непонятно, далеко ли до ивентов.
  useEffect(() => {
    if (!('geolocation' in navigator)) return

    const watch = navigator.geolocation.watchPosition(
      ({ coords }) => {
        setMe([coords.latitude, coords.longitude])

        // Первый отклик приводит карту к себе: иначе метка «я» остаётся
        // где-то за краем экрана, и кажется, что её нет вовсе.
        if (!centeredOnMe.current) {
          centeredOnMe.current = true
          map.current?.setView([coords.latitude, coords.longitude], 14)
        }
      },
      () => {},
      GEO_QUICK,
    )

    return () => navigator.geolocation.clearWatch(watch)
  }, [])

  // Своя точка — аватар в кружке, а не безликая точка: на карте с метками
  // ивентов сразу понятно, которая из них ты.
  useEffect(() => {
    const instance = map.current
    if (!instance || !me || !profile) return

    const avatar = renderToStaticMarkup(
      <Avatar name={profile.nickname} src={profile.avatarUrl} size={38} />,
    )

    const marker = L.marker(me, {
      icon: L.divIcon({
        className: '',
        html: `<span style="display:block;width:44px;height:44px;padding:3px;border-radius:999px;
                            background:#8769FF;box-shadow:0 2px 10px rgb(0 0 0 / .5)">
                 ${avatar}
               </span>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      }),
      // Ниже меток ивентов: своё положение и так понятно, а чужие метки
      // важнее не закрывать.
      zIndexOffset: -500,
    }).addTo(instance)

    return () => { marker.remove() }
  }, [me, profile?.avatarUrl, profile?.nickname])

  /**
   * Заведения рядом.
   *
   * Между ивентами карта пустая, и непонятно, куда вообще идти. Слой
   * включается по кнопке, а не сам: поиск идёт через Nominatim, и дёргать
   * его при каждом движении карты нельзя — он просит не частить.
   *
   * Рейтингов у OpenStreetMap нет: их отдают Яндекс и 2ГИС, и обоим нужен
   * платный ключ. Поэтому карточка места ведёт в Яндекс.Карты, где рейтинг
   * и отзывы уже есть, — честнее, чем показывать выдуманные звёзды.
   */
  async function toggleVenues () {
    if (venues) {
      setVenues(null)
      setVenue(null)
      return
    }

    const centre = map.current?.getCenter()
    if (!centre) return

    setLoadingVenues(true)
    toast('Ищем места рядом…')

    const found = await venuesAround(centre.lat, centre.lng)
    setVenues(found)
    setLoadingVenues(false)

    if (found.length === 0) toast('Рядом ничего не нашлось', 'error')
  }

  useEffect(() => {
    const instance = map.current
    if (!instance || !venues) return

    const layer = L.layerGroup().addTo(instance)

    for (const place of venues) {
      L.marker([place.lat, place.lng], {
        icon: L.divIcon({
          className: '',
          html: `<span style="display:grid;place-items:center;width:30px;height:30px;
                              border-radius:999px;background:#1B1235;font-size:15px;
                              border:1px solid rgba(255,255,255,.18);
                              box-shadow:0 2px 8px rgb(0 0 0 / .45)">
                   ${placeEmoji(place.kind)}
                 </span>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
        zIndexOffset: -200,
      })
        .addTo(layer)
        .on('click', () => { setVenue(place); setSelected(null) })
    }

    return () => { layer.remove() }
  }, [venues])

  const shown = events.filter((event) => matchesFilters(event, filters, me))

  // Маркеры пересобираются при смене отбора (ЧТЗ 5.4).
  useEffect(() => {
    const instance = map.current
    if (!instance) return

    const layer = L.layerGroup().addTo(instance)

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.map((item) => item.id).join(','), selected])

  const chosen = activeFilterCount(filters)
  const event = shown.find((item) => item.id === selected)

  function showMe () {
    if (me) {
      map.current?.flyTo(me, 15)
      return
    }

    if (!('geolocation' in navigator)) {
      toast('Браузер не умеет определять геопозицию')
      return
    }

    // Запрос идёт по нажатию, а не сам по себе: Safari на iPhone
    // показывает окно с вопросом только в ответ на действие человека.
    toast('Определяем, где вы…')

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setMe([coords.latitude, coords.longitude])
        map.current?.flyTo([coords.latitude, coords.longitude], 15)
      },
      (problem) => toast(geoErrorMessage(problem)),
      GEO_QUICK,
    )
  }

  return (
    <TabScreen fullBleed>
      <div className="relative h-full">
        {/*
          z-0 на контейнере карты создаёт отдельный контекст наложения:
          внутренние слои Leaflet со своими z-index 400-700 остаются внутри
          него и перестают перекрывать фильтры, карточку и нижнюю панель.
        */}
        <div ref={container} className="absolute inset-0 z-0 bg-surface" />

        {/* Весь отбор — за одной кнопкой: шестнадцать категорий строкой
            превратились бы в ленту, которую нужно листать до конца. */}
        <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 px-4 pt-4">
          <button
            onClick={() => setFiltersOpen(true)}
            className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-[15px]
                        font-semibold shadow-lg transition ${
              chosen > 0 ? 'bg-accent text-white' : 'bg-surface text-white'}`}
          >
            Фильтры
            {chosen > 0 && (
              <span className="grid size-5 place-items-center rounded-full bg-white text-[12px]
                               font-bold text-accent">
                {chosen}
              </span>
            )}
          </button>

          <span className="rounded-full bg-surface/90 px-3.5 py-2 text-[14px] text-muted shadow-lg">
            {shown.length === events.length
              ? `${events.length} рядом`
              : `${shown.length} из ${events.length}`}
          </span>

          {chosen > 0 && (
            <button
              onClick={() => setFilters(NO_FILTERS)}
              className="rounded-full bg-surface/90 px-3.5 py-2 text-[14px] text-muted shadow-lg"
            >
              Сбросить
            </button>
          )}
        </div>

        {/*
          Кнопка «я на карте»: возвращает к своей точке, когда карту увели в
          сторону, и объясняет, если браузер не отдаёт геопозицию.
        */}
        <button
          onClick={toggleVenues} aria-label="Места рядом"
          className={`absolute left-4 z-10 flex items-center gap-2 rounded-full px-4 py-2.5
                      text-[15px] font-semibold shadow-lg transition
                      ${venue ? 'bottom-[24rem]' : event ? 'bottom-[19.5rem]' : 'bottom-24'}
                      ${venues ? 'bg-accent text-white' : 'bg-surface text-white'}`}
        >
          {loadingVenues ? 'Ищем…' : venues ? 'Скрыть места' : 'Места рядом'}
        </button>

        <button
          onClick={showMe} aria-label="Моя геолокация"
          className={`absolute right-4 z-10 grid size-12 place-items-center rounded-full
                      bg-surface shadow-lg transition
                      ${venue ? 'bottom-[24rem]' : event ? 'bottom-[19.5rem]' : 'bottom-24'}
                      ${me ? 'text-accent' : 'text-muted'}`}
        >
          <LocateIcon className="size-6" />
        </button>

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
        {!event && shown.length === 0 && (
          <div className="absolute inset-x-4 bottom-24 z-10 rounded-card bg-surface p-4
                          text-center shadow-2xl">
            <p className="text-[17px] font-semibold">
              {chosen > 0 ? 'Под фильтры ничего не подошло' : 'Рядом пока пусто'}
            </p>
            <p className="mt-1 text-[15px] leading-snug text-muted">
              {chosen > 0
                ? 'Попробуйте снять часть условий — например, расстояние или день.'
                : 'Никто не создал ивент поблизости. Можно стать первым — идеи есть на главной.'}
            </p>
          </div>
        )}

        {/* Карточка заведения. Рейтинг живёт в Яндекс.Картах — туда и ведём. */}
        {venue && !event && (
          <div className="absolute inset-x-3 bottom-24 z-10 space-y-3 rounded-card bg-surface
                          p-3.5 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface-2
                               text-[24px]">
                {placeEmoji(venue.kind)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[18px] font-bold">{venue.name}</p>
                <p className="mt-0.5 text-[14px] text-muted">
                  {venue.kind} · {formatDistance(venue.meters)} от центра карты
                </p>
              </div>
              <button
                onClick={() => setVenue(null)} aria-label="Скрыть карточку"
                className="shrink-0 px-1 text-[20px] leading-none text-muted"
              >
                ×
              </button>
            </div>

            <p className="text-[14px] leading-snug text-muted">
              Рейтинг и отзывы — в Яндекс.Картах: у OpenStreetMap их нет, а
              выдумывать звёзды нельзя.
            </p>

            <a
              href={`https://yandex.ru/maps/?mode=search&text=${encodeURIComponent(venue.name)}`
                + `&ll=${venue.lng},${venue.lat}&z=17`}
              target="_blank" rel="noreferrer"
              className="block rounded-[18px] bg-surface-2 py-3 text-center text-[16px] font-semibold"
            >
              Открыть в Яндекс.Картах
            </a>

            <Link
              to="/create"
              state={{ place: { address: venue.name, lat: venue.lat, lng: venue.lng } }}
              className="btn-primary block rounded-[18px] py-3 text-center text-[16px]
                         font-semibold text-white"
            >
              Позвать сюда
            </Link>
          </div>
        )}

        {filtersOpen && (
          <MapFilters
            filters={filters} found={shown.length}
            onChange={setFilters} onClose={() => setFiltersOpen(false)}
          />
        )}
      </div>
    </TabScreen>
  )
}
