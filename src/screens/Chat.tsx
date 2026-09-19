import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BackIcon, ClipIcon, SparkIcon } from '../components/icons'
import { Empty, Failed, Loading } from '../components/States'
import { Avatar } from '../components/ui'
import type { ChatMessage } from '../data/demo'
import {
  QUEST_READY, chatImageUrl, fileComplaint, getEvent, getQuest, listMessages,
  markChatRead, sendMessage, subscribeMessages, uploadImage,
} from '../lib/api'
import { ReportSheet } from '../components/ReportSheet'
import { Lightbox } from '../components/Lightbox'
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


/** Разделитель дней: «Сегодня», «Вчера» или дата. */
function DayChip ({ label }: { label: string }) {
  return (
    <span className="mb-3 inline-block rounded-full bg-surface-2 px-3.5 py-1
                     text-[13px] font-semibold text-muted">
      {label}
    </span>
  )
}

/**
 * Сообщение из одних смайликов. Такие показываются крупно и без пузыря —
 * это реакция, и в переписке она читается иначе, чем фраза.
 */
function isEmojiOnly (body: string): boolean {
  const text = body.replace(/\s/gu, '')
  if (!text || text.length > 12) return false
  if (/[\p{L}\p{N}]/u.test(text)) return false
  return /\p{Extended_Pictographic}/u.test(text)
}

function sameDay (a: Date, b: Date) {
  return a.toDateString() === b.toDateString()
}

/**
 * Нужен ли перед сообщением разделитель дня. В демонстрационном режиме у
 * сообщений нет полной даты — тогда разделителей нет вовсе.
 */
