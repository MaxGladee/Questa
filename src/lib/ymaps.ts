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
 * Оформление карты под приложение.
 *
 * Схема Яндекса векторная, поэтому её цвета задаются не фильтром поверх
 * картинки, а списком правил: что закрашивать и чем. Здесь тот же тёмно-
 * фиолетовый фон, что у экранов, приглушённые дороги и подписи, которые
 * читаются, но не спорят с метками ивентов.
 *
 * Список можно заменить целиком: в Редакторе стилей Яндекса
 * (yandex.ru/maps-api/map-style-editor) карта настраивается ползунками и
 * выгружается таким же JSON.
 */
export const MAP_STYLE = [
  { tags: 'landscape', elements: 'geometry', stylers: [{ color: '#171036' }] },
  { tags: 'admin', elements: 'geometry', stylers: [{ color: '#2A2150' }] },
  { tags: 'water', elements: 'geometry', stylers: [{ color: '#101A3C' }] },
  { tags: 'park', elements: 'geometry', stylers: [{ color: '#14243A' }] },
  { tags: 'building', elements: 'geometry', stylers: [{ color: '#241B47' }] },
  { tags: 'road', elements: 'geometry', stylers: [{ color: '#2E2557' }] },
  { tags: 'road_minor', elements: 'geometry', stylers: [{ color: '#251D48' }] },
  { tags: 'transit', elements: 'geometry', stylers: [{ color: '#2A2150' }] },
  { tags: 'label', elements: 'label.text.fill', stylers: [{ color: '#C9C2E6' }] },
  { tags: 'label', elements: 'label.text.outline', stylers: [{ color: '#0F082C' }] },
  // Чужие точки интереса на карте отвлекают от меток ивентов: их значки
  // прячем, названия оставляем.
  { tags: 'poi', elements: 'label.icon', stylers: [{ visibility: 'off' }] },
]
