import { useEffect } from 'react'
import { CATEGORIES, type CategoryCode, type QuestaEvent } from '../data/demo'
import { categoryArt } from '../data/category-art'
import { distanceMeters } from '../lib/geo'
import { Button, Switch } from './ui'
import { CloseIcon } from './icons'

/**
 * Отбор ивентов на карте.
 *
 * Раньше сверху лежала строка категорий, и это был весь отбор. С шестью
 * категориями она помещалась, с шестнадцатью — превратилась бы в ленту,
 * которую нужно листать, чтобы увидеть последнюю. Да и отбирать хочется не
 * только по теме: «сегодня вечером, недалеко, и чтобы места оставались» —
 * обычный вопрос, на который карта не отвечала.
 *
 * Поэтому весь отбор ушёл за одну кнопку, а на карте остаётся только
 * счётчик выбранного.
 */
export interface MapFilterState {
  categories: CategoryCode[]
  /** Насколько скоро: сегодня, ближайшие дни, неделя или когда угодно. */
  when: 'any' | 'today' | 'three' | 'week'
  /** Только те, где ещё остались места. */
  onlyFree: boolean
  /** Радиус вокруг себя в километрах; 0 — весь город. */
  radiusKm: number
}

export const NO_FILTERS: MapFilterState = {
  categories: [], when: 'any', onlyFree: false, radiusKm: 0,
}

const WHEN: { value: MapFilterState['when']; title: string }[] = [
  { value: 'any', title: 'Когда угодно' },
  { value: 'today', title: 'Сегодня' },
  { value: 'three', title: 'Три дня' },
  { value: 'week', title: 'Неделя' },
]

const RADIUS: { value: number; title: string }[] = [
  { value: 0, title: 'Весь город' },
  { value: 1, title: '1 км' },
  { value: 3, title: '3 км' },
  { value: 10, title: '10 км' },
]

const DAY = 86_400_000

/** Сколько условий задано — столько и показывает счётчик на кнопке. */
export function activeFilterCount (filters: MapFilterState): number {
  return (filters.categories.length > 0 ? 1 : 0)
    + (filters.when !== 'any' ? 1 : 0)
    + (filters.onlyFree ? 1 : 0)
    + (filters.radiusKm > 0 ? 1 : 0)
}

/** Подходит ли ивент под отбор. Радиус учитывается, только если есть своя точка. */
export function matchesFilters (
  event: QuestaEvent, filters: MapFilterState, me: [number, number] | null,
): boolean {
  if (filters.categories.length > 0 && !filters.categories.includes(event.category)) return false

  if (filters.when !== 'any') {
    const starts = new Date(event.startsAt).getTime()
    const until = { today: 1, three: 3, week: 7 }[filters.when] * DAY
    // Уже идущие встречи не отсеиваются: до них ещё можно дойти.
    if (starts > Date.now() + until) return false
  }

  if (filters.onlyFree && event.participants.length >= event.maxParticipants) return false

  if (filters.radiusKm > 0 && me) {
    if (distanceMeters(me, [event.lat, event.lng]) > filters.radiusKm * 1000) return false
  }

  return true
}

function Row ({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[15px] text-muted">{title}</p>
      {children}
    </div>
  )
}

export function MapFilters (
  { filters, found, onChange, onClose }: {
    filters: MapFilterState
    /** Сколько ивентов останется — число на кнопке «Показать». */
    found: number
    onChange: (next: MapFilterState) => void
    onClose: () => void
  },
) {
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  const toggle = (code: CategoryCode) => onChange({
    ...filters,
    categories: filters.categories.includes(code)
      ? filters.categories.filter((item) => item !== code)
      : [...filters.categories, code],
  })

  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end bg-black/60" onClick={onClose}>
      <div
        onClick={(event) => event.stopPropagation()}
        className="animate-sheet flex max-h-[85%] flex-col rounded-t-[28px] bg-surface"
      >
        <div className="pt-3">
          <span className="mx-auto block h-1.5 w-12 rounded-full bg-white/30" />
        </div>

        <header className="flex items-center gap-3 px-5 py-3">
          <h2 className="min-w-0 flex-1 text-[20px]">Фильтры</h2>
          <button
            onClick={() => onChange(NO_FILTERS)}
            className="text-[15px] text-muted"
          >
            Сбросить
          </button>
          <button onClick={onClose} aria-label="Закрыть"><CloseIcon className="size-6" /></button>
        </header>

        <div className="no-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-2">
          <Row title="Чем заняться">
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(({ code, title }) => {
                const active = filters.categories.includes(code)
                return (
                  <button
                    key={code} onClick={() => toggle(code)}
                    className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[15px]
                                font-semibold transition ${
                      active ? 'bg-accent text-white' : 'bg-surface-2 text-white/85'}`}
                  >
                    <span>{categoryArt(code).emoji}</span>
                    {title}
                  </button>
                )
              })}
            </div>
          </Row>

          <Row title="Когда">
            <div className="flex flex-wrap gap-2">
              {WHEN.map(({ value, title }) => (
                <button
                  key={value} onClick={() => onChange({ ...filters, when: value })}
                  className={`rounded-full px-3.5 py-2 text-[15px] font-semibold transition ${
                    filters.when === value ? 'bg-accent text-white' : 'bg-surface-2 text-white/85'}`}
                >
                  {title}
                </button>
              ))}
            </div>
          </Row>

          <Row title="Как далеко">
            <div className="flex flex-wrap gap-2">
              {RADIUS.map(({ value, title }) => (
                <button
                  key={value} onClick={() => onChange({ ...filters, radiusKm: value })}
                  className={`rounded-full px-3.5 py-2 text-[15px] font-semibold transition ${
                    filters.radiusKm === value ? 'bg-accent text-white' : 'bg-surface-2 text-white/85'}`}
                >
                  {title}
                </button>
              ))}
            </div>
          </Row>

          <div className="flex items-center gap-3 rounded-card bg-surface-2 p-4">
            <span className="min-w-0 flex-1 text-[17px]">
              Только со свободными местами
            </span>
            <Switch
              checked={filters.onlyFree} label="Только со свободными местами"
              onChange={(value) => onChange({ ...filters, onlyFree: value })}
            />
          </div>
        </div>

        <div className="p-5">
          <Button onClick={onClose} disabled={found === 0}>
            {found === 0 ? 'Ничего не подходит' : `Показать ${found}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
