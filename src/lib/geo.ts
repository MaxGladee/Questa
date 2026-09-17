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
