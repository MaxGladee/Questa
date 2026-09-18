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
 * говорило «разрешите доступ» даже когда доступ был разрешён — так было в
 * Safari на iPhone, где запрос чаще всего просто не успевает ответить в
 * помещении. Совет в таком случае нужен совсем другой.
 */
export function geoErrorMessage (error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return 'Доступ к геопозиции закрыт. Разрешите его для этого сайта: '
      + 'в Safari — «аА» в адресной строке → Настройки для этого веб-сайта → Геопозиция'
  }

  if (error.code === error.TIMEOUT) {
    return 'Определение затянулось. Нажмите ещё раз — в помещении это занимает дольше'
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
  enableHighAccuracy: false, timeout: 20_000, maximumAge: 60_000,
}

export const GEO_PRECISE: PositionOptions = {
  enableHighAccuracy: true, timeout: 25_000, maximumAge: 5_000,
}
