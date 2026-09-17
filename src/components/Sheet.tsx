import { useEffect, useMemo, useState } from 'react'
import { Button } from './ui'
import { CloseIcon, SearchIcon } from './icons'
import { noAutofill } from './ui'

export interface Option {
  value: string
  title: string
  hint?: string
}

/**
 * Выезжающий снизу список выбора.
 *
 * Заменяет россыпь кнопок: длинные перечни — города, интересы — занимали
 * пол-экрана и мешали видеть остальную форму. В закрытом виде от списка
 * остаётся одна строка, а сам выбор происходит поверх экрана.
 */
export function Sheet (
  { title, options, selected, onClose, onApply, multiple = false, limit, searchable = true }: {
    title: string
    options: Option[]
    selected: string[]
    onClose: () => void
    onApply: (values: string[]) => void
    multiple?: boolean
    /** Максимум для множественного выбора. */
    limit?: number
    searchable?: boolean
  },
) {
  const [chosen, setChosen] = useState<string[]>(selected)
  const [query, setQuery] = useState('')

  // Пока список открыт, экран под ним не должен прокручиваться.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle ? options.filter((item) => item.title.toLowerCase().includes(needle)) : options
  }, [options, query])

  const full = Boolean(multiple && limit && chosen.length >= limit)

  function pick (value: string) {
    if (!multiple) {
      onApply([value])
      return
    }

    setChosen((list) => list.includes(value)
      ? list.filter((item) => item !== value)
      : full ? list : [...list, value])
  }

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end bg-black/60" onClick={onClose}>
      <div
        onClick={(event) => event.stopPropagation()}
        className="animate-sheet flex max-h-[82%] flex-col rounded-t-[28px] bg-surface"
      >
        <div className="pt-3">
          <span className="mx-auto block h-1.5 w-12 rounded-full bg-white/30" />
        </div>

        <header className="flex items-center gap-3 px-5 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[20px]">{title}</h2>
            {multiple && limit && (
              <p className="text-[14px] text-muted">
                Выбрано {chosen.length} из {limit}
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label="Закрыть"><CloseIcon className="size-6" /></button>
        </header>

        {searchable && options.length > 8 && (
          <label className="mx-5 mb-2 flex items-center gap-2 rounded-field bg-field px-4 py-3">
            <SearchIcon className="size-5 shrink-0 text-muted" />
            <input
              {...noAutofill} type="search"
              value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск" aria-label="Поиск по списку"
              className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted"
            />
          </label>
        )}

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5">
          {shown.length === 0 && (
            <p className="py-10 text-center text-[16px] text-muted">Ничего не нашлось</p>
          )}

          {shown.map((option) => {
            const active = chosen.includes(option.value)
            const blocked = !active && full

            return (
              <button
                key={option.value} onClick={() => pick(option.value)} disabled={blocked}
                className={`flex w-full items-center gap-3 border-b border-white/5 py-3.5 text-left
                            last:border-0 ${blocked ? 'opacity-35' : ''}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[17px]">{option.title}</span>
                  {option.hint && (
                    <span className="block truncate text-[14px] text-muted">{option.hint}</span>
                  )}
                </span>
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-full text-[14px]
                              font-bold ${active ? 'bg-accent text-white' : 'border border-white/20'}`}
                >
                  {active ? '✓' : ''}
                </span>
              </button>
            )
          })}
        </div>

        {multiple && (
          <div className="p-5">
            <Button disabled={chosen.length === 0} onClick={() => onApply(chosen)}>Готово</Button>
          </div>
        )}
      </div>
    </div>
  )
}

/** Строка формы, которая открывает список. В закрытом виде — одна строка. */
export function PickerField (
  { label, value, placeholder, onOpen }:
  { label: string; value?: string; placeholder: string; onOpen: () => void },
) {
  return (
    <div className="space-y-2">
      <span className="text-[15px] text-muted">{label}</span>
      <button
        onClick={onOpen} aria-label={label}
        className="flex w-full items-center gap-3 rounded-field bg-field px-5 py-4 text-left"
      >
        <span className={`min-w-0 flex-1 text-[17px] ${value ? '' : 'text-muted'}`}>
          {value || placeholder}
        </span>
        <span className="shrink-0 text-[14px] text-muted">▾</span>
      </button>
    </div>
  )
}
