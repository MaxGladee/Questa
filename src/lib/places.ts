import type { CategoryCode } from '../data/demo'
import { distanceMeters } from './geo'

/**
 * Что есть рядом с местом встречи.
 *
 * Нужно для гео-задания: оно отправляет компанию не на само место встречи
 * (туда и так приходят, и отмечается это отдельной кнопкой), а немного в
 * сторону — к парку, памятнику, набережной. Придумать такую точку модель
 * сама не может: координаты она выдумает, а проверить их нечем. Поэтому
 * список готовится здесь, а модель только выбирает из него.
 *
 * Источник — тот же Nominatim, что и в поиске места проведения: он уже
 * работает в приложении, не требует ключа и разрешает запросы из браузера.
 */
export interface NearbyPlace {
  name: string
  /** Чем это место является, одним словом: парк, кафе, памятник. */
  kind: string
  lat: number
  lng: number
  meters: number
}

/**
 * По каким словам искать вокруг — зависит от того, чем компания занята.
 * Двух запросов достаточно: Nominatim просит не частить, а список нужен не
 * исчерпывающий, а достаточный для выбора.
 */
const KEYWORDS: Record<CategoryCode, string[]> = {
  walk: ['парк', 'памятник'],
  bar: ['бар', 'площадь'],
  party: ['кафе', 'площадь'],
  boardgames: ['кафе', 'библиотека'],
  chill: ['кафе', 'сквер'],
  sport: ['стадион', 'парк'],
  food: ['кафе', 'ресторан'],
  coffee: ['кофейня', 'сквер'],
  theatre: ['музей', 'театр'],
  music: ['памятник', 'площадь'],
  cinema: ['кинотеатр', 'кафе'],
  games: ['кафе', 'площадь'],
  art: ['музей', 'сквер'],
  quiz: ['библиотека', 'кафе'],
  nature: ['парк', 'пруд'],
  other: ['парк', 'кафе'],
}

/** Тип места из OSM — словом, понятным человеку. */
const KINDS: Record<string, string> = {
  park: 'парк', garden: 'сад', square: 'площадь', monument: 'памятник',
  memorial: 'памятник', artwork: 'скульптура', viewpoint: 'смотровая площадка',
  museum: 'музей', theatre: 'театр', library: 'библиотека', cafe: 'кафе',
  bar: 'бар', pub: 'паб', restaurant: 'ресторан', fast_food: 'кафе',
  attraction: 'достопримечательность', fountain: 'фонтан', bridge: 'мост',
  water: 'водоём', river: 'река', pond: 'пруд', playground: 'площадка',
  sports_centre: 'спортивный центр', stadium: 'стадион', pitch: 'площадка',
}

/** Ближе этого — то же самое место встречи; дальше — уже не прогулка. */
const MIN_METERS = 150
const MAX_METERS = 1500

/**
 * Места вокруг точки, от ближних к дальним.
 *
 * Отказ поиска ничего не ломает: вернётся пустой список, и гео-задание
 * останется приходом на место встречи — так было раньше и так работает
 * всегда.
 */
export async function nearbyPlaces (
  lat: number, lng: number, category: CategoryCode,
): Promise<NearbyPlace[]> {
  const words = KEYWORDS[category] ?? KEYWORDS.other

  // Рамка примерно в полтора километра: градус широты — около 111 км,
  // долгота у нас короче на косинус широты.
  const dLat = MAX_METERS / 111_000
  const dLng = dLat / Math.max(0.2, Math.cos((lat * Math.PI) / 180))
  const box = `${lng - dLng},${lat + dLat},${lng + dLng},${lat - dLat}`

  const found: NearbyPlace[] = []

  for (const word of words) {
    const request = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=12`
      + `&bounded=1&viewbox=${box}&q=${encodeURIComponent(word)}`

    try {
      const response = await fetch(request, { headers: { 'Accept-Language': 'ru' } })
      if (!response.ok) continue

      const items: unknown[] = await response.json()

      for (const item of items) {
        const place = item as {
          name?: string
          display_name?: string
          lat: string
          lon: string
          type?: string
          category?: string
        }

        const name = (place.name || place.display_name?.split(',')[0] || '').trim()
        if (!name || name.length > 60) continue

        const point: [number, number] = [Number(place.lat), Number(place.lon)]
        if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue

        const meters = Math.round(distanceMeters([lat, lng], point))
        if (meters < MIN_METERS || meters > MAX_METERS) continue
        if (found.some((other) => other.name === name)) continue

        found.push({
          name,
          kind: KINDS[place.type ?? ''] ?? KINDS[place.category ?? ''] ?? word,
          lat: point[0],
          lng: point[1],
          meters,
        })
      }
    } catch {
      // Поиск — не обязательная часть: без него задание просто останется
      // приходом на место встречи.
    }
  }

  return found.sort((a, b) => a.meters - b.meters).slice(0, 8)
}
