import { db, isLive } from './supabase'
import { DEFAULT_CITY, cityCenter } from '../data/cities'
import type { Venue } from '../data/venues'
import {
  EVENTS, MESSAGES, CATEGORIES,
  type CategoryCode, type ChatMessage, type Participant, type Quest, type QuestTask,
  type QuestaEvent, type TaskType,
} from '../data/demo'

// Доступ к данным. Каждая функция умеет работать и с базой, и с
// демонстрационным набором — какой режим включён, решает src/lib/supabase.ts.

type Row = Record<string, any>

/**
 * Выполненные задания в демонстрационном режиме. Хранятся в памяти вкладки:
 * базы в этом режиме нет, но пройти квест и увидеть, как растут очки, должно
 * быть можно — иначе страховочный режим бесполезен для показа.
 */
const demoCompleted = new Map<string, number>()

const EVENT_QUERY = `
  id, title, description, cover_url, address, lat, lng, starts_at,
  min_participants, max_participants, status, chat_opened_at, organizer_id,
  category:interest (code),
  event_participant (
    user_id, role, checked_in_at,
    app_user (nickname, avatar_url, average_rating)
  )
`

/** Строка из базы в вид, который ждут экраны. */
function toEvent (row: Row, viewerId: string | null): QuestaEvent {
  const participants: Participant[] = (row.event_participant ?? []).map((item: Row) => ({
    id: item.user_id,
    nickname: item.app_user?.nickname ?? 'Участник',
    avatarUrl: item.app_user?.avatar_url ?? undefined,
    role: item.role,
    qpEarned: 0,                         // заполняется из выполненных заданий
    checkedIn: Boolean(item.checked_in_at),
    rating: Number(item.app_user?.average_rating ?? 0),
  }))

  const mine = participants.find((person) => person.id === viewerId)

  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    coverUrl: row.cover_url ?? undefined,
    category: (row.category?.code ?? 'other') as CategoryCode,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    startsAt: row.starts_at,
    minParticipants: row.min_participants,
    maxParticipants: row.max_participants,
    status: row.status,
    qpReward: 180,
    myRole: mine?.role ?? 'guest',
    chatOpened: Boolean(row.chat_opened_at),
    participants,
  }
}

