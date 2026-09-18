import { YANDEX_KEY } from './ymaps'

/**
 * Геокодер Яндекса: адрес → координаты и обратно.
 *
 * Тот же ключ, что у карты (в кабинете разработчика к нему подключены оба
 * продукта). ТЗ 11.1 требует именно его, и по делу: русские адреса он
 * разбирает заметно лучше открытого Nominatim — понимает сокращения,
 * находит места по названию, не путает города.
 *
 * Все функции возвращают null, если ключа нет или запрос не удался.
 * Вызывающий код в этом случае берёт Nominatim, как раньше: карта и поиск
 * места должны работать даже когда Яндекс недоступен или кончилась квота.
 */
export interface GeoPlace {
  title: string
  address: string
  lat: number
  lng: number
}

const ENDPOINT = 'https://geocode-maps.yandex.ru/v1/'

interface YandexObject {
  name?: string
  description?: string
  Point?: { pos?: string }
  metaDataProperty?: { GeocoderMetaData?: { text?: string } }
}

/** Разбор ответа: у Яндекса координаты идут строкой «долгота широта». */
function toPlaces (payload: unknown): GeoPlace[] {
  const found = (payload as {
    response?: { GeoObjectCollection?: { featureMember?: { GeoObject?: YandexObject }[] } }
  })?.response?.GeoObjectCollection?.featureMember ?? []

  return found.flatMap(({ GeoObject: place }) => {
    const pos = place?.Point?.pos?.split(' ')
    if (!pos || pos.length !== 2) return []

    const lng = Number(pos[0])
    const lat = Number(pos[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return []

    const full = place?.metaDataProperty?.GeocoderMetaData?.text ?? ''

    return [{
      title: place?.name || full.split(',').slice(-2).join(',').trim() || 'Место',
      // Описание у Яндекса — это «город, район»; вместе с названием
      // получается строка, по которой место узнаётся.
      address: place?.description || full,
      lat,
      lng,
    }]
  })
}

async function ask (params: Record<string, string>): Promise<GeoPlace[] | null> {
  if (!YANDEX_KEY) return null

  const query = new URLSearchParams({
    apikey: YANDEX_KEY, format: 'json', lang: 'ru_RU', ...params,
  })

  try {
    const response = await fetch(`${ENDPOINT}?${query}`)
    if (!response.ok) return null
    return toPlaces(await response.json())
  } catch {
    // Сеть, CORS, отозванный ключ — всё это повод взять запасной геокодер,
    // а не показать человеку ошибку.
    return null
  }
}

/** Поиск места по тексту. Город добавляется к запросу вызывающим кодом. */
export function findPlaces (text: string, limit = 6): Promise<GeoPlace[] | null> {
  return ask({ geocode: text, results: String(limit) })
}

/** Координаты → адрес. */
export async function describePoint (lat: number, lng: number): Promise<string | null> {
  const places = await ask({ geocode: `${lng},${lat}`, results: '1', kind: 'house' })
  if (!places) return null

  const first = places[0]
  if (!first) return ''

  // Для точки на карте нужен именно адрес, а не название района.
  return [first.title, first.address].filter(Boolean)[0] ?? ''
}
