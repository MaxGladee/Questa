import { useEffect, useRef, useState } from 'react'

/**
 * Плавно доводит число до нового значения. Нужно там, где счёт меняется по
 * действию пользователя: увидеть, как очки прибавились, приятнее, чем
 * обнаружить другое число на том же месте.
 */
export function useCountUp (value: number, duration = 700): number {
  const [shown, setShown] = useState(value)
  const from = useRef(value)

  useEffect(() => {
    if (shown === value) return

    const start = performance.now()
    const initial = from.current
    let frame = 0

    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - progress) ** 3          // замедление к концу
      setShown(Math.round(initial + (value - initial) * eased))
      if (progress < 1) frame = requestAnimationFrame(step)
      else from.current = value
    }

    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration])

  return shown
}
