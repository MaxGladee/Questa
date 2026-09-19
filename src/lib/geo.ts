import { isApple, isStandalone } from './device'

/** Расстояние между двумя точками по поверхности Земли, в метрах. */
export function distanceMeters (
  [lat1, lng1]: [number, number],
  [lat2, lng2]: [number, number],
): number {
  const EARTH_RADIUS = 6_371_000
  const toRad = (deg: number) => (deg * Math.PI) / 180

  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)

  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2

  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(a))
}

/** Расстояние в удобном для чтения виде. */
export function formatDistance (meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} м`
  return `${(meters / 1000).toFixed(1)} км`
}

/** Обратный отсчёт в виде «2:05». */
export function formatDuration (seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`
}

/**
 * Человеческое объяснение отказа геолокации.
 *
 * Браузер различает три причины, а приложение раньше валило их в одну и
 * говорило «разрешите доступ» даже когда доступ был разрешён.
 *
 * Совет зависит от устройства, и это не придирка: на iPhone разрешение
 * живёт сразу в двух местах — у сайта и у самого Safari в системных
 * настройках, — а в приложении с домашнего экрана адресной строки нет
 * вовсе, и совет «нажмите „аА“ в адресной строке» превращается во враньё.
 */
export function geoErrorMessage (error: GeolocationPositionError): string {
  const apple = isApple()

  if (error.code === error.PERMISSION_DENIED) {
    if (apple && isStandalone()) {
      return 'Доступ к геопозиции закрыт. Откройте Настройки телефона → '
        + 'Конфиденциальность и безопасность → Службы геолокации → Questa '
        + 'и выберите «При использовании приложения»'
    }

    if (apple) {
      return 'Доступ к геопозиции закрыт. В Safari нажмите «аА» слева в адресной строке → '
        + '«Настройки для этого веб-сайта» → Геопозиция → Разрешить. Если такого пункта нет, '
        + 'включите Настройки → Конфиденциальность → Службы геолокации → Safari'
    }

    return 'Доступ к геопозиции закрыт. Нажмите на замок слева в адресной строке '
      + 'и разрешите этому сайту геопозицию'
  }

  if (error.code === error.TIMEOUT) {
    return 'Определение затянулось. Нажмите ещё раз — в помещении это занимает дольше'
  }

  if (apple) {
    return 'Телефон не смог определить место. Проверьте, включены ли Службы геолокации '
      + '(Настройки → Конфиденциальность), и попробуйте ещё раз'
  }

  return 'Не удалось определить, где вы. Помогает выйти к окну или включить Wi-Fi'
}

/**
 * Настройки запроса положения.
 *
 * Высокая точность включается не сразу: первый ответ по вышкам и Wi-Fi
 * приходит за секунды, а спутниковый в помещении может не прийти вовсе —
 * и человек видит ошибку вместо своей точки.
 */
export const GEO_QUICK: PositionOptions = {
  enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000,
}

export const GEO_PRECISE: PositionOptions = {
  enableHighAccuracy: true, timeout: 25_000, maximumAge: 5_000,
}

/** Отказ геолокации, уже объяснённый словами. */
export class GeoTrouble extends Error {
  /** Доступ закрыт — повторять запрос бессмысленно, поможет только человек. */
  readonly denied: boolean

  constructor (message: string, denied = false) {
    super(message)
    this.name = 'GeoTrouble'
    this.denied = denied
  }
}

const FIX_KEY = 'questa.geo.fix'
const ALLOWED_KEY = 'questa.geo.allowed'

interface Fix {
  at: [number, number]
  when: number
}

// Последнее известное положение держим и в памяти: в приватном режиме
// Safari запись в хранилище бросает исключение, но в пределах сеанса точка
// всё равно пригодится.
let lastSeen: Fix | null = null

function remember (at: [number, number]) {
  lastSeen = { at, when: Date.now() }

  try {
    localStorage.setItem(FIX_KEY, JSON.stringify(lastSeen))
    localStorage.setItem(ALLOWED_KEY, '1')
  } catch { /* хранилище закрыто — переживём */ }
}

/**
 * Последнее известное положение, если оно ещё не устарело.
 *
 * Нужно, чтобы не спрашивать браузер там, где точность не важна:
 * рекомендации на главной и первый кадр карты прекрасно обходятся
 * координатами получасовой давности, зато человека не встречает окно с
 * вопросом, стоит ему открыть приложение.
 */
