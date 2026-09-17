import L from 'leaflet'

/**
 * Подложка карты.
 *
 * Тёмные карты у готовых поставщиков требуют ключа — CARTO начал печатать
 * «API KEY REQUIRED» прямо поверх тайлов. Поэтому берётся обычный
 * OpenStreetMap, который открыт и ключа не просит, а тёмным он становится
 * уже в браузере: слой с тайлами инвертируется и подкрашивается (см.
 * `.questa-map` в index.css).
 *
 * Плюс такого решения не только в отсутствии ключа: нечего сломаться в день
 * показа из-за чужих изменений в условиях.
 */
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

/** Указание источника — условие бесплатного использования OpenStreetMap. */
const CREDIT = '© OpenStreetMap'

export function addMapTiles (map: L.Map): void {
  L.tileLayer(TILES, { maxZoom: 19, attribution: CREDIT }).addTo(map)

  // Рекламу самой библиотеки убираем, указание источника оставляем.
  map.attributionControl?.setPrefix('')
  map.getContainer().classList.add('questa-map')
}
