// Сервис-воркер: приложение открывается и без сети.
//
// Зачем он нужен. Без него страница, добавленная на домашний экран, в метро
// или в подвале кафе показывает ошибку браузера — то есть именно там, где
// приложением и пользуются. С ним оболочка приложения берётся из кэша, а
// данные подтягиваются, когда связь вернётся.
//
// Две разные стратегии, и это принципиально:
//   • переходы по страницам и index.html — сначала сеть. Иначе после
//     очередной выкладки люди неделями сидели бы на старой версии.
//   • файлы сборки (в их именах есть хэш содержимого) — сначала кэш: их
//     содержимое никогда не меняется, меняется имя.
//
// Запросы к базе, картам и хранилищу снимков через воркер не проходят:
// это чужие адреса, и кэшировать ответы с личными данными не следует.

const CACHE = 'questa-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(['./', './index.html'])).catch(() => {}),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name !== CACHE).map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  )
})

async function fromNetworkFirst (request) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch (failure) {
    const cached = await cache.match(request) || await cache.match('./index.html')
    if (cached) return cached
    throw failure
  }
}

async function fromCacheFirst (request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(fromNetworkFirst(request))
    return
  }

  event.respondWith(fromCacheFirst(request))
})
