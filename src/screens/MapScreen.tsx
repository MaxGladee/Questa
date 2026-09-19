import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { eventPin } from '../lib/map'
import { createMapView, type MapView } from '../lib/mapview'
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
import { distanceMeters, everAllowed, formatDistance, lastFix, locateMe, watchMe } from '../lib/geo'
import { listEvents } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { useAuth } from '../lib/auth'
import { useToast } from '../components/Toast'
import { cityCenter } from '../data/cities'
import { placeEmoji, venuesAround, type NearbyPlace } from '../lib/places'

// Какая карта под экраном — решает src/lib/mapview.ts: Яндекс, если есть
// ключ и библиотека загрузилась, иначе OpenStreetMap. Экран об этом не
// знает и работает с любым движком одинаково.

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
  const map = useRef<MapView | null>(null)
  // Карта собирается не мгновенно (библиотеку ещё нужно загрузить), и
  // метки не могут появиться раньше неё.
  const [ready, setReady] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [filters, setFilters] = useState<MapFilterState>(NO_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [me, setMe] = useState<[number, number] | null>(null)
  const [watching, setWatching] = useState(everAllowed)
  const [venues, setVenues] = useState<NearbyPlace[] | null>(null)
  const [venue, setVenue] = useState<NearbyPlace | null>(null)
  const [loadingVenues, setLoadingVenues] = useState(false)
  // К своей точке карту подводим один раз — дальше её двигает человек.
  const centeredOnMe = useRef(false)
  const toast = useToast()

  /**
   * Карта собирается один раз за жизнь экрана.
   *
   * Раньше в зависимостях стоял город, а он приезжает вместе с профилем —
   * через мгновение после открытия. Экран успевал заказать карту дважды:
   * первая ещё собиралась, вторая начинала собираться в том же узле, и на
   * месте карты оставался чёрный прямоугольник. Обновление страницы
   * «чинило» его потому, что профиль к тому моменту был уже в памяти.
   */
  useEffect(() => {
    const node = container.current
    if (!node || map.current) return

    let alive = true

    createMapView(node, { center: cityCenter(profile?.city), zoom: 12 }).then((view) => {
      if (!alive) return view.destroy()
      map.current = view
      setReady((step) => step + 1)

      // Экран появляется с анимацией, и карта может собраться, пока он ещё
      // едет: размеры тогда запоминаются неверные, и остаётся чёрный
      // прямоугольник. Два пересчёта — сразу и через полсекунды — стоят
      // копейки и снимают вопрос.
      requestAnimationFrame(() => view.refresh())
      setTimeout(() => { if (alive) view.refresh() }, 500)
    })

    return () => {
      alive = false
      map.current?.destroy()
      map.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Город приезжает с профилем: как только он известен, показываем его —
  // но только пока человек не увёл карту сам и не нашёлся по геопозиции.
  useEffect(() => {
    if (!map.current || centeredOnMe.current || !profile?.city) return
    map.current.setView(cityCenter(profile.city), 12)
  }, [profile?.city, ready])

  /*
   * Своя точка на карте: без неё непонятно, далеко ли до ивентов.
   *
   * Начинаем с последней известной — она показывается сразу и никого ни о
   * чём не спрашивает. Слежение включается само только у того, кто доступ
   * уже давал: раньше карта запрашивала его при каждом открытии, и на
   * iPhone человек встречал окно с вопросом раньше самой карты, а отказ
   * потом не переспросишь. Остальные нажмут кнопку — и Safari покажет
   * вопрос охотнее, потому что это ответ на действие.
   */
  useEffect(() => {
    // Полчаса для метки «я» — слишком много: берём только совсем свежее.
    const known = lastFix(10 * 60_000)
    if (known) setMe(known)
  }, [])

  useEffect(() => {
    if (!watching) return
    return watchMe(setMe)
  }, [watching])

  // Первая же точка приводит карту к себе: иначе метка «я» остаётся где-то
  // за краем экрана, и кажется, что её нет вовсе. Дальше карта слушается
  // только человека — за ним она не бегает.
  useEffect(() => {
    if (!map.current || centeredOnMe.current || !me) return
    centeredOnMe.current = true
    map.current.setView(me, 14)
  }, [me, ready])

  // Своя точка — аватар в кружке, а не безликая точка: на карте с метками
  // ивентов сразу понятно, которая из них ты.
  useEffect(() => {
    const instance = map.current
    if (!instance || !me || !profile) return

    const avatar = renderToStaticMarkup(
      <Avatar name={profile.nickname} src={profile.avatarUrl} size={38} />,
    )

    const marker = instance.marker({
      at: me,
      html: `<span style="display:block;width:44px;height:44px;padding:3px;border-radius:999px;
                          background:#8769FF;box-shadow:0 2px 10px rgb(0 0 0 / .5)">
               ${avatar}
             </span>`,
      size: [44, 44],
      // Ниже меток ивентов: своё положение и так понятно, а чужие метки
      // важнее не закрывать.
      zIndex: -500,
    })

    return () => { marker.remove() }
  }, [me, profile?.avatarUrl, profile?.nickname, ready])

  /**
   * Заведения рядом.
   *
   * Между ивентами карта пустая, и непонятно, куда вообще идти. Слой
   * включается по кнопке, а не сам: поиск идёт через Nominatim, и дёргать
   * его при каждом движении карты нельзя — он просит не частить.
   *
   * Рейтингов и часов работы у OpenStreetMap нет, а в публичном API
   * Яндекса их не отдают. Поэтому карточка места просто ведёт в
   * Яндекс.Карты, где всё это есть, — без объяснений на экране: человеку
   * нужна кнопка, а не рассказ о том, чего в приложении не будет.
   */
  async function toggleVenues () {
    if (venues) {
      setVenues(null)
      setVenue(null)
      return
    }

    const centre = map.current?.center()
    if (!centre) return

    setLoadingVenues(true)
    toast('Ищем места рядом…')

    const found = await venuesAround(centre[0], centre[1])
    setVenues(found)
    setLoadingVenues(false)

    if (found.length === 0) toast('Рядом ничего не нашлось', 'error')
  }

  useEffect(() => {
    const instance = map.current
    if (!instance || !venues) return

    const markers = venues.map((place) => instance.marker({
      at: [place.lat, place.lng],
      // Тёмный кружок со светлым ободком: на фиолетовой карте значок без
      // обводки теряется так же, как терялись метки ивентов.
      html: `<span style="display:grid;place-items:center;width:30px;height:30px;
                          border-radius:999px;background:#120A2B;font-size:15px;
                          border:1.5px solid rgb(255 255 255 / .45);
                          box-shadow:0 3px 8px rgb(0 0 0 / .6)">
               ${placeEmoji(place.kind)}
             </span>`,
      size: [30, 30],
      zIndex: -200,
      onClick: () => { setVenue(place); setSelected(null) },
    }))

    return () => { for (const marker of markers) marker.remove() }
  }, [venues, ready])

  const shown = events.filter((event) => matchesFilters(event, filters, me))

  // Маркеры пересобираются при смене отбора (ЧТЗ 5.4).
  useEffect(() => {
    const instance = map.current
    if (!instance) return

    const markers = shown.map((event) => {
      const pin = eventPin({
        cover: event.coverUrl,
        category: event.category,
        selected: event.id === selected,
      })

      return instance.marker({
        at: [event.lat, event.lng],
        html: pin.html,
        size: pin.size,
        anchor: pin.anchor,
        // Выбранная метка поднимается над соседними, иначе её перекрывают.
        zIndex: event.id === selected ? 1000 : 0,
        onClick: () => setSelected(event.id),
      })
    })

    return () => { for (const marker of markers) marker.remove() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.map((item) => item.id).join(','), selected, ready])

  const chosen = activeFilterCount(filters)
  const event = shown.find((item) => item.id === selected)

  function showMe () {
    // Известная точка показывается сразу — нажатие не должно казаться
    // пустым. Но если она из памяти, а слежения нет, следом спрашиваем
    // заново: человек нажимает «где я», а не «где я был полчаса назад».
    if (me) map.current?.flyTo(me, 15)
    if (watching) return

    // Запрос идёт по нажатию, а не сам по себе: Safari на iPhone
    // показывает окно с вопросом охотнее в ответ на действие человека.
    toast(me ? 'Уточняем, где вы…' : 'Определяем, где вы…')

    locateMe().then((at) => {
      setMe(at)
      map.current?.flyTo(at, 15)
      // Раз доступ дали — дальше точка едет за человеком сама.
      setWatching(true)
    }).catch((trouble) => {
      toast(trouble instanceof Error ? trouble.message : 'Не удалось определить, где вы', 'error')
    })
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
          Всё, что живёт внизу карты, собрано в один столбец: кнопки, а под
          ними карточка. Раньше каждая кнопка отступала от низа на
          вычисленную вручную высоту карточки — и стоило карточке стать
          выше (длинное название, список участников), как кнопки либо
          подскакивали, либо скрывались под ней. Теперь высоту считает
          раскладка, а не я.
        */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-3
                        px-3 pb-24">
          <div className="pointer-events-auto flex items-end justify-between gap-2">
            <button
              onClick={toggleVenues} aria-label="Места рядом"
              className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-[15px]
                          font-semibold shadow-lg transition ${
                venues ? 'bg-accent text-white' : 'bg-surface text-white'}`}
            >
              {loadingVenues ? 'Ищем…' : venues ? 'Скрыть места' : 'Места рядом'}
            </button>

            {/* Кнопка «я на карте»: возвращает к своей точке, когда карту
                увели в сторону, и объясняет, если браузер не отдаёт
                геопозицию. */}
            <button
              onClick={showMe} aria-label="Моя геолокация"
              className={`grid size-12 shrink-0 place-items-center rounded-full bg-surface
                          shadow-lg transition ${me ? 'text-accent' : 'text-muted'}`}
            >
              <LocateIcon className="size-6" />
            </button>
          </div>

        {/* Карточка по нажатию на маркер: всё, по чему решают, идти или нет. */}
        {event && (
          <div className="pointer-events-auto space-y-3 rounded-card bg-surface p-3.5 shadow-2xl">
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
        {!event && !venue && shown.length === 0 && (
          <div className="pointer-events-auto rounded-card bg-surface p-4 text-center shadow-2xl">
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
          <div className="pointer-events-auto space-y-3 rounded-card bg-surface p-3.5 shadow-2xl">
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
        </div>

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
