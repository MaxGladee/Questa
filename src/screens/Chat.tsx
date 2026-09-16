import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BackIcon, ClipIcon, SparkIcon } from '../components/icons'
import { findEvent, MESSAGES, type ChatMessage } from '../data/demo'

/** Чат ивента (ЧТЗ 5.8): сообщения участников и системные события. */
export default function Chat () {
  const { id } = useParams()
  const navigate = useNavigate()
  const event = findEvent(id)
  const [messages, setMessages] = useState<ChatMessage[]>(
    () => MESSAGES.filter((message) => message.eventId === id),
  )
  const [draft, setDraft] = useState('')
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  if (!event) return null

  function send () {
    const body = draft.trim()
    if (!body) return
    setMessages((list) => [...list, {
      id: `local-${list.length}`,
      eventId: event!.id,
      authorId: 'me',
      body,
      at: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    }])
    setDraft('')
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center gap-3 px-4 pb-2 pt-3">
        <button onClick={() => navigate(-1)} aria-label="Назад"><BackIcon className="size-7" /></button>
        <h1 className="flex-1 text-center text-[21px]">{event.title}</h1>
        <Link to={`/event/${event.id}`} aria-label="Детали ивента" className="text-[22px]">📋</Link>
      </header>

      <p className="flex items-center justify-center gap-2 pb-3 text-[17px] font-semibold text-success">
        <span className="size-2.5 rounded-full bg-success" />
        В процессе
      </p>

      <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto px-4 pb-2">
        {messages.map((message) => {
          if (message.authorId === null) {
            return (
              <p key={message.id} className="text-center text-[16px] text-white/85">
                {message.body} · {message.at}
              </p>
            )
          }

          const mine = message.authorId === 'me'
          return (
            <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[78%] rounded-[22px] px-4 py-3 ${
                  mine ? 'bg-accent text-white' : 'bg-bubble text-bg'}`}
              >
                {!mine && (
                  <p className="text-[17px] font-bold text-accent-2">{message.authorName}</p>
                )}
                <p className="text-[17px] leading-snug">{message.body}</p>
                <p className={`mt-1 text-right text-[13px] ${mine ? 'text-white/70' : 'text-bg/50'}`}>
                  {message.at}
                </p>
              </div>
            </div>
          )
        })}

        {event.quest && (
          <div className="space-y-2 pt-2">
            <p className="text-center text-[16px] font-semibold">
              <SparkIcon className="mr-1.5 inline size-4 align-[-2px] text-accent" />
              ИИ сгенерировал квест! Проверьте задания ↓
            </p>
            <Link to={`/event/${event.id}/quest`} className="block rounded-[22px] bg-surface-2 p-4">
              <p className="text-[19px] font-bold text-accent">Ваши задания готовы!</p>
              <ul className="mt-2 space-y-1 text-[17px] leading-snug">
                {event.quest.tasks.map((task) => (
                  <li key={task.id}>{task.title}: {task.description}</li>
                ))}
              </ul>
              <p className="mt-3 text-[17px] font-semibold">Перейти к заданиям →</p>
            </Link>
          </div>
        )}

        <div ref={bottom} />
      </div>

      <div className="flex items-center gap-3 px-4 pb-4 pt-2">
        <label className="flex flex-1 items-center gap-3 rounded-full bg-[#312B4B] px-4 py-3.5">
          <ClipIcon className="size-6 text-muted" />
          <input
            value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Начните писать..." maxLength={500} aria-label="Сообщение"
            className="min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted"
          />
        </label>
        <button
          onClick={send} disabled={!draft.trim()} aria-label="Отправить"
          className="grid size-12 shrink-0 place-items-center rounded-full bg-accent
                     text-[22px] font-bold text-white disabled:opacity-40"
        >
          ↑
        </button>
      </div>
    </div>
  )
}