function daySeparator (message: ChatMessage, previous?: ChatMessage): string | null {
  if (!message.createdAt) return null

  const date = new Date(message.createdAt)
  if (previous?.createdAt && sameDay(new Date(previous.createdAt), date)) return null

  const now = new Date()
  if (sameDay(date, now)) return 'Сегодня'
  if (sameDay(date, new Date(Date.now() - 86_400_000))) return 'Вчера'

  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

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
  const [zoomed, setZoomed] = useState<string | null>(null)
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

  /**
   * Отметка «прочитано».
   *
   * Ставится и при входе, и на каждое новое сообщение, пока чат открыт:
   * человек его видит прямо сейчас, и оставлять счётчик на карточке
   * встречи неправильно. Время ставит база — часам телефона веры нет.
   */
  useEffect(() => {
    if (!id || !profile) return
    markChatRead(id)
  }, [id, profile?.id, messages.length])

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

  // Список участников для полоски присутствия: организатор идёт первым,
  // как и в карточке встречи.
  const arriving = event?.participants ?? []
  const present = arriving.filter((person) => person.checkedIn).length

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

        {/*
          Кнопка к заданиям появляется, только когда организатор начал
          встречу: до этого вести из чата некуда — заданий ещё нет, и
          неактивная кнопка в углу только сбивала бы с толку.
          Место под неё остаётся занятым, чтобы заголовок не прыгал.
        */}
        {event?.status === 'in_progress' ? (
          <Link
            to={`/event/${id}/quest`} aria-label="Задания квеста"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-accent"
          >
            <SparkIcon className="size-6" />
          </Link>
        ) : (
          <span className="size-10 shrink-0" />
        )}
      </header>

      {event?.status === 'in_progress' && (
        <p className="flex items-center justify-center gap-2 pb-3 text-[17px] font-semibold text-success">
          <span className="size-2.5 rounded-full bg-success" />
          В процессе
        </p>
      )}

      {/*
        Кто уже на месте.
        
        Во время сбора смотрят именно в чат — «я подхожу», «я в пробке», —
        а отметки о присутствии лежали в карточке встречи, куда в этот
        момент никто не заходит. Здесь они рядом с перепиской: зелёный
        ободок у тех, кто отметился, приглушённый — у остальных.
      */}
      {arriving.length > 0 && (
        <div className="flex items-center gap-2 px-4 pb-3">
          <span className="text-[14px] text-muted">
            На месте {present} из {arriving.length}
          </span>
          <span className="flex items-center">
            {arriving.slice(0, 6).map((person, index) => (
              <span
                key={person.id}
                className={`${index > 0 ? '-ml-2' : ''} rounded-full ${
                  person.checkedIn ? 'ring-2 ring-success' : 'opacity-45 ring-2 ring-surface'}`}
              >
                <Avatar name={person.nickname} src={person.avatarUrl} size={26} />
              </span>
            ))}
          </span>
        </div>
      )}

      <div className="no-scrollbar flex-1 overflow-y-auto px-4 pb-2">
        {loading && <Loading label="Загружаем переписку…" />}
        {error && <Failed message={error} />}

        {!loading && !error && messages.length === 0 && (
          <Empty label="Пока тихо. Напишите первым — например, где именно встречаемся." />
        )}

        {messages.map((message, index) => {
          const previous = messages[index - 1]
          const next = messages[index + 1]

          // Подряд идущие сообщения одного человека — одна группа: имя
          // пишется один раз сверху, аватар стоит у последнего в группе,
          // а сами пузыри прижимаются друг к другу.
          const sameAsPrevious = Boolean(
            previous && previous.authorId && previous.authorId === message.authorId,
          )
          const sameAsNext = Boolean(
            next && next.authorId && next.authorId === message.authorId,
          )
          const separator = daySeparator(message, previous)
          const gap = separator ? '' : sameAsPrevious ? 'mt-1' : 'mt-3'

          // Объявление о квесте — такое же системное сообщение, как остальные,
          // но показывается карточкой со списком заданий.
          // Карточка с заданиями показывается, только когда встреча идёт:
          // до этого открыть задания всё равно нельзя, и большая плашка в
          // переписке за два дня до встречи только сбивала с толку.
          if (message.authorId === null && message.body === QUEST_READY
              && quest?.quest && event?.status === 'in_progress') {
            return (
              // Подписи над карточкой нет: строкой выше уже стоит системное
              // «Ивент начался! Задания квеста доступны ↓», и вторая такая же
              // фраза подряд выглядела повтором.
              <div key={message.id} className="animate-message pt-3">
                <Link to={`/event/${id}/quest`} className="block rounded-[22px] bg-surface-2 p-4">
                  <p className="flex items-center gap-1.5 text-[19px] font-bold text-accent">
                    <SparkIcon className="size-4 shrink-0" />
                    {quest.quest.source === 'ai' ? 'ИИ придумал задания' : 'Ваши задания готовы!'}
                  </p>
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
              <div key={message.id} className={`flex flex-col items-center ${gap}`}>
                {separator && <DayChip label={separator} />}
                <span className="rounded-full bg-surface-2 px-3.5 py-1.5 text-center text-[14px]
                                 leading-snug text-muted">
                  {message.body} · {message.at}
                </span>
              </div>
            )
          }

          const mine = message.authorId === profile?.id
          const picture = chatImageUrl(message.body)
          const bigEmoji = isEmojiOnly(message.body)

          // Уголок у пузыря скруглён меньше — и только у последнего в
          // группе: получается «хвостик», как в мессенджерах.
          const tail = sameAsNext ? '' : mine ? 'rounded-br-md' : 'rounded-bl-md'

          return (
            <div key={message.id} className={gap}>
              {separator && (
                <div className="flex justify-center pb-3"><DayChip label={separator} /></div>
              )}

              <div
                onPointerDown={() => { if (!mine) holdStart(message) }}
                onPointerUp={holdEnd}
                onPointerLeave={holdEnd}
                onContextMenu={(e) => { if (!mine) { e.preventDefault(); setReported(message) } }}
                className={`animate-message flex items-end gap-2 ${
                  mine ? 'justify-end' : 'justify-start'}`}
              >
                {/* Аватар — у последнего сообщения группы; выше место под
                    него остаётся пустым, чтобы пузыри стояли по одной линии. */}
                {!mine && (sameAsNext
                  ? <span className="size-8 shrink-0" />
                  : (
                    <Link
                      to={`/user/${message.authorId}`} className="shrink-0"
                      aria-label={`Профиль: ${message.authorName ?? 'участник'}`}
                    >
                      <Avatar
                        name={message.authorName ?? 'Участник'} src={message.authorAvatar} size={32}
                      />
                    </Link>
                  ))}

                <div
                  className={`max-w-[76%] ${bigEmoji
                    ? 'pb-1'
                    : `rounded-[20px] ${tail} ${picture ? 'p-1' : 'px-3.5 py-2.5'} ${
                        mine ? 'bg-accent text-white' : 'bg-bubble text-bg'}`}`}
                >
                  {!mine && !sameAsPrevious && !picture && (
                    <p className="text-[15px] font-bold text-accent-2">{message.authorName}</p>
                  )}

                  {picture ? (
                    <a href={picture} target="_blank" rel="noreferrer" className="relative block">
                      <img
                        src={picture} alt="Снимок в чате" loading="lazy"
                        className="max-h-72 w-full rounded-[17px] object-cover"
                      />
                      <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5
                                       text-[12px] text-white">
                        {message.at}
                      </span>
                    </a>
                  ) : bigEmoji ? (
                    // Сообщение из одних смайликов пузыря не просит: без
                    // подложки оно читается как реакция, а не как реплика.
                    <p className={`text-[40px] leading-tight ${mine ? 'text-right' : ''}`}>
                      {message.body}
                      <span className="ml-2 align-middle text-[12px] text-muted">{message.at}</span>
                    </p>
                  ) : (
                    <p className="whitespace-pre-wrap text-[17px] leading-snug">
                      {message.body}
                      {/* Время встаёт в конец последней строки, а если она
                          длинная — переносится вместе с ним, не ломая пузырь. */}
                      <span
                        className={`ml-2 inline-block translate-y-0.5 text-[12px] ${
                          mine ? 'text-white/70' : 'text-bg/45'}`}
                      >
                        {message.at}
                      </span>
                    </p>
                  )}
                </div>
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

      {zoomed && <Lightbox src={zoomed} onClose={() => setZoomed(null)} />}
    </div>
  )
}