export async function listEvents (viewerId: string | null): Promise<QuestaEvent[]> {
  if (!isLive) return EVENTS

  const { data, error } = await db()
    .from('event').select(EVENT_QUERY)
    .in('status', ['active', 'in_progress', 'finished', 'cancelled'])
    .order('starts_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row) => toEvent(row, viewerId))
}

export async function getEvent (id: string, viewerId: string | null): Promise<QuestaEvent | null> {
  if (!isLive) return EVENTS.find((event) => event.id === id) ?? null

  const { data, error } = await db().from('event').select(EVENT_QUERY).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? toEvent(data, viewerId) : null
}

export interface NewEvent {
  title: string
  description: string
  address: string
  lat: number
  lng: number
  startsAt: string
  minParticipants: number
  maxParticipants: number
  category: CategoryCode
  chatMode: 'auto' | 'manual'
  coverUrl?: string
  /** Интересы организатора — часть контекста, который уходит в модель. */
  interests?: string[]
}

/** Задание в том виде, в каком его возвращает функция генерации. */
interface GeneratedTask {
  type: TaskType
  title: string
  description: string
  qp_reward: number
  is_shared: boolean
  params: Record<string, unknown>
}

/**
 * Создание ивента (ЧТЗ 5.5). Автор сразу становится организатором и
 * участником, а ивенту подбирается квест — пока из коллекции шаблонов.
 */
/** Недельная квота на создание ивентов (ЧТЗ 4.1). */
export const WEEKLY_EVENT_LIMIT = 2

/**
 * Квота временно снята на время отладки: проверить сценарии «создал —
 * начал — завершил» два раза в неделю невозможно. Чтобы вернуть
 * ограничение из ЧТЗ, достаточно поставить здесь true — остальной код
 * менять не нужно.
 */
export const WEEKLY_LIMIT_ENABLED = false

/**
 * Сколько ивентов осталось создать на этой неделе.
 *
 * Считаются созданные, а не действующие: иначе «создал — отменил — создал
 * заново» обходило бы квоту, и ограничение не защищало бы ни от чего.
 */
export async function eventsLeftThisWeek (userId: string): Promise<number> {
  if (!isLive || !WEEKLY_LIMIT_ENABLED) return WEEKLY_EVENT_LIMIT

  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const { count } = await db()
    .from('event').select('id', { count: 'exact', head: true })
    .eq('organizer_id', userId).gte('created_at', weekAgo)

  return Math.max(0, WEEKLY_EVENT_LIMIT - (count ?? 0))
}

export async function createEvent (input: NewEvent, organizerId: string): Promise<string> {
  if (!isLive) return 'dnd'

  const client = db()

  if (WEEKLY_LIMIT_ENABLED && await eventsLeftThisWeek(organizerId) === 0) {
    throw new Error(
      `За неделю можно создать не больше ${WEEKLY_EVENT_LIMIT} ивентов. `
      + 'Квота освободится, когда пройдёт неделя с момента создания предыдущих.',
    )
  }

  const { data: category } = await client
    .from('interest').select('id').eq('code', input.category).single()

  const { data: event, error } = await client.from('event').insert({
    organizer_id: organizerId,
    title: input.title,
    description: input.description || null,
    cover_url: input.coverUrl ?? null,
    category_id: category!.id,
    address: input.address,
    lat: input.lat,
    lng: input.lng,
    starts_at: input.startsAt,
    min_participants: input.minParticipants,
    max_participants: input.maxParticipants,
    chat_mode: input.chatMode,
  }).select('id').single()

  if (error) throw error

  await client.from('event_participant')
    .insert({ event_id: event.id, user_id: organizerId, role: 'organizer' })

  // Квест сперва пробуем сгенерировать по контексту встречи (ТЗ 4.2.6);
  // если модель недоступна или её ответ не прошёл проверку — берём шаблон.
  const generated = await generateQuest(input)
  if (generated) {
    await saveQuest(event.id, 'ai', null, generated)
  } else {
    await buildQuestFromTemplate(event.id, category!.id)
  }

  return event.id
}

/**
 * Обращение к функции генерации на стороне Supabase. Ключ модели лежит там,
 * в приложение он не попадает. Ошибка здесь не срывает создание ивента —
 * возвращаем null, и вызывающий код берёт шаблон.
 */
async function generateQuest (input: NewEvent): Promise<GeneratedTask[] | null> {
  try {
    const { data, error } = await db().functions.invoke('generate-quest', {
      body: {
        title: input.title,
        description: input.description,
        category: input.category,
        address: input.address,
        participants: input.maxParticipants,
        interests: input.interests ?? [],
      },
    })

    if (error || !Array.isArray(data?.tasks) || data.tasks.length !== 3) return null
    return data.tasks as GeneratedTask[]
  } catch {
    return null
  }
}

/** Запись квеста и трёх его заданий в базу. */
async function saveQuest (
  eventId: string,
  source: 'ai' | 'template',
  templateId: string | null,
  tasks: GeneratedTask[],
): Promise<void> {
  const client = db()

  const { data: quest, error } = await client
    .from('quest').insert({ event_id: eventId, template_id: templateId, source })
    .select('id').single()

  if (error) throw error

  await client.from('task').insert(tasks.map((task, index) => ({
    quest_id: quest.id,
    position: index + 1,
    type: task.type,
    title: task.title,
    description: task.description,
    qp_reward: task.qp_reward,
    is_shared: task.is_shared,
    params: task.params,
  })))
}

/** Подбор случайного шаблона под категорию ивента (ЧТЗ 5.10). */
async function buildQuestFromTemplate (eventId: string, categoryId: number) {
  const client = db()

  const { data: templates } = await client
    .from('quest_template').select('id').eq('category_id', categoryId)

  if (!templates?.length) return

  const template = templates[Math.floor(Math.random() * templates.length)]

  const { data: tasks } = await client
    .from('task_template').select('*').eq('quest_template_id', template.id).order('position')

  if (!tasks?.length) return

  await saveQuest(eventId, 'template', template.id, tasks as GeneratedTask[])
}

/**
 * Текст системного сообщения о готовом квесте (ЧТЗ 5.8). Вынесен в константу,
 * потому что по нему чат узнаёт это сообщение и рисует вместо строки карточку
 * со списком заданий.
 */
export const QUEST_READY = 'Квесты доступны! Проверьте задания ↓'

/**
 * Снимок в чате — обычное сообщение, телом которого стала ссылка на файл в
 * хранилище. Отдельного вида сообщений для этого заводить не пришлось:
 * ссылку узнаём по адресу хранилища, а всё остальное остаётся текстом.
 */
const CHAT_IMAGE = /^https:\/\/\S+\/storage\/v1\/object\/public\/media\/\S+\.(jpe?g|png|webp)$/i

export function chatImageUrl (body: string): string | null {
  return CHAT_IMAGE.test(body.trim()) ? body.trim() : null
}

export async function joinEvent (eventId: string, userId: string): Promise<void> {
  if (!isLive) return
  const client = db()

  const { error } = await client.from('event_participant')
    .insert({ event_id: eventId, user_id: userId, role: 'participant' })
  if (error) throw error

  const { data: event } = await client
    .from('event').select('title, organizer_id').eq('id', eventId).single()

  if (event && event.organizer_id !== userId) {
    await notify(
      [event.organizer_id], 'join',
      'Заявка на участие',
      `Кто-то присоединился к ивенту «${event.title}»`,
      eventId,
    )
  }

  // Чат при наборе группы открывает сама база (триггер open_chat_after_join
  // из 003_chat_triggers.sql). Из приложения это сделать нельзя: менять
  // строку ивента разрешено только организатору, а группу добирает участник.
}

/**
 * Открытие чата кнопкой организатора (ручной режим, ЧТЗ 5.7).
 *
 * Здесь только отметка времени. Приветственное сообщение, объявление о
 * квесте и уведомления участникам развесит триггер announce_event_change:
 * иначе они уходили бы по разу на каждое нажатие и на каждый вход в ивент.
 */
export async function openChat (eventId: string): Promise<void> {
  if (!isLive) return

  const { error } = await db().from('event')
    .update({ chat_opened_at: new Date().toISOString() })
    .eq('id', eventId).is('chat_opened_at', null)

  if (error) throw error
}

export async function leaveEvent (eventId: string, userId: string): Promise<void> {
  if (!isLive) return
  const { error } = await db().from('event_participant')
    .delete().eq('event_id', eventId).eq('user_id', userId)
  if (error) throw error
}

/**
 * Отмена ивента организатором (ЧТЗ 5.13, триггер 3). Возможна только до
 * начала: после него ивент уже не отменяют, а завершают, иначе у людей
 * пропадала бы из истории встреча, которая состоялась.
 *
 * Ивент не удаляется, а получает состояние «Отменён»: участникам нужно
 * узнать, что встречи не будет, а не обнаружить пустоту на её месте.
 */
export async function cancelEvent (
  eventId: string, organizerId: string, reason: string,
): Promise<void> {
  if (!isLive) return
  const client = db()

  const { data: event } = await client
    .from('event').select('title, starts_at, status').eq('id', eventId).single()

  if (!event) throw new Error('Ивент не найден')
  if (event.status !== 'active') throw new Error('Отменить можно только ивент, который ещё не начался')
  if (new Date(event.starts_at).getTime() <= Date.now()) {
    throw new Error('Ивент уже начался — его можно только завершить')
  }

  // Причина сохраняется у ивента: из неё триггер соберёт и сообщение в
  // чат, и уведомления участникам.
  const { error } = await client.from('event')
    .update({ status: 'cancelled', cancel_reason: reason })
    .eq('id', eventId).eq('organizer_id', organizerId)
  if (error) throw error
}

/**
 * Запуск ивента организатором (ЧТЗ 4.2.5: «запуск квеста организатором
 * после начала ивента»).
 *
 * Без этого действия ивент навсегда оставался в ожидании, а задания квеста
 * открываются только у начатого — то есть до них нельзя было добраться.
 * Решение за организатором, а не по часам: люди опаздывают, и начинать
 * встречу по таймеру, когда половина ещё в пути, неправильно.
 */
export async function startEvent (eventId: string, organizerId: string): Promise<void> {
  if (!isLive) return
  const client = db()

  const { error } = await client.from('event')
    .update({ status: 'in_progress' })
    .eq('id', eventId).eq('organizer_id', organizerId).eq('status', 'active')
  if (error) throw error

  // Чат мог быть ещё не открыт — например, при ручном режиме.
  await openChat(eventId).catch(() => {})

  // Сообщение «Ивент начался» и уведомления участникам ставит триггер:
  // системные сообщения приложению писать нечем — у них нет автора.
}

/**
 * Завершение ивента организатором (ЧТЗ 5.13, триггер 1). Сообщение в чат и
 * приглашение оценить друг друга рассылает триггер announce_event_change.
 */
export async function finishEvent (eventId: string, organizerId: string): Promise<void> {
  if (!isLive) return

  const { error } = await db().from('event')
    .update({ status: 'finished' })
    .eq('id', eventId).eq('organizer_id', organizerId)
    .in('status', ['active', 'in_progress'])

  if (error) throw error
}

// ──────────────────────────── жалобы ─────────────────────────────────

/**
 * Причины жалоб (ЧТЗ 5.17). Список закрытый: свободное поле заставляет
 * человека формулировать, а модератора — читать, и жалобы просто не пишут.
 * Подробности можно добавить комментарием.
 */
export const COMPLAINT_REASONS = [
  'Спам или реклама',
  'Оскорбления и грубость',
  'Обман или мошенничество',
  'Неприемлемый контент',
  'Небезопасное поведение',
  'Другое',
]

export async function fileComplaint (
  { authorId, targetUserId, targetEventId, targetMessageId, reason, comment }: {
    authorId: string
    targetUserId?: string
    targetEventId?: string
    targetMessageId?: string
    reason: string
    comment?: string
  },
): Promise<void> {
  if (!isLive) return

  const { error } = await db().from('complaint').insert({
    author_id: authorId,
    target_user_id: targetUserId ?? null,
    target_event_id: targetEventId ?? null,
    target_message_id: targetMessageId ?? null,
    reason,
    comment: comment?.trim() || null,
  })

  if (error) throw error
}

// ─────────────────── итоги ивента и взаимные оценки ───────────────────

/** Оценки, которые текущий пользователь уже поставил на этом ивенте. */
export interface GivenRating {
  /** null — оценка самого ивента, а не участника. */
  targetUserId: string | null
  score: number
}

const demoRatings = new Map<string, number>()

export async function listMyRatings (
  eventId: string, authorId: string,
): Promise<GivenRating[]> {
  if (!isLive) {
    return [...demoRatings.entries()].map(([target, score]) => ({
      targetUserId: target === 'event' ? null : target,
      score,
    }))
  }

  const { data } = await db().from('rating')
    .select('target_user_id, score').eq('event_id', eventId).eq('author_id', authorId)

  return (data ?? []).map((row) => ({
    targetUserId: row.target_user_id, score: row.score,
  }))
}

/**
 * Оценка участника или самого ивента (ЧТЗ 5.14). Средний балл человека
 * пересчитывает база — приложению чужую строку менять не разрешено.
 *
 * Оценка ставится один раз: повторная попытка не ошибка, а просто
 * ничего не меняет, поэтому конфликт по уникальности гасим здесь.
 */
export async function rateUser (
  { eventId, authorId, targetUserId, score, comment }: {
    eventId: string
    authorId: string
    targetUserId: string | null
    score: number
    comment?: string
  },
): Promise<void> {
  if (!isLive) {
    demoRatings.set(targetUserId ?? 'event', score)
    return
  }

  const { error } = await db().from('rating').insert({
    event_id: eventId,
    author_id: authorId,
    target_user_id: targetUserId,
    score,
    comment: comment?.trim() || null,
  })

  if (error && !error.message.includes('duplicate key')) throw error
}

/** Чек-ин по геолокации: +50 XP и системное сообщение в чат (ЧТЗ 5.9). */
export async function checkIn (eventId: string, userId: string): Promise<void> {
  if (!isLive) return
  const client = db()

  const { error } = await client.from('event_participant')
    .update({ checked_in_at: new Date().toISOString() })
    .eq('event_id', eventId).eq('user_id', userId)
  if (error) throw error

  // Об отметке объявит в чате триггер announce_check_in: системное
  // сообщение приложение отправить не может, у него нет автора.
  await client.from('exp_transaction').insert({
    user_id: userId, amount: 50, reason: 'checkin',
    event_key: `checkin:${eventId}:${userId}`,
  })
}

export interface QuestState {
  quest: Quest | null
  /** Сколько QP заработал каждый участник — для таблицы лидеров. */
  earned: Record<string, number>
}

export async function getQuest (eventId: string, viewerId: string | null): Promise<QuestState> {
  if (!isLive) {
    const event = EVENTS.find((item) => item.id === eventId)
    const quest = event?.quest
      ? {
          ...event.quest,
          tasks: event.quest.tasks.map((task) => ({
            ...task,
            completed: demoCompleted.has(task.id),
            awardedQp: demoCompleted.get(task.id),
          })),
        }
      : null

    const earned = Object.fromEntries(
      (event?.participants ?? []).map((person) => [person.id, person.qpEarned]),
    )
    // В демонстрационном режиме свои очки считаются по пройденным здесь же
    // заданиям, но пока ничего не пройдено, показываем заготовленный результат.
    if (demoCompleted.size > 0) {
      earned[viewerId ?? 'me'] = [...demoCompleted.values()].reduce((sum, qp) => sum + qp, 0)
    }

    return { quest, earned }
  }

  const client = db()

  const { data: quest } = await client
    .from('quest').select('id, source, task (*)').eq('event_id', eventId).maybeSingle()

  if (!quest) return { quest: null, earned: {} }

  const taskIds = (quest.task ?? []).map((task: Row) => task.id)
  const { data: completions } = await client
    .from('task_completion').select('task_id, user_id, qp_awarded').in('task_id', taskIds)

  const earned: Record<string, number> = {}
  for (const row of completions ?? []) {
    earned[row.user_id] = (earned[row.user_id] ?? 0) + row.qp_awarded
  }

  const mine = new Map(
    (completions ?? [])
      .filter((row) => row.user_id === viewerId)
      .map((row) => [row.task_id, row.qp_awarded]),
  )

  const tasks: QuestTask[] = (quest.task ?? [])
    .sort((a: Row, b: Row) => a.position - b.position)
    .map((task: Row) => ({
      id: task.id,
      position: task.position,
      type: task.type as TaskType,
      title: task.title,
      description: task.description,
      qpReward: task.qp_reward,
      isShared: task.is_shared,
      completed: mine.has(task.id),
      awardedQp: mine.get(task.id),
      params: task.params ?? {},
      questions: (task.params?.questions ?? []).map((item: Row) => ({
        question: item.question,
        options: item.options,
        correctIndex: item.correct_index,
      })),
    }))

  return {
    quest: { title: 'Квест ивента', source: quest.source, tasks },
    earned,
  }
}

/**
 * Зачёт задания: запись о выполнении, начисление QP и XP, системное
 * сообщение в чат (ЧТЗ 5.11, 5.12).
 */
export async function completeTask (
  { task, userId, qpAwarded, photoUrl, answer }: {
    task: QuestTask
    userId: string
    qpAwarded: number
    photoUrl?: string
    answer?: unknown
  },
): Promise<void> {
  if (!isLive) {
    demoCompleted.set(task.id, qpAwarded)
    return
  }

  const client = db()

  const { error } = await client.from('task_completion').insert({
    task_id: task.id,
    user_id: userId,
    qp_awarded: qpAwarded,
    photo_url: photoUrl ?? null,
    answer: answer ?? null,
  })
  if (error) throw error

  // Сообщение в чат о выполненном задании и уведомления остальным ставит
  // триггер announce_task_completion: у системных сообщений нет автора, и
  // из приложения они не проходят проверку доступа.
  await Promise.all([
    client.from('qp_transaction').insert({
      user_id: userId, amount: qpAwarded, reason: `task:${task.type}`,
      event_key: `qp:${task.id}:${userId}`,
    }),
    client.from('exp_transaction').insert({
      user_id: userId, amount: 10, reason: 'task',
      event_key: `xp:${task.id}:${userId}`,
    }),
  ])
}

// ────────────────────────────── уведомления ─────────────────────────────

export interface Notification {
  id: string
  type: string
  title: string
  body: string | null
  eventId?: string
  isRead: boolean
  at: string
}

/** Складывает уведомление в центр уведомлений получателям (ЧТЗ 5.16). */
async function notify (
  userIds: string[],
  type: string,
  title: string,
  body: string,
  eventId?: string,
): Promise<void> {
  if (!isLive || userIds.length === 0) return

  // Уведомление — не главное в действии, ради которого его отправляют:
  // если оно не запишется, присоединение или зачёт задания не должны падать.
  try {
    await db().from('notification').insert(userIds.map((userId) => ({
      user_id: userId,
      type,
      title,
      body,
      payload: eventId ? { event_id: eventId } : {},
    })))
  } catch {
    // намеренно тихо
  }
}

export async function listNotifications (userId: string): Promise<Notification[]> {
  if (!isLive) return []

  const { data, error } = await db()
    .from('notification')
    .select('id, type, title, body, payload, is_read, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw error

  return (data ?? []).map((row: Row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    eventId: row.payload?.event_id,
    isRead: row.is_read,
    at: new Date(row.created_at).toLocaleString('ru-RU', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    }),
  }))
}

