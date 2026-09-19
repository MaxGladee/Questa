import { useEffect, useRef, useState } from 'react'
import { eventPin } from '../lib/map'
import { createMapView, type MapMarker, type MapView } from '../lib/mapview'
import { Button, Field, useAutofillGuard } from '../components/ui'
import { CloseIcon, PinIcon, SearchIcon } from '../components/icons'
import { venuesFor, type Venue } from '../data/venues'
import { cityCenter } from '../data/cities'
import { reverseGeocode, searchPlaces } from '../lib/api'
import { distanceMeters, everAllowed, formatDistance, lastFix, locateMe } from '../lib/geo'
import { useAuth } from '../lib/auth'

/**
 * Выбор места для ивента. Три пути к одному результату: известное место из
 * списка, своя геопозиция или точка на карте — в последних двух случаях
 * адрес подставляется сам по координатам.
 */
export default function LocationPicker (
  { initial, onClose, onPick }: {
    initial?: { address: string; lat: number; lng: number }
    onClose: () => void
    onPick: (place: { address: string; lat: number; lng: number }) => void
  },
) {
  const { profile } = useAuth()
  const city = profile?.city || null
  const center = cityCenter(city)

  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapView | null>(null)
  const marker = useRef<MapMarker | null>(null)
  const myMarker = useRef<MapMarker | null>(null)
  // Карта готова не сразу: библиотеку ещё нужно загрузить.
  const [ready, setReady] = useState(0)
  /** Карту к своей геопозиции подводим один раз: дальше её ведёт человек. */
  const centeredOnMe = useRef(false)

  const [point, setPoint] = useState<[number, number]>(
    initial ? [initial.lat, initial.lng] : center,
  )
  const [address, setAddress] = useState(initial?.address ?? '')
  const [me, setMe] = useState<[number, number] | null>(null)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Venue[]>([])
  const [searching, setSearching] = useState(false)
  const [lookingUp, setLookingUp] = useState(false)
  const [geoNote, setGeoNote] = useState('')
  const guard = useAutofillGuard()

  const nearby = venuesFor(city)

  const pin = eventPin({ category: 'other' })

  useEffect(() => {
    const node = container.current
    if (!node || map.current) return

    let alive = true

    createMapView(node, { center: point, zoom: 14 }).then((view) => {
      if (!alive) return view.destroy()

      map.current = view
      marker.current = view.marker({
        at: point, html: pin.html, size: pin.size, anchor: pin.anchor,
      })

      // Тап по карте ставит точку и подтягивает адрес.
      view.onClick(async (next) => {
        setPoint(next)
        marker.current?.move(next)
        setLookingUp(true)
        setAddress(await reverseGeocode(next[0], next[1]))
        setLookingUp(false)
      })

      setReady((step) => step + 1)
      requestAnimationFrame(() => view.refresh())
      setTimeout(() => { if (alive) view.refresh() }, 500)
    })

    return () => {
      alive = false
      map.current?.destroy()
      map.current = null
      marker.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Сами ни о чём не спрашиваем: место встречи человек всё равно выбирает
  // руками, а окно с вопросом при открытии экрана только мешает. Берём
  // последнюю известную точку, а у тех, кто доступ уже давал, — свежую.
  useEffect(() => {
    const known = lastFix(10 * 60_000)
    if (known) {
      setMe(known)
      return
    }

    if (!everAllowed()) return
    locateMe().then(setMe).catch(() => {})
  }, [])

  // Своя точка на карте выбора места: от неё считаются расстояния до мест,
  // и по ней видно, что рядом. Место ивента человек ставит сам, поэтому
  // карту подводим к себе только если точка ещё не выбрана заранее.
  useEffect(() => {
    const instance = map.current
    if (!instance || !me) return

    myMarker.current?.remove()
    myMarker.current = instance.marker({
      at: me,
      html: `<span style="display:block;width:16px;height:16px;border-radius:999px;
                          background:#8769FF;border:3px solid #fff;
                          box-shadow:0 0 0 6px rgb(135 105 255 / .25)"></span>`,
      size: [16, 16],
      zIndex: -500,
    })

    if (!initial && !centeredOnMe.current) {
      centeredOnMe.current = true
      instance.setView(me, 15)
    }

    return () => { myMarker.current?.remove(); myMarker.current = null }
  }, [me, initial, ready])

  // Поиск по карте: то, чего нет в подборке города. Запрос уходит не сразу,
  // а через паузу — иначе на каждую букву уходил бы отдельный запрос.
  useEffect(() => {
    const text = query.trim()
    if (text.length < 3) { setFound([]); setSearching(false); return }

    setSearching(true)
    let cancelled = false
    const timer = setTimeout(() => {
      searchPlaces(text, city).then((places) => {
        if (cancelled) return
        setFound(places)
        setSearching(false)
      })
    }, 600)

    return () => { cancelled = true; clearTimeout(timer) }
  }, [query, city])

  function choose (place: Venue) {
    const next: [number, number] = [place.lat, place.lng]
    setPoint(next)
    setAddress(`${place.title}, ${place.address}`)
    marker.current?.move(next)
    map.current?.setView(next, 16)
  }

  /**
   * «Я сейчас здесь» — место встречи там, где человек стоит.
   *
   * Координаты спрашиваются заново, даже если точка уже есть: последняя
   * известная годится, чтобы нарисовать кружок на карте, но не чтобы
   * назначить по ней встречу. И это нажатие — лучший момент, чтобы Safari
   * на iPhone показал своё окно с вопросом.
   */
  async function useMyLocation () {
    setGeoNote('')
    setLookingUp(true)

    try {
      const at = await locateMe()
      setMe(at)
      setPoint(at)
      marker.current?.move(at)
      map.current?.setView(at, 16)
      setAddress(await reverseGeocode(at[0], at[1]))
    } catch (trouble) {
      setGeoNote(trouble instanceof Error ? trouble.message : 'Не удалось определить, где вы')
    } finally {
      setLookingUp(false)
    }
  }

  const text = query.trim().toLowerCase()
  const matched = nearby.filter((venue) => venue.title.toLowerCase().includes(text))
  // Найденное по карте показываем следом за своими местами, без повторов.
  const shown = [
    ...matched,
    ...found.filter((place) => !matched.some((venue) => venue.title === place.title)),
  ]

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-bg">
      <header className="flex items-center gap-3 px-5 pb-3 pt-4">
        <h2 className="flex-1 text-[21px] font-extrabold">Где встречаемся</h2>
        <button onClick={onClose} aria-label="Закрыть"><CloseIcon className="size-7" /></button>
      </header>

      <div ref={container} className="mx-5 h-52 shrink-0 overflow-hidden rounded-card bg-surface" />

      <p className="px-5 pt-2 text-[13px] text-muted">
        Нажмите на карту, чтобы поставить точку вручную
      </p>

      <div className="no-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pt-3">
        {/* Кнопка стоит всегда, а не только когда положение уже известно:
            раньше на iPhone она просто не появлялась — Safari не отдаёт
            координаты без спроса, а спросить было нечем. */}
        <button
          onClick={useMyLocation} disabled={lookingUp}
          className="flex w-full items-center gap-3 rounded-card bg-surface-3 p-3.5 text-left"
        >
          <PinIcon className="size-6 shrink-0 text-accent" />
          <span className="flex-1 text-[16px] font-semibold">
            {lookingUp ? 'Определяем, где вы…' : 'Я сейчас здесь'}
          </span>
        </button>

        {geoNote && (
          <p className="rounded-card bg-surface-2 p-3.5 text-[15px] leading-snug text-muted">
            {geoNote}
          </p>
        )}

        <label className="flex items-center gap-2 rounded-field bg-field px-4 py-3">
          <SearchIcon className="size-5 shrink-0 text-muted" />
          <input
            {...guard} type="search" name="venue-search"
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти место" aria-label="Найти место"
            className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted"
          />
        </label>

        {searching && (
          <p className="px-1 text-[14px] text-muted">Ищем места по карте…</p>
        )}

        {!searching && shown.length === 0 && (
          <p className="px-1 text-[14px] leading-snug text-muted">
            {text.length < 3
              ? `Для города «${city ?? 'не выбран'}» готовой подборки нет — найдите место по названию или нажмите на карту`
              : 'Ничего не нашли. Попробуйте другое название или поставьте точку на карте'}
          </p>
        )}

        {shown.map((venue) => {
          const away = me ? distanceMeters(me, [venue.lat, venue.lng]) : null
          return (
            <button
              key={`${venue.title}:${venue.lat}`} onClick={() => choose(venue)}
              className="flex w-full items-center gap-3 rounded-card bg-surface-2 p-3.5 text-left"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-chip text-xl">
                {venue.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-semibold">{venue.title}</span>
                <span className="block truncate text-[14px] text-muted">{venue.address}</span>
              </span>
              {away !== null && (
                <span className="shrink-0 text-[14px] text-muted">{formatDistance(away)}</span>
              )}
            </button>
          )
        })}
      </div>

      <div className="shrink-0 space-y-3 p-5">
        <Field
          placeholder={lookingUp ? 'Определяем адрес…' : 'Адрес'}
          value={address} onChange={(e) => setAddress(e.target.value)}
        />
        <Button
          disabled={!address.trim()}
          onClick={() => onPick({ address: address.trim(), lat: point[0], lng: point[1] })}
        >
          Выбрать это место
        </Button>
      </div>
    </div>
  )
}
