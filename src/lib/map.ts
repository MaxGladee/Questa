import { categoryArt } from '../data/category-art'
import type { CategoryCode } from '../data/demo'

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
 *
 * Отдельная забота — чтобы метку было видно. Карта у нас фиолетовая, и
 * фиолетовая капля на ней читалась как часть подложки: те же цвета, та же
 * яркость. Поэтому метка отделена от карты тремя способами сразу — белой
 * обводкой по контуру, тенью под остриём и светлым верхом заливки. Каждый
 * по отдельности слабоват, вместе метка «лежит поверх» карты, а не в ней.
 */
export function eventPin (
  { cover, category, selected = false }:
  { cover?: string; category: CategoryCode; selected?: boolean },
): { html: string; size: [number, number]; anchor: 'bottom' } {
  const w = selected ? 48 : 38
  const h = selected ? 63 : 50
  const art = categoryArt(category)

  // Головка капли: обложка или знак категории на её градиенте.
  const inner = cover
    ? `<img src="${cover}" alt="" style="width:100%;height:100%;object-fit:cover">`
    : `<span style="display:grid;place-items:center;width:100%;height:100%;
                    background:linear-gradient(135deg,${art.from},${art.to});
                    font-size:${selected ? 15 : 12}px">${art.emoji}</span>`

  const head = selected ? 25 : 19.5
  // Уникальный номер нужен ссылкам внутри svg: меток на карте много, и с
  // одинаковыми идентификаторами все они взяли бы градиент первой.
  const id = Math.random().toString(36).slice(2, 8)

  const html = `
    <span style="position:relative;display:block;width:${w}px;height:${h}px;
                 filter:drop-shadow(0 4px 7px rgb(0 0 0 / .6))">
      <svg width="${w}" height="${h}" viewBox="0 0 36 47" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="pin-${id}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#A78FFF"/>
            <stop offset="1" stop-color="#6A4BE0"/>
          </linearGradient>
        </defs>

        <!-- Тень на земле: без неё капля кажется нарисованной на карте,
             а не стоящей на ней. -->
        <ellipse cx="18" cy="44.5" rx="5.5" ry="2" fill="rgb(0 0 0 / .45)"/>

        <path d="M18 43.5C18 43.5 33.5 26 33.5 17.5A15.5 15.5 0 1 0 2.5 17.5C2.5 26 18 43.5 18 43.5Z"
              fill="url(#pin-${id})"
              stroke="${selected ? '#FFFFFF' : 'rgb(255 255 255 / .85)'}"
              stroke-width="${selected ? 2.2 : 1.8}"/>
      </svg>

      <span style="position:absolute;left:50%;top:${selected ? 6 : 5}px;
                   transform:translateX(-50%);width:${head}px;height:${head}px;
                   border-radius:999px;overflow:hidden;display:block;
                   box-shadow:inset 0 0 0 1px rgb(0 0 0 / .25)">${inner}</span>
    </span>`

  // Острие капли, а не её середина: именно оно указывает на место.
  return { html, size: [w, h], anchor: 'bottom' }
}