export async function countUnread (userId: string): Promise<number> {
  if (!isLive) return 0

  const { count } = await db()
    .from('notification').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('is_read', false)

  return count ?? 0
}

/** Открытие центра уведомлений помечает всё прочитанным (ЧТЗ 5.8, 5.16). */
export async function markNotificationsRead (userId: string): Promise<void> {
  if (!isLive) return
  await db().from('notification').update({ is_read: true })
    .eq('user_id', userId).eq('is_read', false)
}

// ───────────────────────────────── чат ──────────────────────────────────

export async function listMessages (eventId: string): Promise<ChatMessage[]> {
  if (!isLive) return MESSAGES.filter((message) => message.eventId === eventId)

  const { data, error } = await db()
    .from('chat_message')
    .select('id, event_id, user_id, kind, body, created_at, app_user (nickname, avatar_url)')
    .eq('event_id', eventId).order('created_at')

  if (error) throw error
  return (data ?? []).map(toMessage)
}

function toMessage (row: Row): ChatMessage {
  return {
    id: row.id,
    eventId: row.event_id,
    authorId: row.kind === 'system' ? null : row.user_id,
    authorName: row.app_user?.nickname,
    authorAvatar: row.app_user?.avatar_url ?? undefined,
    body: row.body,
    at: new Date(row.created_at).toLocaleTimeString('ru-RU', {
      hour: '2-digit', minute: '2-digit',
    }),
    createdAt: row.created_at,
  }
}

