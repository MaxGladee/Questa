import { useCallback, useEffect, useState } from 'react'
import { isApple, isStandalone } from './device'

/**
 * Установка на домашний экран.
 *
 * Questa — сайт, который притворяется приложением: на телефоне его можно
 * поставить на домашний экран, и тогда он открывается без адресной строки,
 * запоминает вход и работает в метро (оболочка лежит в кэше, см. sw.js).
 * Но сам браузер об этом почти не сообщает: Chrome прячет предложение в
 * меню, Safari — в окно «Поделиться». Человек об этом не знает и ходит
 * через вкладку.
 *
 * Здесь всё, что для этого нужно знать экранам: можно ли поставить прямо
 * сейчас, стоит ли уже, и не тот ли это случай (iPhone), когда за нас
 * браузер ничего не сделает и остаётся объяснить словами.
 *
 * Слушатель висит на уровне модуля, а не экрана: браузер объявляет о
 * готовности один раз и почти сразу после загрузки — к моменту, когда
 * человек дойдёт до настроек, событие давно прошло. Поэтому файл
 * подключается в main.tsx, а не там, где показывается кнопка.
 */

interface InstallPrompt extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let waiting: InstallPrompt | null = null
const listeners = new Set<() => void>()

function announce () {
  for (const listener of listeners) listener()
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Без этого Chrome покажет собственную плашку внизу экрана — поверх
    // нижней навигации и в чужом оформлении.
    event.preventDefault()
    waiting = event as InstallPrompt
    announce()
  })

  window.addEventListener('appinstalled', () => {
    waiting = null
    announce()
  })
}

export type InstallOutcome = 'installed' | 'declined' | 'unavailable'

export function useInstall () {
  const [ready, setReady] = useState(() => waiting !== null)
  const [installed, setInstalled] = useState(isStandalone)

  useEffect(() => {
    const update = () => {
      setReady(waiting !== null)
      setInstalled(isStandalone())
    }

    listeners.add(update)
    update()
    return () => { listeners.delete(update) }
  }, [])

  const install = useCallback(async (): Promise<InstallOutcome> => {
    if (!waiting) return 'unavailable'

    const prompt = waiting
    await prompt.prompt()
    const { outcome } = await prompt.userChoice

    // Второй раз одно и то же предложение показать нельзя: браузер выдаст
    // новое событие сам, если человек передумает.
    waiting = null
    announce()

    return outcome === 'accepted' ? 'installed' : 'declined'
  }, [])

  return { ready, installed, apple: isApple(), install }
}
