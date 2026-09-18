import { db, isLive } from './supabase'
import { DEFAULT_CITY, cityCenter } from '../data/cities'
import { distanceMeters } from './geo'
import type { Venue } from '../data/venues'
import { fallbackQuest } from '../data/fallback-quest'
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
  started_at, finished_at, counted, finished_by,
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
    startedAt: row.started_at ?? undefined,
    finishedAt: row.finished_at ?? undefined,
    counted: Boolean(row.counted),
    finishedBy: (row.finished_by ?? undefined) as QuestaEvent['finishedBy'],
    qpReward: 180,
    myRole: mine?.role ?? 'guest',
    chatOpened: Boolean(row.chat_opened_at),
    participants,
  }
}

/** Дальше этого от центра города встреча уже не «рядом». */
const CITY_RADIUS_METERS = 70_000

/**
 * Список ивентов.
 *
 * С городом в запросе остаются только встречи рядом: человеку в Казани
 * незачем видеть в рекомендациях и на карте екатеринбургские. Отбор идёт по
 * расстоянию до центра города, а не по названию: у ивента хранятся
 * координаты, и они не врут, в отличие от текста адреса.
 *
 * Свои встречи не отсеиваются никогда — уехал человек в другой город или
 * записался заранее в чужом, они всё равно его.
 */
export async function listEvents (
  viewerId: string | null, city?: string | null,
): Promise<QuestaEvent[]> {
  if (!isLive) return EVENTS

  const { data, error } = await db()
    .from('event').select(EVENT_QUERY)
    .in('status', ['active', 'in_progress', 'finished', 'cancelled'])
    .order('starts_at', { ascending: false })

  if (error) throw error

  const events = (data ?? []).map((row) => toEvent(row, viewerId))
  if (!city) return events

  const center = cityCenter(city)

  return events.filter((event) =>
    event.myRole !== 'guest'
    || distanceMeters(center, [event.lat, event.lng]) <= CITY_RADIUS_METERS)
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

  // Квест здесь не создаётся. Он придумывается в момент, когда организатор
  // начинает встречу: только тогда известно, кто собрался, и задания можно
  // подобрать под эту компанию, а не под пустой список участников. Заодно
  // создание ивента не ждёт ответа модели и проходит мгновенно.
  return event.id
}

/** Всё, что модель знает о встрече, когда придумывает задания. */
export interface QuestContext {
  title: string
  description: string
  category: CategoryCode
  address: string
  city: string
  /** Во сколько встреча начинается — «вечером в пятницу» и «в среду утром» разные. */
  startsAt: string
  participants: number
  /** Интересы собравшихся, от самых частых в компании к редким. */
  interests: string[]
}

/**
 * Обращение к функции генерации на стороне Supabase. Ключ модели лежит там,
 * в приложение он не попадает. Ошибка здесь не срывает начало встречи —
 * возвращаем null, и вызывающий код берёт шаблон.
 */
async function generateQuest (
  context: QuestContext,
): Promise<{ tasks: GeneratedTask[] } | { reason: string }> {
  try {
    const { data, error } = await db().functions.invoke('generate-quest', {
      body: context,
    })

    // Функция отвечает 4xx/5xx с телом — supabase-js кладёт тело в error,
    // но саму причину прячет за общим «non-2xx status». Достаём её сами:
    // без неё в приложении видно только «взяли шаблон», и почему — неясно.
    if (error) {
      const details = await readFunctionError(error)
      return { reason: details || error.message }
    }

    if (data?.error) return { reason: String(data.error) }
    if (!Array.isArray(data?.tasks) || data.tasks.length !== 3) {
      return { reason: 'Ответ модели не прошёл проверку' }
    }

    return { tasks: data.tasks as GeneratedTask[] }
  } catch (problem) {
    return { reason: problem instanceof Error ? problem.message : 'Функция недоступна' }
  }
}

