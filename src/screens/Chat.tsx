import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BackIcon, ClipIcon, SparkIcon } from '../components/icons'
import { Empty, Failed, Loading } from '../components/States'
import type { ChatMessage } from '../data/demo'
import {
  QUEST_READY, chatImageUrl, fileComplaint, getEvent, getQuest, listMessages,
  sendMessage, subscribeMessages, uploadImage,
} from '../lib/api'
import { ReportSheet } from '../components/ReportSheet'
import { shrinkImage } from '../lib/image'
import { useAsync } from '../lib/useAsync'
import { useAuth } from '../lib/auth'
import { useToast } from '../components/Toast'
import { isLive } from '../lib/supabase'

// Набор смайликов на панели. Не библиотека на сотни килобайт, а то, чем
// действительно отвечают в переписке: реакция, договорённость, место и время.
const EMOJI = [
  '😀', '😁', '😂', '🙂', '😉', '😍', '🤩', '😎',
  '🤔', '🙃', '😅', '😭', '😱', '🥳', '🤝', '👍',
  '👎', '👏', '🙏', '💪', '🔥', '✨', '💜', '❤️',
  '🎉', '🎯', '☕', '🍕', '🍻', '🎸', '⚽', '🎲',
  '🚶', '🏃', '📍', '🗺', '⏰', '✅', '❌', '❓',
]

