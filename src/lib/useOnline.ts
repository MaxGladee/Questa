import { useEffect, useState } from 'react'

/**
 * Есть ли сеть. Браузер знает об этом первым, и спрашивать его дешевле,
 * чем ждать, пока запрос отвалится по таймауту.
 *
 * Флаг честен ровно наполовину: «онлайн» означает, что устройство к сети
 * подключено, а не что интернет за ней работает. Поэтому он используется
 * для подсказок, а не вместо обработки ошибок запросов.
 */
export function useOnline (): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine)

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)

    window.addEventListener('online', up)
    window.addEventListener('offline', down)

    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  return online
}