/** Текст ошибки из ответа функции, если он там есть. */
async function readFunctionError (error: unknown): Promise<string> {
  const response = (error as { context?: Response })?.context
  if (!response || typeof response.text !== 'function') return ''

  try {
    const body = await response.text()
    const parsed = JSON.parse(body) as { error?: string; details?: string[] }
    return [parsed.error, parsed.details?.join('; ')].filter(Boolean).join(' · ')
  } catch {
    return ''
  }
}

/**
 * Контекст встречи для модели: сам ивент и интересы собравшихся.
 *
 * Интересы берутся не у организатора, а у всей компании, и сортируются по
 * частоте: то, что назвали трое, важнее того, что назвал один. Так квест
 * получается про эту группу, а не про того, кто первым нажал кнопку.
 */
async function questContext (eventId: string): Promise<QuestContext | null> {
  const client = db()

  const { data: event } = await client
    .from('event')
    .select('title, description, address, starts_at, category:interest (code)')
    .eq('id', eventId).maybeSingle()

  if (!event) return null

  const { data: members } = await client
    .from('event_participant')
    .select('user_id, app_user (city)')
    .eq('event_id', eventId)

  const ids = (members ?? []).map((row: Row) => row.user_id)

  const { data: chosen } = await client
    .from('user_interest').select('interest (code)').in('user_id', ids)

  const counts = new Map<string, number>()
  for (const row of (chosen ?? []) as Row[]) {
    const related = row.interest
    const list = Array.isArray(related) ? related : [related]
    for (const item of list) {
      const code = (item as Row | null)?.code
      if (code) counts.set(code, (counts.get(code) ?? 0) + 1)
    }
  }

  const interests = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code]) => code)

  const category = (Array.isArray(event.category) ? event.category[0] : event.category) as Row | null

  return {
    title: event.title,
    description: event.description ?? '',
    category: (category?.code ?? 'other') as CategoryCode,
    address: event.address,
    city: ((members ?? [])[0] as Row | undefined)?.app_user?.city ?? DEFAULT_CITY.name,
    startsAt: event.starts_at,
    participants: ids.length,
    interests,
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
/**
 * Запасной квест, когда модель не ответила.
 *
 * Раньше он брался из коллекции в базе, и все встречи получали одни и те же
 * слова — «дойдите до места встречи», «найдите деталь, которую другие не
 * заметили». Теперь задания собираются из контекста самой встречи: адрес в
 * гео-задании, предмет по категории в фото-задании, квиз про город.
 * Коллекция в базе осталась на случай, когда контекст собрать не удалось.
 */
async function buildFallbackQuest (
  eventId: string, categoryId: number, context?: QuestContext | null,
) {
  const client = db()

  if (context) {
    const tasks = fallbackQuest({
      title: context.title,
      category: context.category,
      address: context.address,
      city: context.city,
    })

    await saveQuest(eventId, 'template', null, tasks as GeneratedTask[])
    return
  }

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
/**
 * Начало встречи организатором (ЧТЗ 5.7).
 *
 * Здесь же придумывается квест — и это главное отличие от прежнего
 * порядка. При создании ивента участников ещё нет, и задания приходилось
 * сочинять по одному организатору; теперь компания собралась, её интересы
 * известны, и модель получает настоящий контекст. Заодно создание ивента
 * перестало ждать ответа модели.
 *
 * Порядок шагов важен: сперва задания, потом статус. Смена статуса
 * объявляется в чате триггером, и к этому моменту задания должны быть на
 * месте — иначе люди откроют пустой квест.
 */
export async function startEvent (
  eventId: string, organizerId: string,
): Promise<QuestOutcome> {
  if (!isLive) return { source: 'ai' }
  const client = db()

  const outcome = await prepareQuest(eventId)

  const { error } = await client.from('event')
    .update({ status: 'in_progress' })
    .eq('id', eventId).eq('organizer_id', organizerId).eq('status', 'active')
  if (error) throw error

  // Чат мог быть ещё не открыт — например, при ручном режиме.
  await openChat(eventId).catch(() => {})

  // Сообщение «Ивент начался» и уведомления участникам ставит триггер:
  // системные сообщения приложению писать нечем — у них нет автора.
  return outcome
}

/**
 * Подбор заданий к началу встречи.
 *
 * Старый квест заменяется только на удавшийся новый: если модель не
 * ответила, лучше оставить то, что есть, чем начать встречу без заданий.
 * Совсем пустому ивенту в этом случае достаётся шаблон из коллекции.
 */
/**
 * Перепридумать задания уже начатой встречи (только организатору).
 *
 * Нужна, когда модель не ответила на старте и квест достался шаблонный:
 * переигрывать встречу ради этого никто не будет. Пока никто не выполнил
 * ни одного задания, заменить их безопасно — после первого выполнения уже
 * нет: вместе с заданиями исчезли бы и начисленные очки.
 */
export const REGENERATE_COST = 5

export async function regenerateQuest (
  eventId: string, organizerId: string,
): Promise<QuestOutcome> {
  if (!isLive) return { source: 'ai' }
  const client = db()

  const { data: event } = await client
    .from('event').select('organizer_id').eq('id', eventId).maybeSingle()

  if (event?.organizer_id !== organizerId) throw new Error('Менять задания может только организатор')

  const { data: quest } = await client
    .from('quest').select('id, task (id)').eq('event_id', eventId).maybeSingle()

  const taskIds = ((quest?.task ?? []) as Row[]).map((task) => task.id)

  if (taskIds.length) {
    const { count } = await client
      .from('task_completion').select('id', { count: 'exact', head: true }).in('task_id', taskIds)

    if ((count ?? 0) > 0) {
      throw new Error('Задания уже выполняют — менять их поздно')
    }
  }

  // Перепридумывание стоит очков. Не ради экономии, а ради смысла: иначе
  // кнопку жмут по десять раз подряд, пока не понравится формулировка, и
  // квест перестаёт быть событием встречи.
  const { data: wallet } = await client
    .from('app_user').select('qp_balance').eq('id', organizerId).maybeSingle()

  if ((wallet?.qp_balance ?? 0) < REGENERATE_COST) {
    throw new Error(`Нужно ${REGENERATE_COST} QP, а на счету ${wallet?.qp_balance ?? 0}`)
  }

  const outcome = await prepareQuest(eventId)

  // Списываем только за удавшуюся замену: за отказ модели платить не за что.
  if (outcome.source === 'ai') {
    await client.from('qp_transaction').insert({
      user_id: organizerId,
      amount: -REGENERATE_COST,
      reason: 'quest:regenerate',
      event_key: `regen:${eventId}:${Date.now()}`,
    })
  }

  return outcome
}

/** Чем закончился подбор заданий — это видит организатор. */
export interface QuestOutcome {
  source: 'ai' | 'template' | 'kept'
  /** Почему не вышло у модели. Пусто, если вышло. */
  reason?: string
}

async function prepareQuest (eventId: string): Promise<QuestOutcome> {
  const client = db()

  const { data: existing } = await client
    .from('quest').select('id').eq('event_id', eventId).maybeSingle()

  const context = await questContext(eventId)
  const result = context
    ? await generateQuest(context)
    : { reason: 'Не удалось собрать контекст встречи' }

  if ('tasks' in result) {
    if (existing) {
      // Удаление может не пройти: право на него даёт файл 005. Тогда старый
      // квест остаётся — это лучше, чем уронить начало встречи ошибкой
      // уникальности при попытке записать второй квест тому же ивенту.
      const { data: removed } = await client
        .from('quest').delete().eq('id', existing.id).select('id')

      if (!removed?.length) {
        return { source: 'kept', reason: 'Не хватает прав заменить прежний квест (файл 005)' }
      }
    }

    await saveQuest(eventId, 'ai', null, result.tasks)
    return { source: 'ai' }
  }

  if (existing) return { source: 'kept', reason: result.reason }

  const { data: category } = await client
    .from('event').select('category_id').eq('id', eventId).maybeSingle()

  if (category) await buildFallbackQuest(eventId, category.category_id, context)
  return { source: 'template', reason: result.reason }
}

// ───────────────────── завершение и срок жизни встречи ────────────────────

/**
 * Через сколько часов после начала встреча закрывается сама, и сколько
 * минимум она должна идти, чтобы попасть в статистику.
 *
 * Те же числа зашиты в базе (миграция 008) — там они и решают. Здесь они
 * нужны, чтобы показать человеку срок заранее, а не после отказа.
 */
export const AUTO_FINISH_HOURS = 6
export const MIN_EVENT_MINUTES = 30

/** Когда встреча закроется сама, если её не завершить руками. */
export function autoFinishAt (event: QuestaEvent): Date {
  const began = new Date(event.startedAt ?? event.startsAt).getTime()
  return new Date(began + AUTO_FINISH_HOURS * 3_600_000)
}

/**
 * Пойдёт ли встреча в зачёт, если завершить её прямо сейчас.
 *
 * Правило то же, что в базе: начата, идёт не меньше получаса, отметились
 * хотя бы двое. Проверка повторена здесь не ради надёжности (решает всё
 * равно база), а чтобы предупредить организатора до нажатия — иначе он
 * узнаёт об этом из системного сообщения, когда менять уже нечего.
 */
export function willCount (event: QuestaEvent): boolean {
  if (!event.startedAt) return false

  const minutes = (Date.now() - new Date(event.startedAt).getTime()) / 60_000
  const present = event.participants.filter((person) => person.checkedIn).length

  return minutes >= MIN_EVENT_MINUTES && present >= 2
}

/**
 * Завершение ивента организатором (ЧТЗ 5.13, триггер 1). Сообщение в чат и
 * приглашение оценить друг друга рассылает триггер announce_event_change,
 * он же объявляет, засчиталась ли встреча.
 */
export async function finishEvent (
  eventId: string, organizerId: string,
): Promise<{ counted: boolean }> {
  if (!isLive) return { counted: true }

  const { data, error } = await db().from('event')
    .update({ status: 'finished', finished_by: 'organizer' })
    .eq('id', eventId).eq('organizer_id', organizerId)
    .in('status', ['active', 'in_progress'])
    .select('counted').maybeSingle()

  if (error) throw error
  return { counted: Boolean(data?.counted) }
}

/**
 * Работа по часам: разослать напоминания о скорых встречах и закрыть
 * просроченные.
 *
 * Планировщика в проекте нет, поэтому это делает база по просьбе
 * приложения — один вызов при запуске. Звучит хрупко, но работает: в
 * приложение заходят постоянно, а сама работа идемпотентна, так что хоть
 * десять человек вызовут её одновременно, напоминание уйдёт один раз.
 * Единственное, чего так не выйдет, — разбудить того, кто приложение не
 * открывает; для этого нужен pg_cron, и расписание для него оставлено
 * в миграции 008 комментарием.
 */
export async function runEventMaintenance (): Promise<void> {
  if (!isLive) return
  await db().rpc('run_event_maintenance').then(undefined, () => {})
}

// ───────────────── ежедневная награда за вход подряд ──────────────────

const DAY_MS = 86_400_000

/** Сколько QP даёт день серии (ЧТЗ 5.12.3): от 10 в первый до 75 к концу. */
export function streakReward (day: number): number {
  return Math.min(10 + 5 * (day - 1), 75)
}

export interface DailyReward {
  /** Текущая длина серии — сколько дней подряд награда уже забрана. */
  streak: number
  /** День серии, который засчитается, если забрать награду сейчас. */
  day: number
  amount: number
  canClaim: boolean
  /** Когда награда откроется снова. */
  nextAt: string | null
  /** Когда серия оборвётся, если не прийти. */
  breaksAt: string | null
}

/**
 * Состояние награды. Серия не растёт от самого факта открытия приложения:
 * награду нужно забрать. Не забрал двое суток — серия начинается заново,
 * и это единственное, что делает её ценной.
 */
export async function getDailyReward (userId: string): Promise<DailyReward> {
  const now = Date.now()

  const state = isLive
    ? await (async () => {
        const { data } = await db().from('app_user')
          .select('streak_days, last_reward_at').eq('id', userId).maybeSingle()
        return {
          streak: data?.streak_days ?? 0,
          last: data?.last_reward_at ? new Date(data.last_reward_at).getTime() : null,
        }
      })()
    : demoReward

  const canClaim = state.last === null || now - state.last >= DAY_MS
  const broken = state.last === null || now - state.last > 2 * DAY_MS
  const day = broken ? 1 : Math.min(state.streak + (canClaim ? 1 : 0), 14)

  return {
    streak: state.streak,
    day,
    amount: streakReward(day),
    canClaim,
    nextAt: state.last === null ? null : new Date(state.last + DAY_MS).toISOString(),
    breaksAt: state.last === null ? null : new Date(state.last + 2 * DAY_MS).toISOString(),
  }
}

/** Состояние награды в демонстрационном режиме — в памяти вкладки. */
const demoReward = { streak: 0, last: null as number | null }

export async function claimDailyReward (userId: string): Promise<{ day: number; amount: number }> {
  const state = await getDailyReward(userId)
  if (!state.canClaim) throw new Error('Награда уже получена — приходите завтра')

  const now = new Date()

  if (!isLive) {
    demoReward.streak = state.day
    demoReward.last = now.getTime()
    return { day: state.day, amount: state.amount }
  }

  const client = db()

  // Ключ по дате делает начисление неповторимым: даже если запрос уйдёт
  // дважды, очки начислятся один раз.
  const { error } = await client.from('qp_transaction').insert({
    user_id: userId, amount: state.amount, reason: 'streak',
    event_key: `streak:${userId}:${now.toISOString().slice(0, 10)}`,
  })
  if (error && !error.message.includes('duplicate key')) throw error

  const { error: saved } = await client.from('app_user').update({
    streak_days: state.day,
    last_reward_at: now.toISOString(),
    last_login_date: now.toISOString().slice(0, 10),
  }).eq('id', userId)
  if (saved) throw saved

  // История входов — на будущее, для статистики; сбой здесь ничего не ломает.
  await client.from('streak_log')
    .insert({ user_id: userId, login_date: now.toISOString().slice(0, 10) })
    .then(undefined, () => {})

  return { day: state.day, amount: state.amount }
}

// ───────────────────────── профиль другого человека ──────────────────────

export interface PublicProfile {
  id: string
  nickname: string
  avatarUrl?: string
  city: string
  expTotal: number
  averageRating: number
  streakDays: number
  eventsAttended: number
  eventsHosted: number
  interests: string[]
  /** Когда человек появился в приложении. */
  since: string
}

// «с июня 2026», а не «с июнь 2026»: встроенное форматирование даёт месяц
// в именительном падеже, и после предлога это читается неряшливо.
const MONTHS_OF = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

function monthAndYear (iso: string): string {
  const date = new Date(iso)
  return `${MONTHS_OF[date.getMonth()]} ${date.getFullYear()}`
}

/**
 * Карточка другого участника (ЧТЗ 5.6): по ней решают, идти ли на встречу
 * с незнакомым человеком. Баланс QP здесь не показывается — это личное,
 * в отличие от уровня и оценок, которые как раз и говорят о человеке.
 */
export async function getPublicProfile (userId: string): Promise<PublicProfile> {
  if (!isLive) {
    const known = EVENTS.flatMap((event) => event.participants)
      .find((person) => person.id === userId)

    return {
      id: userId,
      nickname: known?.nickname ?? 'Участник',
      avatarUrl: known?.avatarUrl,
      city: 'Екатеринбург',
      expTotal: 1400,
      averageRating: known?.rating ?? 4.6,
      streakDays: 4,
      eventsAttended: 12,
      eventsHosted: 3,
      interests: ['party', 'chill', 'boardgames'],
      since: 'июня 2026',
    }
  }

  const client = db()

  const { data: row, error } = await client.from('app_user')
    .select('id, nickname, avatar_url, city, exp_total, streak_days, average_rating, created_at')
    .eq('id', userId).maybeSingle()

  if (error) throw error
  if (!row) throw new Error('Пользователь не найден')

  const [{ data: interests }, attended, hosted] = await Promise.all([
    client.from('user_interest').select('interest (code)').eq('user_id', userId),
    client.from('event_participant').select('id, event!inner(counted)', { count: 'exact', head: true })
      .eq('user_id', userId).not('checked_in_at', 'is', null).eq('event.counted', true),
    client.from('event').select('id', { count: 'exact', head: true })
      .eq('organizer_id', userId).eq('counted', true),
  ])

  return {
    id: row.id,
    nickname: row.nickname,
    avatarUrl: row.avatar_url ?? undefined,
    city: row.city ?? '',
    expTotal: row.exp_total,
    averageRating: Number(row.average_rating ?? 0),
    streakDays: row.streak_days,
    eventsAttended: attended.count ?? 0,
    eventsHosted: hosted.count ?? 0,
    interests: (interests ?? []).flatMap((item: Row) => {
      const related = item.interest
      const list = Array.isArray(related) ? related : [related]
      return list.flatMap((entry: Row | null) => (entry?.code ? [entry.code] : []))
    }),
    since: monthAndYear(row.created_at),
  }
}

// ───────────────────────── награда за уровень ─────────────────────────

/** Сколько QP даёт новый уровень: чем дальше, тем весомее. */
export function levelReward (level: number): number {
  return Math.min(25 + (level - 2) * 10, 150)
}

/**
 * Начисление за взятый уровень.
 *
 * Ключ начисления содержит номер уровня, поэтому дважды за один и тот же
 * уровень очки не придут — даже если приложение спросит об этом повторно
 * на другом устройстве.
 */
export async function claimLevelReward (userId: string, level: number): Promise<number> {
  const amount = levelReward(level)
  if (!isLive) return amount

  const { error } = await db().from('qp_transaction').insert({
    user_id: userId,
    amount,
    reason: `level:${level}`,
    event_key: `level:${userId}:${level}`,
  })

  if (error && !error.message.includes('duplicate key')) throw error
  return amount
}

// ──────────────────────────── ачивки ─────────────────────────────────

/**
 * Даты получения ачивок.
 *
 * Сами ачивки считаются по числам профиля и нигде не хранятся, поэтому
 * помнить, когда именно условие сошлось, приходится отдельно. Приложение
 * при открытии профиля присылает список уже выполненных — новые
 * записываются с текущей датой, старые остаются нетронутыми.
 *
 * Сбой записи ничего не ломает: ачивка всё равно показывается полученной,
 * просто без даты, а дата допишется при следующем заходе.
 */
export async function syncAchievements (
  userId: string, earnedCodes: string[],
): Promise<Record<string, string>> {
  if (!isLive) return demoAchievements(userId, earnedCodes)

  const client = db()
  const { data } = await client.from('achievement')
    .select('code, earned_at').eq('user_id', userId)

  const dates: Record<string, string> = {}
  for (const row of (data ?? []) as Row[]) dates[row.code] = row.earned_at

  const fresh = earnedCodes.filter((code) => !dates[code])
  if (fresh.length > 0) {
    const now = new Date().toISOString()
    const { error } = await client.from('achievement')
      .insert(fresh.map((code) => ({ user_id: userId, code, earned_at: now })))

    if (!error) for (const code of fresh) dates[code] = now
  }

  return dates
}

/** Те же даты в демонстрационном режиме — в памяти браузера. */
function demoAchievements (userId: string, earnedCodes: string[]): Record<string, string> {
  const key = `questa:achievements:${userId}`
  let dates: Record<string, string> = {}

  try {
    dates = JSON.parse(localStorage.getItem(key) ?? '{}')
  } catch { dates = {} }

  const now = new Date().toISOString()
  let added = false
  for (const code of earnedCodes) {
    if (!dates[code]) { dates[code] = now; added = true }
  }

  if (added) try { localStorage.setItem(key, JSON.stringify(dates)) } catch { /* приват-режим */ }
  return dates
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

/**
 * Уведомления для демонстрационного режима. Хранятся в памяти вкладки:
 * базы здесь нет, но центр уведомлений должен быть не пустым — иначе на
 * показе виден только текст «пока тихо».
 */
const demoNotifications: Notification[] = [
  {
    id: 'n1', type: 'group', title: 'Группа набрана!',
    body: 'Чат ивента «Вечер караоке» открыт', eventId: 'karaoke',
    isRead: false, at: 'сегодня, 09:12',
  },
  {
    id: 'n2', type: 'task', title: 'Задание выполнено',
    body: 'Алексей справился с заданием «Поймать кадр»', eventId: 'karaoke',
    isRead: false, at: 'сегодня, 09:05',
  },
  {
    id: 'n3', type: 'join', title: 'Заявка на участие',
    body: 'Кто-то присоединился к ивенту «Игра в DND»', eventId: 'dnd',
    isRead: true, at: 'вчера, 20:41',
  },
]

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
  if (!isLive) return [...demoNotifications]

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
  if (!isLive) return demoNotifications.filter((item) => !item.isRead).length

  const { count } = await db()
    .from('notification').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('is_read', false)

  return count ?? 0
}

/** Пометить все свои уведомления прочитанными (ЧТЗ 5.16). */
export async function markNotificationsRead (userId: string): Promise<void> {
  if (!isLive) {
    for (const item of demoNotifications) item.isRead = true
    return
  }
  const { error } = await db().from('notification').update({ is_read: true })
    .eq('user_id', userId).eq('is_read', false)
  if (error) throw error
}

/** Очистить центр уведомлений: старые сообщения о прошедших встречах. */
export async function clearNotifications (userId: string): Promise<void> {
  if (!isLive) {
    demoNotifications.length = 0
    return
  }
  const { error } = await db().from('notification').delete().eq('user_id', userId)
  if (error) throw error
}

/**
 * Подписка на свои уведомления (ЧТЗ 5.16).
 *
 * Приложение узнаёт о событии в тот же момент, что и база: строка
 * появилась — пришло событие. Без этого о заявке или о начале встречи
 * можно было узнать, только заглянув в колокольчик.
 */
export function subscribeNotifications (
  userId: string,
  onNotification: (notification: Notification) => void,
): () => void {
  if (!isLive) return () => {}

  const client = db()
  const channel = client
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT', schema: 'public', table: 'notification',
        filter: `user_id=eq.${userId}`,
      },
      ({ new: row }) => {
        const item = row as Row
        onNotification({
          id: item.id,
          type: item.type,
          title: item.title,
          body: item.body,
          eventId: item.payload?.event_id,
          isRead: item.is_read,
          at: new Date(item.created_at).toLocaleString('ru-RU', {
            day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
          }),
        })
      },
    )
    .subscribe()

  return () => { client.removeChannel(channel) }
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
  file: File, userId: string, kind: 'avatar' | 'cover' | 'chat' | 'task',
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
  /** Кто смотрел на снимок — видно на странице самопроверки. */
  model?: string
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
  if (!isLive) return { ok: true, reason: 'Демонстрационный режим — без базы', skipped: true }

  try {
    const { data, error } = await db().functions.invoke('generate-quest', {
      body: { kind: 'photo', prompt, image: base64 },
    })

    // Причина отказа достаётся из тела ответа: иначе «снимок принят»
    // выглядит одинаково и когда модель посмотрела, и когда её не было.
    if (error) {
      const details = await readFunctionError(error)
      return { ok: true, reason: details || error.message, skipped: true }
    }

    if (typeof data?.ok !== 'boolean') {
      return { ok: true, reason: String(data?.error ?? 'Ответ модели не разобран'), skipped: true }
    }

    return {
      ok: data.ok,
      reason: String(data.reason ?? ''),
      skipped: false,
      model: typeof data.model === 'string' ? data.model : undefined,
    }
  } catch (problem) {
    return {
      ok: true,
      reason: problem instanceof Error ? problem.message : 'Функция недоступна',
      skipped: true,
    }
  }
}
