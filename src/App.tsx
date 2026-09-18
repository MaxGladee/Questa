import type { ReactNode } from 'react'
import { Suspense, lazy, useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { PhoneFrame } from './components/Layout'
import { Loading } from './components/States'
import { ToastProvider } from './components/Toast'
import { LiveNotifications } from './components/LiveNotifications'
import { LevelUp } from './components/LevelUp'
import { AuthProvider, useAuth } from './lib/auth'
import { runEventMaintenance } from './lib/api'
import { isLive } from './lib/supabase'
import Splash from './screens/Splash'
import Onboarding from './screens/Onboarding'
import Register from './screens/Register'
import Confirm from './screens/Confirm'
import Interests from './screens/Interests'
import Login from './screens/Login'
import Forgot from './screens/Forgot'
import ResetPassword from './screens/ResetPassword'
import Home from './screens/Home'
import Events from './screens/Events'
import Profile from './screens/Profile'
import EventDetails from './screens/EventDetails'
import Settings from './screens/Settings'
import Notifications from './screens/Notifications'

/**
 * Экраны, которые грузятся отдельно.
 *
 * Всё приложение собиралось в один файл на мегабайт: человек открывал
 * список ивентов, а его телефон качал заодно карту с библиотекой Leaflet,
 * оформление яндексовской схемы, экран квеста и страницу самопроверки.
 * На мобильном интернете это лишние секунды до первого экрана.
 *
 * Отложены те экраны, которые тяжелее прочих или открываются не всегда:
 * всё, где есть карта, квест с его заданиями, создание и правка встречи.
 * Главная, список ивентов, профиль и вход остаются в основном файле —
 * с них начинают, и ждать отдельной загрузки там нечего.
 */
const MapScreen = lazy(() => import('./screens/MapScreen'))
const CreateEvent = lazy(() => import('./screens/CreateEvent'))
const EditEvent = lazy(() => import('./screens/EditEvent'))
const Quest = lazy(() => import('./screens/Quest'))
const Chat = lazy(() => import('./screens/Chat'))
const Summary = lazy(() => import('./screens/Summary'))
const Archive = lazy(() => import('./screens/Archive'))
const UserProfile = lazy(() => import('./screens/UserProfile'))
const Health = lazy(() => import('./screens/Health'))

/**
 * Экраны за входом. Без сессии уводим на приветствие, с сессией но без
 * заполненного профиля — на шаг создания профиля (ЧТЗ 5.1.1, шаг 5).
 */
function RequireAuth ({ children }: { children: ReactNode }) {
  const { ready, session, profile } = useAuth()
  const { pathname } = useLocation()

  if (!isLive) return <>{children}</>          // демонстрационный режим без входа
  if (!ready) return <Loading label="Открываем Questa…" />

  if (!session) {
    // Человек пришёл по ссылке на ивент, но ещё не вошёл. Запоминаем, куда
    // он шёл: после входа приложение откроет именно этот экран, а не главную.
    rememberDestination(pathname)
    return <Navigate to="/start" replace />
  }
  if (!profile && pathname !== '/interests') return <Navigate to="/interests" replace />

  return <>{children}</>
}

const DESTINATION_KEY = 'questa:after-login'

/** Куда вернуть человека после входа, если он шёл по ссылке. */
export function rememberDestination (path: string) {
  try {
    if (path && path !== '/') sessionStorage.setItem(DESTINATION_KEY, path)
  } catch {
    // Приватный режим запрещает хранилище: просто откроется главная.
  }
}

export function takeDestination (): string | null {
  try {
    const path = sessionStorage.getItem(DESTINATION_KEY)
    if (path) sessionStorage.removeItem(DESTINATION_KEY)
    return path
  } catch {
    return null
  }
}

/**
 * Возврат по ссылке из письма о смене пароля.
 *
 * Ссылка ведёт на адрес приложения с пометкой recovery: к этому моменту
 * Supabase уже разобрал адрес и открыл сессию, а приложению остаётся
 * увести человека на экран нового пароля и убрать пометку, чтобы
 * следующее открытие не начиналось с неё.
 */
function useRecoveryLink () {
  const navigate = useNavigate()

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('recovery')) return

    window.history.replaceState({}, '', window.location.pathname + window.location.hash)
    navigate('/reset', { replace: true })
  }, [navigate])
}

/**
 * Работа по часам — напоминания о скорых встречах и закрытие просроченных.
 *
 * Планировщика в Supabase по умолчанию нет, поэтому база делает это по
 * просьбе приложения: один вызов на запуск. Работа идемпотентна, так что
 * десять открытых вкладок не дадут десяти напоминаний.
 */
function useEventMaintenance () {
  useEffect(() => { runEventMaintenance() }, [])
}

function Router () {
  const { pathname } = useLocation()
  useRecoveryLink()
  useEventMaintenance()

  // key по адресу заставляет React пересоздать обёртку при переходе,
  // и анимация появления проигрывается заново на каждом экране.
  return (
    <>
    {/* Вне ключа по адресу: иначе плашка исчезала бы при каждом переходе
        и подписка пересоздавалась на каждом экране. */}
    <LiveNotifications />
    <LevelUp />

    <div key={pathname} className="animate-screen h-full">
    {/* Пока отложенный экран догружается, на месте него — та же полоса
        загрузки, что и при запросе данных: пустой экран выглядел бы
        поломкой. */}
    <Suspense fallback={<Loading label="Открываем…" />}>
    <Routes>
      <Route path="/start"      element={<Splash />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/register"   element={<Register />} />
      <Route path="/confirm"    element={<Confirm />} />
      <Route path="/login"      element={<Login />} />
      <Route path="/forgot"     element={<Forgot />} />
      <Route path="/reset"      element={<ResetPassword />} />
      <Route path="/interests"  element={<Interests />} />
      <Route path="/health"     element={<Health />} />

      <Route path="/"        element={<RequireAuth><Home /></RequireAuth>} />
      <Route path="/events"  element={<RequireAuth><Events /></RequireAuth>} />
      <Route path="/map"     element={<RequireAuth><MapScreen /></RequireAuth>} />
      <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
      <Route path="/notifications" element={<RequireAuth><Notifications /></RequireAuth>} />

      <Route path="/create"          element={<RequireAuth><CreateEvent /></RequireAuth>} />
      <Route path="/event/:id/edit"  element={<RequireAuth><EditEvent /></RequireAuth>} />
      <Route path="/event/:id"       element={<RequireAuth><EventDetails /></RequireAuth>} />
      <Route path="/event/:id/chat"  element={<RequireAuth><Chat /></RequireAuth>} />
      <Route path="/event/:id/quest" element={<RequireAuth><Quest /></RequireAuth>} />
      <Route path="/event/:id/summary" element={<RequireAuth><Summary /></RequireAuth>} />
      <Route path="/user/:id"        element={<RequireAuth><UserProfile /></RequireAuth>} />
      <Route path="/archive"         element={<RequireAuth><Archive /></RequireAuth>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
    </div>
    </>
  )
}

export default function App () {
  return (
    <HashRouter>
      <AuthProvider>
        <PhoneFrame>
          <ToastProvider>
            <Router />
          </ToastProvider>
        </PhoneFrame>
      </AuthProvider>
    </HashRouter>
  )
}