export async function sendMessage (eventId: string, userId: string, body: string): Promise<void> {
  if (!isLive) return
  const { error } = await db().from('chat_message')
    .insert({ event_id: eventId, user_id: userId, kind: 'text', body })
  if (error) throw error
}

/** Подписка на новые сообщения ивента — это и есть «чат в реальном времени». */
export function subscribeMessages (
  eventId: string,
  onMessage: (message: ChatMessage) => void,
): () => void {
  if (!isLive) return () => {}

  const client = db()
  const channel = client
    .channel(`chat:${eventId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_message', filter: `event_id=eq.${eventId}` },
      async ({ new: row }) => {
        // В событии приходит только сама строка, без имени автора — дочитываем.
        const author = (row as Row).user_id
        let profile: Row | null = null
        if (author) {
          const { data } = await client
            .from('app_user').select('nickname, avatar_url').eq('id', author).maybeSingle()
          profile = data
        }
        onMessage(toMessage({ ...(row as Row), app_user: profile }))
      },
    )
    .subscribe()

  return () => { client.removeChannel(channel) }
}

export function categoryCodes (): CategoryCode[] {
  return CATEGORIES.map((category) => category.code)
}

/**
 * Адрес → координаты. В ТЗ 11.1 для этого указан Geocoder Яндекса, он требует
 * платного ключа; в прототипе работает открытый Nominatim. Если адрес не
 * распознан, ставим центр города, чтобы создание ивента не срывалось.
 */
export async function geocode (
  address: string, city?: string | null,
): Promise<[number, number]> {
  const fallback = cityCenter(city)
  try {
    const query = encodeURIComponent(`${address}, ${city ?? DEFAULT_CITY.name}`)
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
      { headers: { 'Accept-Language': 'ru' } },
    )
    if (!response.ok) return fallback

    const found = await response.json()
    if (!found?.[0]) return fallback
    return [Number(found[0].lat), Number(found[0].lon)]
  } catch {
    return fallback
  }
}

/**
 * Поиск места по названию в пределах города. Нужен там, где готового списка
 * не хватает: своё кафе, двор или незнакомый город, которого в подборке нет.
 * Ответ приводится к тому же виду, что и места из подборки, — экрану всё
 * равно, откуда пришла точка.
 */
export async function searchPlaces (
  query: string, city?: string | null,
): Promise<Venue[]> {
  const text = query.trim()
  if (text.length < 3) return []

  try {
    const request = encodeURIComponent(`${text}, ${city ?? DEFAULT_CITY.name}`)
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${request}&format=json&limit=6&addressdetails=1`,
      { headers: { 'Accept-Language': 'ru' } },
    )
    if (!response.ok) return []

    const found: unknown[] = await response.json()

    return found.map((item) => {
      const place = item as {
        display_name: string
        lat: string
        lon: string
        address?: Record<string, string>
      }
      const parts = place.display_name.split(',').map((piece) => piece.trim())
      const details = place.address ?? {}
      const street = [details.road, details.house_number].filter(Boolean).join(', ')

      return {
        title: parts[0] ?? place.display_name,
        address: street || parts.slice(1, 3).join(', '),
        lat: Number(place.lat),
        lng: Number(place.lon),
        emoji: '📍',
      }
    })
  } catch {
    return []
  }
}

