import L from 'leaflet'
import { categoryArt } from '../data/category-art'
import type { CategoryCode } from '../data/demo'

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

/**
 * Метка ивента — «капля» из макетов вместо кружка.
 *
 * Дело не только во внешности: у кружка точкой считался его центр, и метка
 * закрывала собой место, на которое указывала. У капли острие приходится
 * ровно на координаты ивента, поэтому она показывает место точнее.
 *
 * В головке капли — обложка ивента: по карте сразу видно, куда зовут, а не
 * только к какой категории это отнесли. Если обложку не загрузили, вместо
 * неё знак категории на её цветах.
 */
export function eventPin (
  { cover, category, selected = false }:
  { cover?: string; category: CategoryCode; selected?: boolean },
): L.DivIcon {
  const w = selected ? 46 : 36
  const h = selected ? 60 : 47
  const art = categoryArt(category)

  // Головка капли: обложка или знак категории на её градиенте.
  const inner = cover
    ? `<img src="${cover}" alt="" style="width:100%;height:100%;object-fit:cover">`
    : `<span style="display:grid;place-items:center;width:100%;height:100%;
                    background:linear-gradient(135deg,${art.from},${art.to});
                    font-size:${selected ? 15 : 12}px">${art.emoji}</span>`

  const head = selected ? 25 : 19.5
  const html = `
    <span style="position:relative;display:block;width:${w}px;height:${h}px;
                 filter:drop-shadow(0 3px 6px rgb(0 0 0 / .55))">
      <svg width="${w}" height="${h}" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg">
        <path d="M17 43C17 43 33 25.5 33 17A16 16 0 1 0 1 17C1 25.5 17 43 17 43Z"
              fill="#8769FF"${selected ? ' stroke="#fff" stroke-width="1.5"' : ''}/>
      </svg>
      <span style="position:absolute;left:50%;top:${selected ? 5 : 4}px;
                   transform:translateX(-50%);width:${head}px;height:${head}px;
                   border-radius:999px;overflow:hidden;display:block">${inner}</span>
    </span>`

  return L.divIcon({
    className: '',
    html,
    iconSize: [w, h],
    // Острие капли, а не её середина: именно оно указывает на место.
    iconAnchor: [w / 2, h],
    popupAnchor: [0, -h],
  })
}
