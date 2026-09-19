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
 * Нижняя навигация.
 *
 * Панель висит не в пустоте: под ней до самого края экрана идёт фон, а
 * выше он растворяется. На айфоне, где приложение открыто с домашнего
 * экрана, иначе выходило некрасиво — между панелью и краем оставалась
 * полоса чужого фона, а сквозь неё виднелся обрезанный список. Полоса
 * жестов iOS при этом остаётся свободной: панель поднята ровно на её
 * высоту, а не налезает сверху.
 */
function BottomNav () {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-20 bg-gradient-to-t from-bg
                 from-55% via-bg/75 via-80% to-transparent pt-14"
      style={{
        // Обёртка спускается ниже безопасного поля рамки — до самого низа
        // экрана, — а панель внутри поднята на его высоту.
        bottom: 'calc(-1 * var(--safe-bottom))',
        paddingBottom: 'calc(var(--safe-bottom) + 8px)',
      }}
    >
      <nav className="pointer-events-auto mx-3 flex items-center justify-between rounded-full
                      border border-white/10 bg-surface/95 p-1 backdrop-blur">
        {TABS.map(({ to, label, Icon }) => (
          <NavLink
            key={to} to={to} end={to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 rounded-full py-2 text-[11px] transition
               ${isActive ? 'bg-accent-2 text-white' : 'text-white/80'}`}
          >
            <Icon className="size-[22px]" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
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
        paddingTop: 'var(--safe-top)',
        paddingBottom: 'var(--safe-bottom)',
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
    // Без overflow-hidden: обёртка навигации намеренно выходит за нижний
    // край экрана, в безопасное поле рамки, и обрезать её нельзя.
    <div className="relative flex h-full flex-col">
      <div
        key={pathname}
        className={fullBleed
          ? 'min-h-0 flex-1'
          : 'no-scrollbar flex-1 overflow-y-auto pb-28'}
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
