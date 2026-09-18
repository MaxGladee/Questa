import editorStyle from '../data/map-style.json'

/**
 * Загрузка JavaScript API Яндекс Карт.
 *
 * Библиотека подключается скриптом и только по требованию: на экранах без
 * карты она не нужна, а весит прилично. Ключ приходит из сборки; он
 * публичный по устройству системы — уезжает в браузер каждому, — и защищён
 * не секретностью, а ограничением по домену в кабинете разработчика.
 *
 * Ожидание ограничено по времени: если Яндекс недоступен, ключ отозван или
 * кончилась квота, приложение не должно остаться с пустым прямоугольником
 * вместо карты. Не дождались — карта соберётся на OpenStreetMap, как
 * раньше (см. mapview.ts).
 */
export const YANDEX_KEY = (import.meta.env.VITE_YANDEX_MAPS_KEY ?? '').trim()

/** Сколько ждём библиотеку, прежде чем взять запасную карту. */
const TIMEOUT = 6000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ymaps = any

let loading: Promise<Ymaps | null> | null = null

/**
 * Почему карта Яндекса не поднялась, если не поднялась.
 *
 * Молчаливый откат на OpenStreetMap — худший вид отказа: карта вроде есть,
 * а почему она не та, понять неоткуда. Причина запоминается здесь, и её
 * показывает страница самопроверки (#/health).
 */
export let mapFailure = ''

function message (cause: unknown): string {
  if (cause instanceof Error) return cause.message
  return typeof cause === 'string' ? cause : 'причина неизвестна'
}

export function loadYmaps (): Promise<Ymaps | null> {
  if (!YANDEX_KEY) {
    mapFailure = 'ключ не задан в сборке'
    return Promise.resolve(null)
  }
  if (loading) return loading

  loading = new Promise<Ymaps | null>((resolve) => {
    const done = (value: Ymaps | null, reason = '') => {
      clearTimeout(timer)
      mapFailure = value ? '' : reason
      resolve(value)
    }

    const timer = setTimeout(
      () => done(null, `библиотека не ответила за ${TIMEOUT / 1000} с`), TIMEOUT,
    )

    const ready = () => {
      const api = (window as unknown as { ymaps3?: Ymaps }).ymaps3
      if (!api) return done(null, 'скрипт загрузился, но ymaps3 не появился')

      api.ready.then(
        () => done(api),
        (cause: unknown) => done(null, `ymaps3.ready отказал: ${message(cause)}`),
      )
    }

    if ((window as unknown as { ymaps3?: Ymaps }).ymaps3) return ready()

    const script = document.createElement('script')
    // Адрес именно такой: /3.0/, а не /v3/. По второму приходит 404, скрипт
    // молча не грузится, и карта уходит на запасной движок.
    script.src = `https://api-maps.yandex.ru/3.0/?apikey=${encodeURIComponent(YANDEX_KEY)}`
      + '&lang=ru_RU'
    script.async = true
    script.onload = ready
    script.onerror = () => done(null, 'скрипт не загрузился: проверьте ключ и ограничение по домену')
    document.head.appendChild(script)
  })

  return loading
}

/**
 * Оформление карты.
 *
 * Схема Яндекса векторная, поэтому её цвета задаются не фильтром поверх
 * картинки, а списком правил. Основной список — `src/data/map-style.json`,
 * выгрузка из Редактора стилей Яндекса
 * (yandex.ru/maps-api/map-style-editor): там карта настраивается
 * ползунками и сохраняется таким же JSON. Чтобы поставить новую версию,
 * достаточно заменить файл.
 *
 * Рядом остался прежний, написанный руками набор правил — на случай, если
 * с выгрузкой что-то не так и нужно быстро вернуться к рабочему виду.
 * Переключение — одним словом ниже.
 */
/** Откуда брать оформление: 'editor' — файл из Редактора, 'simple' — набор ниже. */
const STYLE_SOURCE: 'editor' | 'simple' = 'editor'

/**
 * Прополка подписей поверх выбранного оформления.
 *
 * На экране телефона город умещается целиком, и Яндекс подписывает на нём
 * всё подряд: каждый переулок, каждую станцию, каждое кафе. За подписями
 * перестают читаться метки ивентов, а они здесь главное. Правила идут
 * последними и поэтому перекрывают то, что задано выше.
 *
 * Не нравится — поставьте false, и подписи вернутся все.
 */
const QUIET_LABELS = true

type Rule = Record<string, unknown>

const QUIET: Rule[] = [
  { tags: 'road_minor', elements: 'label', stylers: [{ visibility: 'off' }] },
  { tags: 'poi', elements: 'label', stylers: [{ visibility: 'off' }] },
  { tags: 'transit', elements: 'label', stylers: [{ visibility: 'off' }] },
  { tags: 'transit_location', elements: 'label', stylers: [{ visibility: 'off' }] },
  { tags: 'address', elements: 'label', stylers: [{ visibility: 'off' }] },
  { tags: 'entrance', elements: 'label', stylers: [{ visibility: 'off' }] },
  { tags: 'building', elements: 'label', stylers: [{ visibility: 'off' }] },
]

/** Запасное оформление: то, что было до Редактора стилей. */
const SIMPLE_STYLE: Rule[] = [
  { tags: 'landscape', elements: 'geometry', stylers: [{ color: '#120A2B' }] },
  { tags: 'land', elements: 'geometry', stylers: [{ color: '#120A2B' }] },
  { tags: 'water', elements: 'geometry', stylers: [{ color: '#0A1747' }] },
  { tags: 'vegetation', elements: 'geometry', stylers: [{ color: '#123526' }] },
  { tags: 'park', elements: 'geometry', stylers: [{ color: '#123526' }] },
  { tags: 'building', elements: 'geometry', stylers: [{ color: '#241B4B' }] },
  { tags: 'road', elements: 'geometry', stylers: [{ color: '#5B4E9C' }] },
  { tags: 'road_minor', elements: 'geometry', stylers: [{ color: '#3B3070' }] },
  { tags: 'transit', elements: 'geometry', stylers: [{ color: '#2A2150' }] },
  { tags: 'admin', elements: 'geometry', stylers: [{ color: '#2A2150' }] },
  { tags: 'label', elements: 'label.text.fill', stylers: [{ color: '#E2DCFA' }] },
  { tags: 'label', elements: 'label.text.outline', stylers: [{ color: '#0B0522' }] },
]

export const MAP_STYLE: Rule[] = [
  ...(STYLE_SOURCE === 'editor' ? (editorStyle as Rule[]) : SIMPLE_STYLE),
  ...(QUIET_LABELS ? QUIET : []),
]
