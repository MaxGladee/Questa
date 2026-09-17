import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { addMapTiles, eventPin } from '../lib/map'
import { Button, Field, useAutofillGuard } from '../components/ui'
import { CloseIcon, PinIcon, SearchIcon } from '../components/icons'
import { VENUES, type Venue } from '../data/venues'
import { reverseGeocode } from '../lib/api'
import { distanceMeters, formatDistance } from '../lib/geo'

const CITY_CENTER: [number, number] = [56.8389, 60.6057]

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
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const marker = useRef<L.Marker | null>(null)

  const [point, setPoint] = useState<[number, number]>(
    initial ? [initial.lat, initial.lng] : CITY_CENTER,
  )
  const [address, setAddress] = useState(initial?.address ?? '')
  const [me, setMe] = useState<[number, number] | null>(null)
  const [query, setQuery] = useState('')
  const [lookingUp, setLookingUp] = useState(false)
  const guard = useAutofillGuard()

  const pin = eventPin({ category: 'other' })

  useEffect(() => {
    if (!container.current || map.current) return

    map.current = L.map(container.current, { zoomControl: false })
      .setView(point, 14)

    addMapTiles(map.current)

    marker.current = L.marker(point, { icon: pin }).addTo(map.current)

    // Тап по карте ставит точку и подтягивает адрес.
    map.current.on('click', async (event: L.LeafletMouseEvent) => {
      const next: [number, number] = [event.latlng.lat, event.latlng.lng]
      setPoint(next)
      marker.current?.setLatLng(next)
      setLookingUp(true)
      setAddress(await reverseGeocode(next[0], next[1]))
      setLookingUp(false)
    })

    return () => { map.current?.remove(); map.current = null }
  }, [])

  useEffect(() => {
    if (!('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setMe([coords.latitude, coords.longitude]),
      () => {},
      { enableHighAccuracy: true, timeout: 15_000 },
    )
  }, [])

  function choose (place: Venue) {
    const next: [number, number] = [place.lat, place.lng]
    setPoint(next)
    setAddress(`${place.title}, ${place.address}`)
    marker.current?.setLatLng(next)
    map.current?.setView(next, 16)
  }

  async function useMyLocation () {
    if (!me) return
    setPoint(me)
    marker.current?.setLatLng(me)
    map.current?.setView(me, 16)
    setLookingUp(true)
    setAddress(await reverseGeocode(me[0], me[1]))
    setLookingUp(false)
  }

  const shown = VENUES.filter((venue) =>
    venue.title.toLowerCase().includes(query.trim().toLowerCase()))

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
        {me && (
          <button
            onClick={useMyLocation}
            className="flex w-full items-center gap-3 rounded-card bg-surface-3 p-3.5 text-left"
          >
            <PinIcon className="size-6 shrink-0 text-accent" />
            <span className="flex-1 text-[16px] font-semibold">Я сейчас здесь</span>
          </button>
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

        {shown.map((venue) => {
          const away = me ? distanceMeters(me, [venue.lat, venue.lng]) : null
          return (
            <button
              key={venue.title} onClick={() => choose(venue)}
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
