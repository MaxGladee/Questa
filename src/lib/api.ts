import { db, isLive } from './supabase'
import {
  EVENTS, MESSAGES, CATEGORIES,
  type CategoryCode, type ChatMessage, type Participant, type Quest, type QuestTask,
  type QuestaEvent, type TaskType,
} from '../data/demo'

// Доступ к данным. Каждая функция умеет работать и с базой, и с
// демонстрационным набором — какой режим включён, решает src/lib/supabase.ts.

type Row = Record<string, any>

const EVENT_QUERY = `
  id, title, description, cover_url, address, lat, lng, starts_at,
  min_participants, max_participants, status, chat_opened_at, organizer_id,
  category:interest (code),
  event_participant (
    user_id, role, checked_in_at,
    app_user (nickname, avatar_url)
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
  }))

  const mine = participants.find((person) => person.id === viewerId)

  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    coverUrl: row.cover_url ?? `${import.meta.env.BASE_URL}art/cover-karaoke.jpg`,
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
    .in('status', ['active', 'in_progress'])
    .order('starts_at')

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
export async function createEvent (input: NewEvent, organizerId: string): Promise<string> {
  if (!isLive) return 'dnd'

  const client = db()

  const { data: category } = await client
    .from('interest').select('id').eq('code', input.category).single()

  const { data: event, error } = await client.from('event').insert({
    organizer_id: organizerId,
    title: input.title,
    description: input.description || null,
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

export async function joinEvent (eventId: string, userId: string): Promise<void> {
  if (!isLive) return
  const client = db()

  const { error } = await client.from('event_participant')
    .insert({ event_id: eventId, user_id: userId, role: 'participant' })
  if (error) throw error

  await openChatIfGroupComplete(eventId)
}

/**
 * Чат открывается сам, как только занято минимальное число слотов, — но
 * только если организатор выбрал автоматический режим (ЧТЗ 5.7, шаг 6).
 * В ручном режиме он ждёт кнопки организатора.
 */
async function openChatIfGroupComplete (eventId: string): Promise<void> {
  const client = db()

  const { data: event } = await client
    .from('event').select('min_participants, chat_mode, chat_opened_at').eq('id', eventId).single()

  if (!event || event.chat_opened_at || event.chat_mode !== 'auto') return

  const { count } = await client
    .from('event_participant').select('id', { count: 'exact', head: true }).eq('event_id', eventId)

  if ((count ?? 0) < event.min_participants) return

  await openChat(eventId)
}

/** Открытие чата: и автоматическое, и по кнопке организатора. */
export async function openChat (eventId: string): Promise<void> {
  if (!isLive) return
  const client = db()

  const { error } = await client.from('event')
    .update({ chat_opened_at: new Date().toISOString() })
    .eq('id', eventId).is('chat_opened_at', null)

  if (error) throw error

  await client.from('chat_message').insert({
    event_id: eventId, user_id: null, kind: 'system', body: 'Группа набрана, чат создан',
  })

  // Квест подобран ещё при создании ивента, но объявить о нём можно только
  // теперь — до открытия чата сообщению было некуда прийти.
  const { data: quest } = await client
    .from('quest').select('id').eq('event_id', eventId).maybeSingle()

  if (quest) {
    await client.from('chat_message').insert({
      event_id: eventId, user_id: null, kind: 'system', body: QUEST_READY,
    })
  }
}

export async function leaveEvent (eventId: string, userId: string): Promise<void> {
  if (!isLive) return
  const { error } = await db().from('event_participant')
    .delete().eq('event_id', eventId).eq('user_id', userId)
  if (error) throw error
}

/** Чек-ин по геолокации: +50 XP и системное сообщение в чат (ЧТЗ 5.9). */
export async function checkIn (eventId: string, userId: string, nickname: string): Promise<void> {
  if (!isLive) return
  const client = db()

  const { error } = await client.from('event_participant')
    .update({ checked_in_at: new Date().toISOString() })
    .eq('event_id', eventId).eq('user_id', userId)
  if (error) throw error

  await client.from('exp_transaction').insert({
    user_id: userId, amount: 50, reason: 'checkin',
    event_key: `checkin:${eventId}:${userId}`,
  })

  await client.from('chat_message').insert({
    event_id: eventId, user_id: null, kind: 'system',
    body: `📍 ${nickname} отметил присутствие · +50 XP`,
  })
}

export interface QuestState {
  quest: Quest | null
  /** Сколько QP заработал каждый участник — для таблицы лидеров. */
  earned: Record<string, number>
}

export async function getQuest (eventId: string, viewerId: string | null): Promise<QuestState> {
  if (!isLive) {
    const quest = EVENTS.find((event) => event.id === eventId)?.quest ?? null
    const earned = Object.fromEntries(
      (EVENTS.find((event) => event.id === eventId)?.participants ?? [])
        .map((person) => [person.id, person.qpEarned]),
    )
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

  const mine = new Set(
    (completions ?? []).filter((row) => row.user_id === viewerId).map((row) => row.task_id),
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
  { eventId, task, userId, nickname, qpAwarded, photoUrl, answer }: {
    eventId: string
    task: QuestTask
    userId: string
    nickname: string
    qpAwarded: number
    photoUrl?: string
    answer?: unknown
  },
): Promise<void> {
  if (!isLive) return
  const client = db()

  const { error } = await client.from('task_completion').insert({
    task_id: task.id,
    user_id: userId,
    qp_awarded: qpAwarded,
    photo_url: photoUrl ?? null,
    answer: answer ?? null,
  })
  if (error) throw error

  await Promise.all([
    client.from('qp_transaction').insert({
      user_id: userId, amount: qpAwarded, reason: `task:${task.type}`,
      event_key: `qp:${task.id}:${userId}`,
    }),
    client.from('exp_transaction').insert({
      user_id: userId, amount: 10, reason: 'task',
      event_key: `xp:${task.id}:${userId}`,
    }),
    client.from('chat_message').insert({
      event_id: eventId, user_id: null, kind: 'system',
      body: `${nickname} выполнил задание «${task.title}» · +${qpAwarded} QP`,
    }),
  ])
}

// ───────────────────────────────── чат ──────────────────────────────────

export async function listMessages (eventId: string): Promise<ChatMessage[]> {
  if (!isLive) return MESSAGES.filter((message) => message.eventId === eventId)

  const { data, error } = await db()
    .from('chat_message')
    .select('id, event_id, user_id, kind, body, created_at, app_user (nickname)')
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
    body: row.body,
    at: new Date(row.created_at).toLocaleTimeString('ru-RU', {
      hour: '2-digit', minute: '2-digit',
    }),
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
        let nickname: string | undefined
        if (author) {
          const { data } = await client.from('app_user').select('nickname').eq('id', author).maybeSingle()
          nickname = data?.nickname
        }
        onMessage(toMessage({ ...(row as Row), app_user: nickname ? { nickname } : null }))
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
const CITY_CENTER: [number, number] = [56.8389, 60.6057]

export async function geocode (address: string): Promise<[number, number]> {
  try {
    const query = encodeURIComponent(`${address}, Екатеринбург`)
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
      { headers: { 'Accept-Language': 'ru' } },
    )
    if (!response.ok) return CITY_CENTER

    const found = await response.json()
    if (!found?.[0]) return CITY_CENTER
    return [Number(found[0].lat), Number(found[0].lon)]
  } catch {
    return CITY_CENTER
  }
}
