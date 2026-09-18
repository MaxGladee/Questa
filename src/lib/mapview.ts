import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MAP_STYLE, loadYmaps } from './ymaps'

/**
 * Карта — одна на два движка.
 *
 * Основной — JavaScript API Яндекс Карт: векторная схема, русские подписи,
 * оформление под палитру приложения (ТЗ 11.1 требует именно Яндекс).
 * Запасной — Leaflet с тайлами OpenStreetMap: он остаётся на случай, когда
 * ключа нет, библиотека не загрузилась или кончилась дневная квота. В день
 * защиты карта должна показаться при любом раскладе.
 *
 * Экраны не знают, какой движок отвечает: они работают с этим интерфейсом,
 * и в нём нарочно мало возможностей — метка, круг, линия, перелёт. Всё
 * остальное движки делают по-разному, и общий знаменатель дешевле
 * переписывания экранов под каждый.
 *
 * Координаты везде в порядке [широта, долгота] — как в остальном коде и в
 * базе. Яндекс ждёт обратного порядка, и разворот происходит здесь, в
 * одном месте.
 */
export type LatLng = [number, number]

export interface MapMarker {
  move (at: LatLng): void
  remove (): void
}

export interface MapShape {
  remove (): void
}

export interface MarkerOptions {
  at: LatLng
  /** Разметка метки: приложение рисует их само, движок только размещает. */
  html: string
  size: [number, number]
  /** Чем метка «держится» за точку: серединой или острием снизу. */
  anchor?: 'center' | 'bottom'
  zIndex?: number
  onClick?: () => void
}

export interface MapView {
  readonly engine: 'yandex' | 'osm'
  setView (at: LatLng, zoom?: number): void
  flyTo (at: LatLng, zoom?: number): void
  fitBounds (points: LatLng[]): void
  center (): LatLng
  marker (options: MarkerOptions): MapMarker
  circle (at: LatLng, radiusMeters: number): MapShape
  line (points: LatLng[]): MapShape
  onClick (handler: (at: LatLng) => void): void
  /**
   * Пересчитать размер под контейнер.
   *
   * Карта запоминает размеры окна в момент сборки. Если в этот момент
   * экран ещё выезжал анимацией или панель снизу меняла высоту, размеры
   * запоминаются неверные — и вместо карты остаётся чёрный прямоугольник
   * до первого движения. Вызов после появления экрана это лечит.
   */
  refresh (): void
  destroy (): void
}

export interface MapOptions {
  center: LatLng
  zoom: number
  /** Карта задания и предпросмотра не двигается — её только смотрят. */
  interactive?: boolean
}

const ACCENT = '#8769FF'

export async function createMapView (
  container: HTMLElement, options: MapOptions,
): Promise<MapView> {
  const api = await loadYmaps()

  // Библиотека грузится не мгновенно, и за это время экран мог успеть
  // пересобраться — тогда в контейнере остаются потроха прошлой карты.
  // Обе библиотеки на такой контейнер реагируют плохо: Leaflet отказывается
  // работать со «своим» узлом повторно, а Яндекс рисует поверх мёртвого
  // слоя чёрный прямоугольник. Поэтому перед сборкой узел очищается.
  container.innerHTML = ''
  delete (container as unknown as { _leaflet_id?: number })._leaflet_id
  if (api) {
    try {
      return yandexMap(api, container, options)
    } catch {
      // Библиотека загрузилась, но карта не собралась — не повод оставлять
      // экран пустым.
    }
  }

  return osmMap(container, options)
}

// ─────────────────────────── Яндекс ───────────────────────────

