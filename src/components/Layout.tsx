import type { ReactNode } from 'react'
import { useOnline } from '../lib/useOnline'
import { NavLink, useLocation } from 'react-router-dom'
import { HomeIcon, FlameIcon, MapIcon, UserIcon } from './icons'

// Магазин из макетов в прототип не вошёл: по ЧТЗ 3.2 он отнесён к третьему
// этапу, за пределы MVP. Осталось четыре вкладки.
const TABS = [
  { to: '/',        label: 'Главная', Icon: HomeIcon },
  { to: '/events',  label: 'Ивенты',  Icon: FlameIcon },
  { to: '/map',     label: 'Карта',   Icon: MapIcon },
  { to: '/profile', label: 'Профиль', Icon: UserIcon },
]

/**
 * Нижняя панель — «стекло», как в макетах.
 *
 * Раньше панель была почти непрозрачной, и размытие под ней не работало:
 * блик был, а стекла не было. Теперь сквозь неё видно то, что под ней, —
 * карту, обложки, ленту, — и панель перестала выглядеть приклеенной
 * плашкой.
 *
 * Стекло собирается из четырёх вещей, и все они дешёвые:
 *   1. размытие фона (backdrop-filter) с лёгким усилением цвета — без него
 *      сквозь панель просвечивал бы мусор из букв и меток;
 *   2. полупрозрачная заливка градиентом сверху вниз — иначе размытие
 *      выглядит грязным;
 *   3. светлая волосяная линия по верхнему краю (inset-тень) — это «кромка»
 *      стекла, именно она делает его выпуклым;
 *   4. косой блик поверх — слой, который не ловит нажатия.
 *
 * Настоящее «жидкое стекло» Apple умеет ещё преломлять фон по краям; в
 * вебе это делается SVG-фильтром смещения и на телефоне заметно тормозит
 * при прокрутке. Оно того не стоит: разница видна только рядом с
 * оригиналом, а панель тормозит всегда.
 */
function BottomNav () {
  return (
    <nav
      className="pointer-events-auto absolute inset-x-3 bottom-3 z-20 flex items-center
                 justify-between overflow-hidden rounded-full p-1.5
                 bg-[linear-gradient(to_bottom,rgb(58_45_110/0.55),rgb(21_13_52/0.62))]
                 backdrop-blur-xl backdrop-saturate-150
                 shadow-[inset_0_1px_0_rgb(255_255_255/0.22),inset_0_-1px_0_rgb(255_255_255/0.06),0_12px_30px_-12px_rgb(0_0_0/0.75)]
                 ring-1 ring-white/12"
    >
      {/* Блик: узкая светлая полоса наискось по верхней половине стекла. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2
                   bg-[linear-gradient(105deg,rgb(255_255_255/0.14),rgb(255_255_255/0)_55%)]"
      />

      {TABS.map(({ to, label, Icon }) => (
        <NavLink
          key={to} to={to} end={to === '/'}
          className={({ isActive }) =>
            `relative flex flex-1 flex-col items-center gap-1 rounded-full py-2.5 text-[11px]
             transition ${isActive
               ? 'bg-accent/80 text-white shadow-[0_6px_18px_-8px_rgb(135_105_255/0.95),inset_0_1px_0_rgb(255_255_255/0.25)]'
               : 'text-white/75'}`}
        >
          <Icon className="size-6" />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

/**
 * Телефонная рамка. На телефоне приложение занимает весь экран, на десктопе
 * показывается колонкой в 390 точек — ширина макета в Figma.
 */
/**
 * Полоса «нет сети». Висит поверх экрана, а не вместо него: последние
 * загруженные данные остаются на месте, и ими можно пользоваться —
 * посмотреть адрес встречи, время и прочитанную переписку.
 */
function OfflineBar () {
  const online = useOnline()
  if (online) return null

  return (
    <div className="shrink-0 bg-surface-3 px-4 py-2 text-center text-[14px] text-accent-soft">
      Нет соединения — показываем последнее, что успели загрузить
    </div>
  )
}

export function PhoneFrame ({ children }: { children: ReactNode }) {
  // Отступы под «чёлку» и нижнюю полосу жестов: приложение открывается на
  // весь экран, и без них содержимое уезжает под системные элементы.
  return (
    <div
      className="relative mx-auto flex h-full w-full max-w-[420px] flex-col bg-bg
                 shadow-[0_0_80px_-20px_rgb(135_105_255/0.35)]"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <OfflineBar />

      {/*
        Мягкое свечение вверху экрана — как в макетах: фон не плоский, а
        уходит от фиолетового к тёмному. Слой не ловит нажатия и лежит под
        содержимым, поэтому ни на что не влияет.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-56"
        style={{
          background:
            'linear-gradient(180deg, rgb(135 105 255 / .20), transparent 85%)',
        }}
      />

      {children}
    </div>
  )
}

/**
 * Экран с нижней навигацией. Карта просит `fullBleed`: ей нужна вся площадь
 * под панель, иначе под навигацией остаётся полоса пустого фона.
 */
export function TabScreen (
  { children, fullBleed = false }: { children: ReactNode; fullBleed?: boolean },
) {
  const { pathname } = useLocation()

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div
        key={pathname}
        className={fullBleed
          ? 'min-h-0 flex-1'
          // Лента уходит под панель, а не упирается в неё: стеклу нужно
          // что-то размывать, иначе оно выглядит матовой заглушкой.
          : 'no-scrollbar flex-1 overflow-y-auto pb-24'}
      >
        {children}
      </div>
      <BottomNav />
    </div>
  )
}

/** Экран без навигации — с заголовком и кнопкой возврата. */
export function PlainScreen (
  { children, title, left, right }:
  { children: ReactNode; title?: string; left?: ReactNode; right?: ReactNode },
) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {(title || left || right) && (
        <header className="flex items-center gap-3 px-4 pb-2 pt-3">
          <div className="flex size-10 items-center justify-start">{left}</div>
          <h1 className="flex-1 text-center text-[20px]">{title}</h1>
          <div className="flex size-10 items-center justify-end">{right}</div>
        </header>
      )}
      <div className="no-scrollbar flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
