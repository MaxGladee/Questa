import { YANDEX_KEY } from './ymaps'
import { distanceMeters } from './geo'
import type { NearbyPlace } from './places'

/**
 * Справочник организаций Яндекса — заведения вокруг точки.
 *
 * Отдельный продукт того же ключа («Поиск по организациям»): бесплатно до
 * 500 запросов в сутки. От геокодера отличается тем, что ищет не адреса, а
 * заведения, и знает про них то, чего нет в OpenStreetMap, — рубрику, часы
 * работы, сайт.
 *
 * Рейтинга в ответе нет: в публичном API Яндекс его не отдаёт, он виден
 * только в самих Картах. Поэтому карточка места ведёт туда ссылкой —
 * рисовать свои звёзды было бы обманом.
 *
 * Условие бесплатного использования: выдачу показывают на карте Яндекса и
 * не хранят. Поэтому этот источник работает только для живого слоя на
 * карте; цель гео-задания, которая уходит в базу вместе с заданием,
 * по-прежнему ищется в OpenStreetMap.
 */
const ENDPOINT = 'https://search-maps.yandex.ru/v1/'

/** Два запроса на включение слоя: заведения и зелёные места. */
const TOPICS = ['кафе', 'парк']

/** Насколько широкую область просим: примерно полтора километра. */
const SPAN = '0.030,0.016'

interface Feature {
  geometry?: { coordinates?: [number, number] }
  properties?: {
    name?: string
    description?: string
    CompanyMetaData?: {
      name?: string
      url?: string
      Categories?: { name?: string }[]
      Hours?: { text?: string }
    }
  }
}

async function search (topic: string, lat: number, lng: number): Promise<NearbyPlace[] | null> {
  const query = new URLSearchParams({
    apikey: YANDEX_KEY,
    text: topic,
    lang: 'ru_RU',
    ll: `${lng},${lat}`,
    spn: SPAN,
    rspn: '1',                 // не искать за пределами области
    type: 'biz',
    results: '20',
    format: 'json',
  })

  try {
    const response = await fetch(`${ENDPOINT}?${query}`)
    if (!response.ok) return null

    const payload = await response.json() as { features?: Feature[] }

    return (payload.features ?? []).flatMap((feature) => {
      const point = feature.geometry?.coordinates
      const company = feature.properties?.CompanyMetaData
      const name = company?.name ?? feature.properties?.name

      if (!point || point.length !== 2 || !name) return []

      const at: [number, number] = [point[1], point[0]]

      return [{
        name,
        kind: (company?.Categories?.[0]?.name ?? 'место').toLowerCase(),
        lat: at[0],
        lng: at[1],
        meters: Math.round(distanceMeters([lat, lng], at)),
        hours: company?.Hours?.text,
        url: company?.url,
        source: 'yandex' as const,
      }]
    })
  } catch {
    return null
  }
}

export async function organizationsAround (
  lat: number, lng: number,
): Promise<NearbyPlace[] | null> {
  if (!YANDEX_KEY) return null

  const answers = await Promise.all(TOPICS.map((topic) => search(topic, lat, lng)))
  // Ни один запрос не прошёл — продукт не подключён к ключу или кончилась
  // суточная норма. Тогда пусть работает прежний поиск.
  if (answers.every((answer) => answer === null)) return null

  const found: NearbyPlace[] = []
  for (const answer of answers) {
    for (const place of answer ?? []) {
      if (!found.some((other) => other.name === place.name)) found.push(place)
    }
  }

  return found.sort((a, b) => a.meters - b.meters).slice(0, 20)
}
