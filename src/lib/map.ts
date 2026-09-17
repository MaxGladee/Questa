import L from 'leaflet'

/**
 * Подложка карты. Светлая карта OpenStreetMap выбивалась из тёмного
 * приложения, поэтому берётся тёмная основа CARTO — она бесплатна и не
 * требует ключа, как и обычный OpenStreetMap.
 *
 * Поверх неё лежит лёгкий поворот цвета: тёмная карта сама по себе синевато-
 * серая, а приложение узнаётся по фиолетовому.
 */
const TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'

// Указание источника — условие бесплатного использования и OSM, и CARTO.
const CREDIT = '© OpenStreetMap, © CARTO'

export function addMapTiles (map: L.Map): void {
  L.tileLayer(TILES, { maxZoom: 20, subdomains: 'abcd', attribution: CREDIT })
    .addTo(map)

  // Рекламу самой библиотеки убираем, указание источника оставляем.
  map.attributionControl?.setPrefix('')
  map.getContainer().classList.add('questa-map')
}
