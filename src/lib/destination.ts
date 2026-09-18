const KEY = 'questa:after-login'

/**
 * Куда вернуть человека после входа, если он шёл по ссылке.
 *
 * Лежит отдельным модулем, а не в App: по ссылке на встречу открывается
 * экран приглашения, который грузится своим файлом, и импорт из App
 * замкнул бы их друг на друга.
 */
export function rememberDestination (path: string) {
  try {
    if (path && path !== '/') sessionStorage.setItem(KEY, path)
  } catch {
    // Приватный режим запрещает хранилище: просто откроется главная.
  }
}

export function takeDestination (): string | null {
  try {
    const path = sessionStorage.getItem(KEY)
    if (path) sessionStorage.removeItem(KEY)
    return path
  } catch {
    return null
  }
}
