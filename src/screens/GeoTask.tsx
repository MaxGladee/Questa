import { useEffect, useRef, useState } from 'react'
import { createMapView, type MapMarker, type MapView } from '../lib/mapview'
import { Button } from '../components/ui'
import { CloseIcon, GeoTaskIcon } from '../components/icons'
import {
  GEO_PRECISE, distanceMeters, everAllowed, formatDistance, formatDuration, locateMe, watchMe,
} from '../lib/geo'
import type { QuestTask } from '../data/demo'

/**
 * Задание типа «Геолокация» (ЧТЗ 5.11.1) — вылазка.
 *
 * Это не отметка о присутствии. Присутствие отмечают на карточке ивента,
 * и означает оно «я пришёл к началу»; здесь же компания отходит от места
 * встречи к другой точке — парку, памятнику, набережной — и проводит там
 * несколько минут. Две механики раньше совпадали, и гео-задание выглядело
 * повторной отметкой: люди уже стояли в цели, задание засчитывалось само.
 *
 * Пока экран открыт, приложение следит за перемещением и показывает
 * расстояние до цели. Отсчёт идёт только внутри радиуса: вышел за круг —
 * таймер встаёт на паузу, вернулся — пошёл дальше, накопленное не сгорает.
 *
 * Ограничение, о котором важно помнить: браузер отдаёт координаты только
 * открытому приложению. Следить за телефоном в кармане с потушенным экраном
 * веб-версия не может — это умеет нативное приложение.
 */
export default function GeoTask (
  { task, target, start, onClose, onDone }: {
    task: QuestTask
    /** Координаты цели: своя точка задания либо место проведения ивента. */
    target: [number, number]
    /** Откуда идти — место встречи. Совпадает с целью у старых заданий. */
    start?: [number, number]
    onClose: () => void
    onDone: () => void
  },
) {
  const radius = task.params?.radius_meters ?? 50
  const required = task.params?.duration_seconds ?? 0
  const place = task.params?.place_name

  // Вылазка — когда цель заметно в стороне от места встречи. Если точки
  // совпадают (старое задание или вокруг ничего не нашлось), экран ведёт
  // себя как прежде и лишнего не обещает.
  const trip = Boolean(start) && distanceMeters(start!, target) > radius

  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapView | null>(null)
  const youMarker = useRef<MapMarker | null>(null)
  // Пока карта собирается, ставить на неё нечего.
  const [mapReady, setMapReady] = useState(0)

  const [position, setPosition] = useState<[number, number] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [watching, setWatching] = useState(everAllowed)
  const [asking, setAsking] = useState(false)
  const [inside, setInside] = useState(false)
  const [heldSeconds, setHeld] = useState(0)

  const distance = position ? distanceMeters(position, target) : null
  const ready = required === 0 ? inside : heldSeconds >= required

  // Карта с целевой точкой и кругом допустимого радиуса.
  useEffect(() => {
    const node = container.current
    if (!node || map.current) return

    let alive = true

    createMapView(node, { center: target, zoom: 16, interactive: false }).then((view) => {
      if (!alive) return view.destroy()
      map.current = view

      view.circle(target, radius)

      // Маршрут от места встречи к цели: без него непонятно, куда идти, —
      // на карте видна одна точка, и она может оказаться за спиной.
      if (trip && start) {
        view.marker({
          at: start,
          html: `<span style="display:block;width:14px;height:14px;border-radius:999px;
                              background:#6B7280;border:2px solid #fff"></span>`,
          size: [14, 14],
        })
        view.line([start, target])
        view.fitBounds([start, target])
      }

      setMapReady((step) => step + 1)
      requestAnimationFrame(() => view.refresh())
      setTimeout(() => { if (alive) view.refresh() }, 500)
    })

    return () => {
      alive = false
      map.current?.destroy()
      map.current = null
      youMarker.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target[0], target[1], radius, trip, start?.[0], start?.[1]])

  /*
   * Слежение за своим положением.
   *
   * Последняя известная точка здесь не годится, в отличие от карты: по ней
   * можно оказаться «на месте», не выходя из дома. Задание засчитывается
   * только по свежим координатам.
   *
   * Само слежение начинается сразу лишь у того, кто доступ уже давал. У
   * остальных — по кнопке: Safari на iPhone показывает окно с вопросом
   * охотнее в ответ на действие человека, а молчаливый отказ на открытии
   * экрана выглядел как «задание сломалось».
   */
  useEffect(() => {
    if (!watching) return

    return watchMe(
      (at) => {
        setError(null)
        setPosition(at)
      },
      (trouble) => setError(trouble.message),
      GEO_PRECISE,
    )
  }, [watching])

  async function allowGeo () {
    setAsking(true)
    setError(null)

    try {
      setPosition(await locateMe())
      setWatching(true)
    } catch (trouble) {
      setError(trouble instanceof Error ? trouble.message : 'Не удалось определить, где вы')
    } finally {
      setAsking(false)
    }
  }

  // Своя точка на карте.
  useEffect(() => {
    const instance = map.current
    if (!instance || !position) return

    if (!youMarker.current) {
      youMarker.current = instance.marker({
        at: position,
        html: `<span style="display:block;width:16px;height:16px;border-radius:999px;
                            background:#00C400;border:2px solid #fff"></span>`,
        size: [16, 16],
        zIndex: 100,
      })
    } else {
      youMarker.current.move(position)
    }

    // В кадре и человек, и цель: по одной своей точке непонятно, в ту ли
    // сторону идёшь.
    instance.fitBounds(trip && start ? [position, target, start] : [position, target])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, target[0], target[1], mapReady])

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

      {trip && (
        <p className="px-5 pb-2 text-[15px] text-accent">
          Вылазка от места встречи{place ? ` · ${place}` : ''}
        </p>
      )}

      <p className="px-5 pb-4 text-[17px] leading-snug text-white/80">{task.description}</p>

      <div ref={container} className="mx-5 min-h-0 flex-1 overflow-hidden rounded-card bg-surface" />

      <div className="flex shrink-0 flex-col gap-4 p-5 pb-[calc(1.25rem+var(--safe-bottom))]">
        {error || !watching ? (
          <div className="space-y-3 rounded-card bg-surface-2 p-4">
            <p className="text-[16px] leading-snug text-muted">
              {error ?? 'Чтобы засчитать вылазку, приложению нужно знать, где вы. '
                + 'Координаты никуда не уходят: они сравниваются с целью прямо на телефоне.'}
            </p>
            <Button onClick={allowGeo} disabled={asking}>
              {asking ? 'Определяем…' : error ? 'Попробовать снова' : 'Разрешить геопозицию'}
            </Button>
          </div>
        ) : (
          <div className="rounded-card bg-surface-2 p-5">
            <div className="flex items-center gap-3">
              <GeoTaskIcon className={`size-9 shrink-0 ${inside ? 'text-success' : 'text-muted'}`} />
              <div className="min-w-0">
                <p className="text-[19px] font-bold">
                  {distance === null ? 'Ищем вас на карте…'
                    : inside ? 'Вы на месте' : trip ? 'Идите к цели вылазки' : 'Идите к точке'}
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

        {trip && (
          <p className="text-center text-[14px] leading-snug text-muted">
            Это задание квеста, а не отметка о присутствии: отметиться на встрече
            можно кнопкой на карточке ивента.
          </p>
        )}

        <Button disabled={!ready} onClick={onDone}>
          {ready ? `Забрать +${task.qpReward} QP` : 'Задание ещё не выполнено'}
        </Button>
      </div>
    </div>
  )
}