/** Координаты → адрес. Нужен, когда точку ставят пальцем на карте. */
export async function reverseGeocode (lat: number, lng: number): Promise<string> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18`,
      { headers: { 'Accept-Language': 'ru' } },
    )
    if (!response.ok) return ''

    const found = await response.json()
    const place = found?.address ?? {}
    const street = [place.road, place.house_number].filter(Boolean).join(', ')

    return street || found?.display_name?.split(',').slice(0, 2).join(',') || ''
  } catch {
    return ''
  }
}

// ───────────────────────── загрузка фотографий ──────────────────────────

/**
 * Кладёт снимок в хранилище и возвращает ссылку на него.
 *
 * Каждый пользователь пишет в свою папку — так устроены правила доступа в
 * supabase/002_photos_and_interests.sql: подменить чужой аватар нельзя.
 */
export async function uploadImage (
  file: File, userId: string, kind: 'avatar' | 'cover' | 'chat',
): Promise<string> {
  if (!isLive) throw new Error('Загрузка недоступна без базы')

  if (file.size > 5 * 1024 * 1024) throw new Error('Файл больше 5 МБ')
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Подойдёт JPEG, PNG или WebP')
  }

  const client = db()
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${userId}/${kind}-${Date.now()}.${extension}`

  const { error } = await client.storage.from('media').upload(path, file, { upsert: true })
  if (error) {
    throw new Error(error.message.includes('Bucket not found')
      ? 'Хранилище ещё не настроено'
      : 'Не удалось загрузить снимок')
  }

  return client.storage.from('media').getPublicUrl(path).data.publicUrl
}

