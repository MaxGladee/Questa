import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BellIcon, FlameIcon, SparkIcon, UserIcon } from './icons'
import { Avatar } from './ui'
import {
  chatImageUrl, listEvents, markNotificationRead, subscribeMessages, subscribeNotifications,
  type Notification,
} from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { useAuth } from '../lib/auth'

const ICON: Record<string, typeof BellIcon> = {
  join: UserIcon,
  group: FlameIcon,
  task: SparkIcon,
  start: SparkIcon,
}

/** Плашка на экране: и уведомление из базы, и сообщение из чата. */
interface Banner {
  id: string
  title: string
  body: string
  /** Куда ведёт нажатие. */
  to: string
  /** Адрес, на котором плашку показывать не нужно — человек и так там. */
  quietOn?: string
  /** Строка уведомления в базе: по нажатию её нужно пометить прочитанной. */
  notificationId?: string
  type: string
  avatar?: { name: string; src?: string }
}

/**
 * Всплывающие уведомления поверх приложения.
 *
 * Колокольчик хорош, когда о событии уже знаешь и хочешь перечитать. Узнать
 * из него нельзя: человек сидит на карте и не видит, что группа набралась
 * или что ему написали. Плашка приходит сверху, живёт несколько секунд и по
 * нажатию открывает нужное место.
 *
 * Сообщения из чата приходят сюда напрямую, без записи в таблицу
 * уведомлений: строка на каждое «ок» засорила бы колокольчик и нагружала бы
 * базу при каждом слове. Подписка идёт по своим встречам поимённо — так
 * приложение не получает чужую переписку даже случайно.
 */
export function LiveNotifications () {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [shown, setShown] = useState<Banner | null>(null)

  // Адрес нужен внутри подписки, а она создаётся один раз: без ссылки
  // подписка запомнила бы адрес момента создания и молчала бы невпопад.
  const here = useRef(pathname)
  here.current = pathname

  const { data: events } = useAsync(
    () => profile ? listEvents(profile.id) : Promise.resolve([]), [profile?.id],
  )

  // Свои встречи, где чат уже открыт: только они и могут писать.
  const chats = (events ?? []).filter(
    (event) => event.myRole !== 'guest'
      && event.chatOpened
      && (event.status === 'active' || event.status === 'in_progress'),
  )

  const chatIds = chats.map((event) => event.id).join(',')

  function show (banner: Banner) {
    if (banner.quietOn && here.current === banner.quietOn) return

    setShown(banner)
    window.setTimeout(
      () => setShown((current) => (current?.id === banner.id ? null : current)),
      6000,
    )
  }

  // Уведомления из базы: заявки, набор группы, начало и конец встречи.
  useEffect(() => {
    if (!profile) return

    return subscribeNotifications(profile.id, (item: Notification) => show({
      id: item.id,
      title: item.title,
      body: item.body ?? '',
      to: item.eventId ? `/event/${item.eventId}` : '/notifications',
      quietOn: '/notifications',
      type: item.type,
      notificationId: item.id,
    }))
  }, [profile?.id])

  // Сообщения из чатов своих встреч.
  useEffect(() => {
    if (!profile || chats.length === 0) return

    const stops = chats.map((event) => subscribeMessages(event.id, (message) => {
      // Системные события уже приходят уведомлениями, свои сообщения
      // показывать самому себе незачем.
      if (!message.authorId || message.authorId === profile.id) return

      show({
        id: message.id,
        title: event.title,
        body: `${message.authorName ?? 'Участник'}: ${
          chatImageUrl(message.body) ? 'фотография' : message.body}`,
        to: `/event/${event.id}/chat`,
        quietOn: `/event/${event.id}/chat`,
        type: 'chat',
        avatar: { name: message.authorName ?? 'Участник', src: message.authorAvatar },
      })
    }))

    return () => stops.forEach((stop) => stop())
  }, [profile?.id, chatIds])

  if (!shown) return null

  const Icon = ICON[shown.type] ?? BellIcon

  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-[70]">
      <button
        onClick={() => {
          // Плашку открыли — значит прочитали: в колокольчике она не должна
          // остаться непрочитанной.
          if (shown.notificationId) markNotificationRead(shown.notificationId).catch(() => {})
          setShown(null)
          navigate(shown.to)
        }}
        className="animate-sheet pointer-events-auto flex w-full items-center gap-3 rounded-card
                   bg-surface-3 p-3.5 text-left shadow-2xl ring-1 ring-accent/40"
      >
        {shown.avatar
          ? <Avatar name={shown.avatar.name} src={shown.avatar.src} size={40} />
          : (
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/20">
              <Icon className="size-5 text-accent-soft" />
            </span>
          )}

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold">{shown.title}</span>
          {shown.body && (
            <span className="block truncate text-[14px] text-muted">{shown.body}</span>
          )}
        </span>

        <span
          role="presentation"
          onClick={(event) => { event.stopPropagation(); setShown(null) }}
          className="shrink-0 px-1 text-[20px] leading-none text-muted"
        >
          ×
        </span>
      </button>
    </div>
  )
}