export function lastFix (maxAgeMs = 30 * 60_000): [number, number] | null {
  if (!lastSeen) {
    try {
      const saved = localStorage.getItem(FIX_KEY)
      if (saved) lastSeen = JSON.parse(saved) as Fix
    } catch { /* см. выше */ }
  }

  if (!lastSeen) return null
  return Date.now() - lastSeen.when <= maxAgeMs ? lastSeen.at : null
}

/**
 * Давал ли человек доступ в этом браузере хоть раз.
 *
 * Спрашивать об этом сам браузер нечем: Permissions API в Safari про
 * геопозицию не знает и на запрос отвечает ошибкой — раньше из-за этого на
 * iPhone не работала ни одна подсказка «рядом с вами». Поэтому помним
 * сами: получилось однажды — значит, можно спрашивать и без нажатия.
 */
export function everAllowed (): boolean {
  if (lastSeen) return true

  try {
    return localStorage.getItem(ALLOWED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Спросить, где человек, один раз.
 *
 * Внутри — watchPosition, а не getCurrentPosition, хотя ответ нужен один.
 * Так надёжнее: у Safari на iPhone getCurrentPosition умеет не ответить
 * вовсе — ни успехом, ни ошибкой, — а слежение отдаёт первую же точку, как
 * только она появилась, любой точности. Сразу после неё слежение снимаем.
 *
 * Высокая точность включена: на телефоне первым всё равно приходит грубый
 * ответ по вышкам и Wi-Fi, а ждать ради него спутник никто не заставляет.
 *
 * Вызывать это лучше по нажатию: Safari показывает окно с вопросом охотнее
 * в ответ на действие человека, чем само по себе при открытии экрана.
 */
export function locateMe (timeout = 12_000): Promise<[number, number]> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new GeoTrouble('Устройство не умеет определять геопозицию'))
      return
    }

    if (!window.isSecureContext) {
      reject(new GeoTrouble('Браузер отдаёт геопозицию только защищённым страницам (https)'))
      return
    }

    let done = false
    let watch = 0

    const finish = (act: () => void) => {
      if (done) return
      done = true
      clearTimeout(alarm)
      navigator.geolocation.clearWatch(watch)
      act()
    }

    /*
     * Свой будильник поверх браузерного timeout — на случай того самого
     * молчания, когда не приходит даже ошибка. Без него экран оставался бы
     * с надписью «ищем вас» навсегда. Пара секунд запаса нужна, чтобы не
     * опередить собственный ответ браузера.
     */
    const alarm = setTimeout(() => {
      finish(() => reject(new GeoTrouble(
        'Определение затянулось. Нажмите ещё раз — в помещении это занимает дольше',
      )))
    }, timeout + 2_000)

    watch = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const at: [number, number] = [coords.latitude, coords.longitude]
        finish(() => {
          remember(at)
          resolve(at)
        })
      },
      (cause) => finish(() => reject(new GeoTrouble(
        geoErrorMessage(cause), cause.code === cause.PERMISSION_DENIED,
      ))),
      { enableHighAccuracy: true, timeout, maximumAge: 30_000 },
    )

    // Если ответ пришёл прямо во время подписки, снимать было ещё нечего.
    if (done) navigator.geolocation.clearWatch(watch)
  })
}

/**
 * Следить за перемещением, пока экран открыт.
 *
 * Возвращает функцию, которой слежение прекращается. Первая же удачная
 * точка запоминается — дальше другие экраны обойдутся без вопросов.
 */
export function watchMe (
  onFix: (at: [number, number]) => void,
  onTrouble?: (trouble: GeoTrouble) => void,
  options: PositionOptions = GEO_QUICK,
): () => void {
  if (!('geolocation' in navigator)) {
    onTrouble?.(new GeoTrouble('Устройство не умеет определять геопозицию'))
    return () => {}
  }

  const watch = navigator.geolocation.watchPosition(
    ({ coords }) => {
      const at: [number, number] = [coords.latitude, coords.longitude]
      remember(at)
      onFix(at)
    },
    (cause) => onTrouble?.(new GeoTrouble(
      geoErrorMessage(cause), cause.code === cause.PERMISSION_DENIED,
    )),
    options,
  )

  return () => navigator.geolocation.clearWatch(watch)
}