/** Чат ивента (ЧТЗ 5.8): сообщения участников и системные события. */
export default function Chat () {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const filePicker = useRef<HTMLInputElement>(null)
  const toast = useToast()

  // Жалоба открывается долгим нажатием на чужое сообщение — так это
  // устроено в мессенджерах, и обычный тап ничего не задевает.
  const [reported, setReported] = useState<ChatMessage | null>(null)
  const pressTimer = useRef<number | null>(null)

  function holdStart (message: ChatMessage) {
    pressTimer.current = window.setTimeout(() => setReported(message), 550)
  }

  function holdEnd () {
    if (pressTimer.current) window.clearTimeout(pressTimer.current)
    pressTimer.current = null
  }

  const { data: event } = useAsync(() => getEvent(id!, profile?.id ?? null), [id, profile?.id])
  const { data: quest } = useAsync(() => getQuest(id!, profile?.id ?? null), [id, profile?.id])
  const { error, loading } = useAsync(
    async () => setMessages(await listMessages(id!)), [id],
  )

  // Новые сообщения приходят по подписке — это и есть «real-time» из ЧТЗ 5.8.
  useEffect(() => {
    if (!id) return
    return subscribeMessages(id, (message) => {
      setMessages((list) => list.some((item) => item.id === message.id) ? list : [...list, message])
    })
  }, [id])

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  async function send (text?: string) {
    const body = (text ?? draft).trim()
    if (!body || !profile || !id) return

    setSending(true)
    if (!text) setDraft('')
    setEmojiOpen(false)
    try {
      await sendMessage(id, profile.id, body)

      // В боевом режиме сообщение вернётся по подписке. В демонстрационном
      // подписки нет, поэтому показываем его сразу.
      if (!isLive) {
        setMessages((list) => [...list, {
          id: `local-${list.length}`,
          eventId: id!,
          authorId: profile!.id,
          body,
          at: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        }])
      }
    } catch {
      if (!text) setDraft(body)         // не отправилось — вернём текст в поле
      else toast('Сообщение не отправилось')
    } finally {
      setSending(false)
    }
  }

  /**
   * Снимок в чат. Он уменьшается прямо на устройстве, ложится в то же
   * хранилище, что аватары и обложки, и уходит сообщением со ссылкой —
   * получатели видят картинку, а не адрес.
   */
  async function attach (file: File | undefined) {
    if (!file || !profile || !id) return

    setUploading(true)
    try {
      const url = await uploadImage(await shrinkImage(file), profile.id, 'chat')
      await send(url)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось отправить фото')
    } finally {
      setUploading(false)
      if (filePicker.current) filePicker.current.value = ''
    }
  }

  const reportSheet = reported && profile && (
    <ReportSheet
      title="Пожаловаться"
      targets={[
        { key: 'message', label: 'На сообщение' },
        { key: 'user', label: 'На автора' },
      ]}
      onClose={() => setReported(null)}
      onSubmit={async ({ reason, comment, target }) => {
        await fileComplaint({
          authorId: profile.id,
          targetMessageId: target === 'message' ? reported.id : undefined,
          targetUserId: target === 'user' ? reported.authorId ?? undefined : undefined,
          reason,
          comment,
        })
        setReported(null)
        toast('Жалоба отправлена модерации')
      }}
    />
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center gap-3 px-4 pb-2 pt-3">
        <button onClick={() => navigate(-1)} aria-label="Назад"><BackIcon className="size-7" /></button>
        <h1 className="flex-1 truncate text-center text-[21px]">{event?.title ?? 'Чат'}</h1>
        <Link to={`/event/${id}`} aria-label="Детали ивента" className="text-[22px]">📋</Link>
      </header>

      {event?.status === 'in_progress' && (
        <p className="flex items-center justify-center gap-2 pb-3 text-[17px] font-semibold text-success">
          <span className="size-2.5 rounded-full bg-success" />
          В процессе
        </p>
      )}

      <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto px-4 pb-2">
        {loading && <Loading label="Загружаем переписку…" />}
        {error && <Failed message={error} />}

        {!loading && !error && messages.length === 0 && (
          <Empty label="Пока тихо. Напишите первым — например, где именно встречаемся." />
        )}

        {messages.map((message) => {
          // Объявление о квесте — такое же системное сообщение, как остальные,
          // но показывается карточкой со списком заданий.
          if (message.authorId === null && message.body === QUEST_READY && quest?.quest) {
            return (
              <div key={message.id} className="animate-message space-y-2 pt-1">
                <p className="text-center text-[16px] font-semibold">
                  <SparkIcon className="mr-1.5 inline size-4 align-[-2px] text-accent" />
                  {quest.quest.source === 'ai'
                    ? 'ИИ сгенерировал квест! Проверьте задания ↓'
                    : message.body}
                </p>
                <Link to={`/event/${id}/quest`} className="block rounded-[22px] bg-surface-2 p-4">
                  <p className="text-[19px] font-bold text-accent">Ваши задания готовы!</p>
                  <ul className="mt-2 space-y-1 text-[17px] leading-snug">
                    {quest.quest.tasks.map((task) => (
                      <li key={task.id}>{task.title}: {task.description}</li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[17px] font-semibold">Перейти к заданиям →</p>
                </Link>
              </div>
            )
          }

          if (message.authorId === null) {
            return (
              <p key={message.id} className="text-center text-[16px] text-white/85">
                {message.body} · {message.at}
              </p>
            )
          }

          const mine = message.authorId === profile?.id
          const picture = chatImageUrl(message.body)
          return (
            <div
              key={message.id}
              onPointerDown={() => { if (!mine) holdStart(message) }}
              onPointerUp={holdEnd}
              onPointerLeave={holdEnd}
              onContextMenu={(e) => { if (!mine) { e.preventDefault(); setReported(message) } }}
              className={`animate-message flex ${mine ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[78%] rounded-[22px] px-4 py-3 ${
                  mine ? 'bg-accent text-white' : 'bg-bubble text-bg'}`}
              >
                {!mine && (
                  <p className="text-[17px] font-bold text-accent-2">{message.authorName}</p>
                )}
                {picture ? (
                  <a href={picture} target="_blank" rel="noreferrer" className="block">
                    <img
                      src={picture} alt="Снимок в чате" loading="lazy"
                      className="max-h-64 w-full rounded-[16px] object-cover"
                    />
                  </a>
                ) : (
                  <p className="text-[17px] leading-snug">{message.body}</p>
                )}
                <p className={`mt-1 text-right text-[13px] ${mine ? 'text-white/70' : 'text-bg/50'}`}>
                  {message.at}
                </p>
              </div>
            </div>
          )
        })}

        <div ref={bottom} />
      </div>

      {event && (event.status === 'finished' || event.status === 'cancelled') ? (
        <p className="px-4 pb-5 pt-3 text-center text-[16px] text-muted">
          {event.status === 'cancelled' ? 'Ивент отменён' : 'Ивент завершён'} — чат доступен
          только для чтения
        </p>
      ) : (
      <div className="px-4 pb-4 pt-2">
        {emojiOpen && (
          <div className="animate-sheet mb-2 grid grid-cols-8 gap-1 rounded-[22px] bg-surface-2 p-2">
            {EMOJI.map((symbol) => (
              <button
                key={symbol} aria-label={symbol}
                onClick={() => setDraft((text) => (text + symbol).slice(0, 500))}
                className="grid h-10 place-items-center rounded-xl text-[22px] active:bg-surface-3"
              >
                {symbol}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          <input
            ref={filePicker} type="file" accept="image/*" className="hidden"
            onChange={(e) => attach(e.target.files?.[0])}
          />

          <label className="flex flex-1 items-center gap-2.5 rounded-full bg-[#312B4B] px-4 py-3.5">
            <button
              type="button" aria-label="Прикрепить фото" disabled={uploading}
              onClick={() => filePicker.current?.click()}
              className="shrink-0 text-muted disabled:opacity-50"
            >
              <ClipIcon className="size-6" />
            </button>
            <input
              autoComplete="off" data-1p-ignore data-lpignore="true"
              value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder={uploading ? 'Отправляем фото…' : 'Начните писать...'}
              maxLength={500} aria-label="Сообщение"
              className="min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted"
            />
            <button
              type="button" aria-label="Смайлики"
              onClick={() => setEmojiOpen((open) => !open)}
              className={`shrink-0 text-[22px] leading-none ${emojiOpen ? '' : 'opacity-70'}`}
            >
              🙂
            </button>
          </label>

          <button
            onClick={() => send()} disabled={sending || uploading || !draft.trim()}
            aria-label="Отправить"
            className="grid size-12 shrink-0 place-items-center rounded-full bg-accent
                       text-[22px] font-bold text-white disabled:opacity-40"
          >
            ↑
          </button>
        </div>
      </div>
      )}

      {reportSheet}
    </div>
  )
}
