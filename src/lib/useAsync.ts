import { useCallback, useEffect, useState } from 'react'

/** Загрузка данных с состояниями «идёт», «ошибка», «готово». */
export function useAsync<T> (load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const run = useCallback(() => {
    let cancelled = false
    setLoading(true)

    load()
      .then((result) => { if (!cancelled) { setData(result); setError(null) } })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : 'Не удалось загрузить данные')
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(run, [run])

  // Связь вернулась — повторяем неудавшийся запрос сами. Иначе человек
  // остаётся смотреть на сообщение об ошибке, пока не догадается обновить.
  useEffect(() => {
    if (!error) return

    const retry = () => run()
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [error, run])

  return { data, error, loading, reload: run }
}
