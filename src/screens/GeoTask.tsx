import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { addMapTiles } from '../lib/map'
import { Button } from '../components/ui'
import { CloseIcon, GeoTaskIcon } from '../components/icons'
import { GEO_PRECISE, distanceMeters, formatDistance, formatDuration, geoErrorMessage } from '../lib/geo'
import type { QuestTask } from '../data/demo'

/**
 * Задание типа «Геолокация» (ЧТЗ 5.11.1).
 *
 * Пока экран открыт, приложение следит за перемещением и показывает
 * расстояние до цели. Если у задания задана длительность, отсчёт идёт только
 * внутри радиуса: вышел за круг — таймер встаёт на паузу, вернулся — пошёл
 * дальше, накопленное не сгорает.
 *
 * Ограничение, о котором важно помнить: браузер отдаёт координаты только
 * открытому приложению. Следить за телефоном в кармане с потушенным экраном
 * веб-версия не может — это умеет нативное приложение.
 */
export default function GeoTask (
  { task, target, onClose, onDone }: {
    task: QuestTask
    /** Координаты цели: своя точка задания либо место проведения ивента. */
    target: [number, number]
    onClose: () => void
    onDone: () => void
  },
) {
  const radius = task.params?.radius_meters ?? 50
  const required = task.params?.duration_seconds ?? 0

  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const youMarker = useRef<L.CircleMarker | null>(null)

  const [position, setPosition] = useState<[number, number] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [inside, setInside] = useState(false)
  const [heldSeconds, setHeld] = useState(0)

  const distance = position ? distanceMeters(position, target) : null
  const ready = required === 0 ? inside : heldSeconds >= required

  // Карта с целевой точкой и кругом допустимого радиуса.
  useEffect(() => {
    if (!container.current || map.current) return

    map.current = L.map(container.current, {
      zoomControl: false, dragging: false,
      scrollWheelZoom: false, doubleClickZoom: false,
    }).setView(target, 16)

    addMapTiles(map.current)

    L.circle(target, {
      radius, color: '#8769FF', weight: 2, fillColor: '#8769FF', fillOpacity: 0.18,
    }).addTo(map.current)

    return () => { map.current?.remove(); map.current = null }
  }, [target[0], target[1], radius])

  // Слежение за своим положением.
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      return setError('Устройство не умеет определять местоположение')
    }

    const watch = navigator.geolocation.watchPosition(
      ({ coords }) => {
        setError(null)
        setPosition([coords.latitude, coords.longitude])
      },
      (cause) => setError(geoErrorMessage(cause)),
      GEO_PRECISE,
    )

    return () => navigator.geolocation.clearWatch(watch)
  }, [])

  // Своя точка на карте.
  useEffect(() => {
    if (!map.current || !position) return

    if (!youMarker.current) {
      youMarker.current = L.circleMarker(position, {
        radius: 8, color: '#fff', weight: 2, fillColor: '#00C400', fillOpacity: 1,
      }).addTo(map.current)
    } else {
      youMarker.current.setLatLng(position)
    }

    map.current.fitBounds(L.latLngBounds([position, target]).pad(0.4), { maxZoom: 17 })
  }, [position, target[0], target[1]])

  useEffect(() => {
    setInside(distance !== null && distance <= radius)
  }, [distance, radius])

  // Отсчёт идёт только внутри круга (ЧТЗ 5.11.1, параметр duration_seconds).
  useEffect(() => {
    if (!inside || required === 0 || heldSeconds >= required) return
    const timer = setInterval(() => setHeld((held) => held + 1), 1000)
    return () => clearInterval(timer)
  }, [inside, required, heldSeconds])

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-bg">
      <header className="flex items-center justify-between gap-3 px-5 pb-3 pt-4">
        <h2 className="min-w-0 flex-1 truncate text-[22px] font-extrabold">{task.title}</h2>
        <button onClick={onClose} aria-label="Закрыть"><CloseIcon className="size-7" /></button>
      </header>

      <p className="px-5 pb-4 text-[17px] leading-snug text-white/80">{task.description}</p>

      <div ref={container} className="mx-5 min-h-0 flex-1 overflow-hidden rounded-card bg-surface" />

      <div className="flex shrink-0 flex-col gap-4 p-5">
        {error ? (
          <p className="rounded-card bg-surface-2 p-4 text-[16px] leading-snug text-muted">
            {error}
          </p>
        ) : (
          <div className="rounded-card bg-surface-2 p-5">
            <div className="flex items-center gap-3">
              <GeoTaskIcon className={`size-9 shrink-0 ${inside ? 'text-success' : 'text-muted'}`} />
              <div className="min-w-0">
                <p className="text-[19px] font-bold">
                  {distance === null ? 'Ищем вас на карте…'
                    : inside ? 'Вы на месте' : 'Идите к точке'}
                </p>
                <p className="text-[16px] text-muted">
                  {distance === null
                    ? 'Это занимает пару секунд'
                    : `До цели ${formatDistance(distance)} · радиус ${radius} м`}
                </p>
              </div>
            </div>

            {required > 0 && (
              <div className="mt-4 border-t border-white/10 pt-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-[16px] text-muted">Нужно пробыть на месте</span>
                  <span className="text-[22px] font-extrabold tabular-nums">
                    {formatDuration(Math.max(0, required - heldSeconds))}
                  </span>
                </div>
                <p className="mt-2 text-[14px] leading-snug text-muted">
                  {inside
                    ? 'Отсчёт идёт. Не закрывайте приложение — иначе он встанет на паузу.'
                    : 'Отсчёт на паузе: вернитесь в круг, и он продолжится.'}
                </p>
              </div>
            )}
          </div>
        )}

        <Button disabled={!ready} onClick={onDone}>
          {ready ? `Забрать +${task.qpReward} QP` : 'Задание ещё не выполнено'}
        </Button>
      </div>
    </div>
  )
}
