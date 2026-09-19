/**
 * Что за устройство и как открыто приложение.
 *
 * Нужно там, где совет человеку зависит от платформы: разрешения на
 * геопозицию и установку на домашний экран в Safari и в Chrome спрятаны в
 * разных местах, а в установленном приложении адресной строки нет вовсе —
 * и подсказка «нажмите „аА“ в адресной строке» становится враньём.
 */

/** iPhone или iPad — там свои правила почти во всём, что связано с доступом. */
export function isApple (): boolean {
  if (typeof navigator === 'undefined') return false
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true
  // iPad с iPadOS представляется настольным Safari, выдаёт его только касание.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

/** Приложение открыто с домашнего экрана, а не во вкладке браузера. */
export function isStandalone (): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  // Старый способ Safari, который так и не заменили на общий.
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}
