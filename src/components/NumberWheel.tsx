import { useEffect, useRef } from 'react'
import type React from 'react'

/**
 * Выбор числа прокруткой — как барабан в системных часах.
 *
 * Поле ввода для двух-трёх цифр на телефоне неудобно: под него поднимается
 * клавиатура, набрать можно что угодно (ноль, сто, минус), и ошибку человек
 * видит только после нажатия «Создать». Здесь в барабане лежат ровно
 * допустимые значения, поэтому проверять нечего: невозможное просто не
 * выбирается.
 *
 * Прокрутка своя, браузерная: scroll-snap останавливает барабан на
 * ближайшем числе, а значение читается из положения прокрутки. Никаких
 * обработчиков касаний — так работает и пальцем, и колесом мыши, и с
 * клавиатуры.
 */
const ITEM = 44

export function NumberWheel (
  { value, from, to, label, onChange }: {
    value: number
    from: number
    to: number
    label: string
    onChange: (value: number) => void
  },
) {
  const track = useRef<HTMLDivElement>(null)
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Когда колесо мыши двигало барабан в последний раз. */
  const lastWheel = useRef(0)
  // Пока человек крутит барабан сам, программно его не двигаем — иначе
  // прокрутка дёргается под пальцем.
  const touched = useRef(false)

  const values: number[] = []
  for (let item = from; item <= to; item += 1) values.push(item)

  // Внешнее значение приводит барабан к нужному числу: например, когда
  // максимум подтянулся за минимумом.
  useEffect(() => {
    const node = track.current
    if (!node || touched.current) return

    const index = Math.max(0, values.indexOf(value))
    const top = index * ITEM
    if (Math.abs(node.scrollTop - top) > 1) node.scrollTo({ top, behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, from, to])

  /**
   * Колесо мыши двигает барабан ровно на одно число.
   *
   * Одно деление колеса прокручивает страницу примерно на сто пикселей —
   * это два с лишним числа, и половину значений так просто не поймать.
   * Поэтому прокрутку колесом мы берём на себя: направление берём у
   * события, шаг задаём сами.
   */
  function onWheel (event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault()

    // Тачпад шлёт события пачками по несколько десятков; без паузы один
    // жест пролистал бы весь барабан.
    const now = Date.now()
    if (now - lastWheel.current < 120) return
    lastWheel.current = now

    const step = event.deltaY > 0 ? 1 : -1
    const index = values.indexOf(value)
    const next = values[Math.min(values.length - 1, Math.max(0, index + step))]

    if (next !== undefined && next !== value) onChange(next)
  }

  // Слушатель ставится вручную: React вешает onWheel пассивно, а пассивный
  // обработчик не может отменить прокрутку страницы.
  useEffect(() => {
    const node = track.current
    if (!node) return

    const handler = (event: WheelEvent) => onWheel(event as unknown as React.WheelEvent<HTMLDivElement>)
    node.addEventListener('wheel', handler, { passive: false })
    return () => node.removeEventListener('wheel', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, from, to])

  function onScroll () {
    const node = track.current
    if (!node) return

    touched.current = true
    if (settle.current) clearTimeout(settle.current)

    // Значение читается не на каждом пикселе прокрутки, а когда барабан
    // остановился: иначе по дороге к семёрке выбирались бы все числа подряд.
    settle.current = setTimeout(() => {
      const index = Math.min(values.length - 1, Math.max(0, Math.round(node.scrollTop / ITEM)))
      touched.current = false
      if (values[index] !== value) onChange(values[index])
    }, 120)
  }

  return (
    <div className="relative">
      <span className="mb-2 block text-[15px] text-muted">{label}</span>

      <div className="relative rounded-field bg-field">
        {/* Рамка вокруг среднего ряда: без неё непонятно, какое число выбрано. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-2 top-1/2 z-10 -translate-y-1/2
                     rounded-xl border border-accent/60 bg-accent/10"
          style={{ height: ITEM }}
        />

        <div
          ref={track} onScroll={onScroll}
          role="listbox" aria-label={label}
          className="no-scrollbar snap-y snap-mandatory overflow-y-auto overscroll-contain"
          style={{ height: ITEM * 3 }}
        >
          {/* Пустые полосы сверху и снизу: без них первое и последнее число
              не поднимаются на середину. */}
          <div style={{ height: ITEM }} />

          {values.map((item) => (
            <button
              key={item} type="button"
              role="option" aria-selected={item === value}
              onClick={() => onChange(item)}
              className={`flex w-full snap-center items-center justify-center text-[20px]
                          transition ${item === value ? 'font-bold text-white' : 'text-muted'}`}
              style={{ height: ITEM }}
            >
              {item}
            </button>
          ))}

          <div style={{ height: ITEM }} />
        </div>
      </div>
    </div>
  )
}