// ───────────────────────── проверка фотографии ──────────────────────────

export interface PhotoVerdict {
  /** Засчитано ли задание. */
  ok: boolean
  /** Что увидела модель — показывается человеку, если не засчитано. */
  reason: string
  /** Проверка не состоялась: модель недоступна или ещё не умеет этого. */
  skipped: boolean
}

/**
 * Проверка снимка моделью (ТЗ 4.2.6, этап 2).
 *
 * Отказ проверки не равен отказу в задании: по ЧТЗ 3.3 в MVP фотография
 * засчитывается по факту загрузки. Поэтому, если модель недоступна или ещё
 * не умеет проверять снимки, задание засчитывается — и это отмечается в
 * ответе, чтобы человек понимал, что произошло.
 */
export async function verifyPhoto (prompt: string, base64: string): Promise<PhotoVerdict> {
  if (!isLive) return { ok: true, reason: '', skipped: true }

  try {
    const { data, error } = await db().functions.invoke('generate-quest', {
      body: { kind: 'photo', prompt, image: base64 },
    })

    if (error || typeof data?.ok !== 'boolean') {
      return { ok: true, reason: '', skipped: true }
    }

    return { ok: data.ok, reason: String(data.reason ?? ''), skipped: false }
  } catch {
    return { ok: true, reason: '', skipped: true }
  }
}