/** Круг Яндекс API не умеет — рисуем многоугольником из 64 точек. */
function circlePoints (at: LatLng, radius: number): [number, number][] {
  const [lat, lng] = at
  const dLat = radius / 111_320
  const dLng = dLat / Math.max(0.2, Math.cos((lat * Math.PI) / 180))

  return Array.from({ length: 65 }, (_, step) => {
    const angle = (step / 64) * 2 * Math.PI
    return [lng + dLng * Math.cos(angle), lat + dLat * Math.sin(angle)] as [number, number]
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function yandexMap (api: any, container: HTMLElement, options: MapOptions): MapView {
  const { YMap, YMapDefaultSchemeLayer, YMapDefaultFeaturesLayer, YMapMarker,
    YMapFeature, YMapListener } = api

  const map = new YMap(container, {
    location: { center: [options.center[1], options.center[0]], zoom: options.zoom },
    behaviors: options.interactive === false
      ? []
      : ['drag', 'pinchZoom', 'scrollZoom', 'dblClick'],
  })

  // Своё оформление — вещь необязательная: если правила не подойдут
  // библиотеке, лучше показать обычную тёмную схему, чем остаться без
  // карты вовсе.
  try {
    map.addChild(new YMapDefaultSchemeLayer({ theme: 'dark', customization: MAP_STYLE }))
  } catch {
    map.addChild(new YMapDefaultSchemeLayer({ theme: 'dark' }))
  }

  map.addChild(new YMapDefaultFeaturesLayer({}))

  // Своего геттера центра у карты нет, поэтому запоминаем его сами: он
  // нужен поиску мест вокруг.
  let centre: LatLng = options.center
  map.addChild(new YMapListener({
    layer: 'any',
    onUpdate: ({ location }: { location?: { center?: [number, number] } }) => {
      const point = location?.center
      if (point) centre = [point[1], point[0]]
    },
  }))

  return {
    engine: 'yandex',

    setView (at, zoom) {
      centre = at
      map.setLocation({ center: [at[1], at[0]], ...(zoom ? { zoom } : {}) })
    },

    flyTo (at, zoom) {
      centre = at
      map.setLocation({ center: [at[1], at[0]], ...(zoom ? { zoom } : {}), duration: 400 })
    },

    fitBounds (points) {
      if (points.length === 0) return

      const lats = points.map(([lat]) => lat)
      const lngs = points.map(([, lng]) => lng)
      // Небольшой запас по краям: иначе метки прилипают к границе экрана.
      const padLat = Math.max(0.0008, (Math.max(...lats) - Math.min(...lats)) * 0.25)
      const padLng = Math.max(0.0008, (Math.max(...lngs) - Math.min(...lngs)) * 0.25)

      map.setLocation({
        bounds: [
          [Math.min(...lngs) - padLng, Math.max(...lats) + padLat],
          [Math.max(...lngs) + padLng, Math.min(...lats) - padLat],
        ],
        duration: 300,
      })
    },

    center: () => centre,

    marker ({ at, html, size, anchor = 'center', zIndex, onClick }) {
      const element = document.createElement('div')
      element.innerHTML = html
      element.style.position = 'absolute'
      element.style.width = `${size[0]}px`
      element.style.height = `${size[1]}px`
      // Метка «висит» верхним левым углом на точке — сдвигаем её так, чтобы
      // на координаты приходилась середина или острие.
      element.style.transform = anchor === 'bottom'
        ? 'translate(-50%, -100%)'
        : 'translate(-50%, -50%)'
      if (onClick) {
        element.style.cursor = 'pointer'
        element.addEventListener('click', onClick)
      }

      const marker = new YMapMarker(
        { coordinates: [at[1], at[0]], zIndex: zIndex ?? 0 }, element,
      )
      map.addChild(marker)

      return {
        move (next) { marker.update({ coordinates: [next[1], next[0]] }) },
        remove () { map.removeChild(marker) },
      }
    },

    circle (at, radius) {
      const feature = new YMapFeature({
        geometry: { type: 'Polygon', coordinates: [circlePoints(at, radius)] },
        style: { fill: 'rgba(135, 105, 255, .18)', stroke: [{ color: ACCENT, width: 2 }] },
      })
      map.addChild(feature)
      return { remove () { map.removeChild(feature) } }
    },

    line (points) {
      const feature = new YMapFeature({
        geometry: {
          type: 'LineString',
          coordinates: points.map(([lat, lng]) => [lng, lat]),
        },
        style: { stroke: [{ color: ACCENT, width: 3, dash: [8, 8] }] },
      })
      map.addChild(feature)
      return { remove () { map.removeChild(feature) } }
    },

    onClick (handler) {
      map.addChild(new YMapListener({
        layer: 'any',
        onClick: (_: unknown, event: { coordinates?: [number, number] }) => {
          const point = event?.coordinates
          if (point) handler([point[1], point[0]])
        },
      }))
    },

    refresh () {
      try {
        map.container?.fitToViewport?.()
      } catch {
        // Метод необязательный: в старых сборках библиотеки его нет.
      }
    },

    destroy () { map.destroy() },
  }
}

// ─────────────────────── OpenStreetMap ───────────────────────

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

function osmMap (container: HTMLElement, options: MapOptions): MapView {
  const still = options.interactive === false

  const map = L.map(container, {
    zoomControl: false,
    dragging: !still,
    scrollWheelZoom: !still,
    doubleClickZoom: !still,
  }).setView(options.center, options.zoom)

  L.tileLayer(TILES, { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map)
  map.attributionControl?.setPrefix('')
  // Тёмной карта становится фильтром поверх тайлов (см. .questa-map).
  map.getContainer().classList.add('questa-map')

  return {
    engine: 'osm',
    setView (at, zoom) { map.setView(at, zoom ?? map.getZoom()) },
    flyTo (at, zoom) { map.flyTo(at, zoom ?? map.getZoom()) },
    fitBounds (points) {
      if (points.length > 0) map.fitBounds(L.latLngBounds(points).pad(0.3), { maxZoom: 17 })
    },
    center () {
      const point = map.getCenter()
      return [point.lat, point.lng]
    },

    marker ({ at, html, size, anchor = 'center', zIndex, onClick }) {
      const marker = L.marker(at, {
        icon: L.divIcon({
          className: '',
          html,
          iconSize: size,
          iconAnchor: anchor === 'bottom' ? [size[0] / 2, size[1]] : [size[0] / 2, size[1] / 2],
        }),
        zIndexOffset: zIndex ?? 0,
      }).addTo(map)

      if (onClick) marker.on('click', onClick)

      return {
        move (next) { marker.setLatLng(next) },
        remove () { marker.remove() },
      }
    },

    circle (at, radius) {
      const shape = L.circle(at, {
        radius, color: ACCENT, weight: 2, fillColor: ACCENT, fillOpacity: 0.18,
      }).addTo(map)
      return { remove () { shape.remove() } }
    },

    line (points) {
      const shape = L.polyline(points, {
        color: ACCENT, weight: 3, opacity: 0.7, dashArray: '8 8',
      }).addTo(map)
      return { remove () { shape.remove() } }
    },

    onClick (handler) {
      map.on('click', (event: L.LeafletMouseEvent) => {
        handler([event.latlng.lat, event.latlng.lng])
      })
    },

    refresh () { map.invalidateSize() },

    destroy () { map.remove() },
  }
}
