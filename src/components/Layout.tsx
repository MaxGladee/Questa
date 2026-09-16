import type { ReactNode } from 'react'
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

function BottomNav () {
  return (
    <nav className="pointer-events-auto absolute inset-x-3 bottom-3 z-20 flex items-center
                    justify-between rounded-full border border-white/10 bg-surface/95 p-1.5
                    backdrop-blur">
      {TABS.map(({ to, label, Icon }) => (
        <NavLink
          key={to} to={to} end={to === '/'}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-1 rounded-full py-2.5 text-[11px] transition
             ${isActive ? 'bg-accent-2 text-white' : 'text-white/80'}`}
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
export function PhoneFrame ({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex h-full w-full max-w-[420px] flex-col bg-bg
                    shadow-[0_0_80px_-20px_rgb(135_105_255/0.35)]">
      {children}
    </div>
  )
}

/** Экран с нижней навигацией. */
export function TabScreen ({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div key={pathname} className="no-scrollbar flex-1 overflow-y-auto pb-28">
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
