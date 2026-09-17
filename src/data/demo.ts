// Демонстрационные данные. Повторяют структуру таблиц из supabase/01_schema.sql,
// поэтому при переходе на настоящую базу меняется источник, а не экраны.

export type CategoryCode = 'party' | 'chill' | 'bar' | 'walk' | 'boardgames' | 'other'
export type EventStatus = 'active' | 'in_progress' | 'finished' | 'cancelled'
export type TaskType = 'geolocation' | 'photo' | 'quiz'

/**
 * Интересы профиля. Первые шесть совпадают с категориями ивента (ЧТЗ 5.5),
 * остальные существуют только в профиле: по ним подбираются рекомендации и
 * строится контекст для генерации квеста. Список повторяет справочник из
 * supabase/002_photos_and_interests.sql.
 */
export const INTERESTS: { code: string; title: string }[] = [
  { code: 'party', title: 'Тусовка' },
  { code: 'chill', title: 'Чилл' },
  { code: 'bar', title: 'Бар' },
  { code: 'walk', title: 'Прогулка' },
  { code: 'boardgames', title: 'Настолки' },
  { code: 'other', title: 'Другое' },
  { code: 'sport', title: 'Спорт' },
  { code: 'run', title: 'Бег' },
  { code: 'bike', title: 'Велосипед' },
  { code: 'yoga', title: 'Йога' },
  { code: 'music', title: 'Музыка' },
  { code: 'cinema', title: 'Кино' },
  { code: 'books', title: 'Книги' },
  { code: 'food', title: 'Еда' },
  { code: 'coffee', title: 'Кофе' },
  { code: 'travel', title: 'Путешествия' },
  { code: 'photo', title: 'Фотография' },
  { code: 'art', title: 'Искусство' },
  { code: 'dance', title: 'Танцы' },
  { code: 'it', title: 'Айти' },
  { code: 'languages', title: 'Языки' },
  { code: 'animals', title: 'Животные' },
  { code: 'quiz', title: 'Квизы' },
  { code: 'anime', title: 'Аниме' },
  { code: 'volunteer', title: 'Волонтёрство' },
  { code: 'theatre', title: 'Театр' },
]

/**
 * Сколько интересов можно отметить. Ограничение не формальное: по интересам
 * подбираются рекомендации и строится контекст для генерации квеста, а
 * человек, отметивший всё подряд, не сообщает о себе ничего.
 */
export const MAX_INTERESTS = 5

/** Категории ивента — только эти шесть, как требует ЧТЗ. */
export const CATEGORIES: { code: CategoryCode; title: string }[] = [
  { code: 'party', title: 'Тусовка' },
  { code: 'chill', title: 'Чилл' },
  { code: 'bar', title: 'Бар' },
  { code: 'walk', title: 'Прогулка' },
  { code: 'boardgames', title: 'Настолки' },
  { code: 'other', title: 'Другое' },
]

export interface User {
  id: string
  nickname: string
  city: string
  avatarUrl?: string
  qpBalance: number
  expTotal: number
  streakDays: number
  averageRating: number
  eventsAttended: number
  eventsHosted: number
  interests: string[]
}

export interface Participant {
  id: string
  nickname: string
  avatarUrl?: string
  role: 'organizer' | 'participant'
  qpEarned: number
  checkedIn: boolean
  /** Средний балл человека по оценкам других (ЧТЗ 5.14). */
  rating?: number
}

export interface QuestTask {
  id: string
  position: number
  type: TaskType
  title: string
  description: string
  qpReward: number
  isShared: boolean
  completed: boolean
  /** Сколько QP начислено по факту — у квиза зависит от числа верных ответов. */
  awardedQp?: number
  questions?: { question: string; options: string[]; correctIndex: number }[]
  /** Параметры задания: цель и радиус для геолокации, подсказка для фото. */
  params?: {
    target_latitude?: number
    target_longitude?: number
    radius_meters?: number
    duration_seconds?: number
    prompt?: string
  }
}

export interface Quest {
  title: string
  source: 'ai' | 'template'
  tasks: QuestTask[]
}

export interface QuestaEvent {
  id: string
  title: string
  description: string
  coverUrl?: string
  category: CategoryCode
  address: string
  lat: number
  lng: number
  startsAt: string
  minParticipants: number
  maxParticipants: number
  status: EventStatus
  qpReward: number
  participants: Participant[]
  myRole: 'organizer' | 'participant' | 'guest'
  chatOpened: boolean
  quest?: Quest
}

export interface ChatMessage {
  id: string
  eventId: string
  authorId: string | null      // null — системное сообщение
  authorName?: string
  authorAvatar?: string
  body: string
  /** Время в готовом виде — его показывают у сообщения. */
  at: string
  /** Момент отправки целиком: по нему сообщения делятся на дни. */
  createdAt?: string
}

/** Уровень по шкале из ЧТЗ 5.12.4. */
export function levelFromExp (exp: number): number {
  const scale = [0, 100, 250, 500, 1000, 1750, 2750, 4000, 5500, 7500]
  const index = scale.findIndex((needed) => exp < needed)
  if (index === -1) return 10 + Math.floor((exp - 7500) / 2500)
  return index
}

/** Сколько XP нужно до следующего уровня — для полосы прогресса в профиле. */
export function levelProgress (exp: number): { current: number; next: number } {
  const scale = [0, 100, 250, 500, 1000, 1750, 2750, 4000, 5500, 7500]
  const level = levelFromExp(exp)
  const current = scale[level - 1] ?? 7500 + (level - 10) * 2500
  const next = scale[level] ?? current + 2500
  return { current: exp - current, next: next - current }
}

export const ME: User = {
  id: 'me',
  nickname: 'Елена',
  city: 'Екатеринбург',
  avatarUrl: `${import.meta.env.BASE_URL}art/avatar-me.jpg`,
  qpBalance: 250,
  expTotal: 1700,
  streakDays: 10,
  averageRating: 4.8,
  eventsAttended: 42,
  eventsHosted: 67,
  interests: ['party', 'chill', 'boardgames'],
}

const art = (file: string) => `${import.meta.env.BASE_URL}art/${file}`

/**
 * Даты демонстрационных ивентов считаются от сегодняшнего дня, а не записаны
 * жёстко: иначе через неделю после написания кода демо-режим показывал бы
 * пустые «Рекомендации».
 */
function inDays (days: number, hour: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

const karaokeQuest: Quest = {
  title: 'Караоке-разогрев',
  source: 'ai',
  tasks: [
    {
      id: 'k1', position: 1, type: 'photo', qpReward: 30, isShared: false, completed: false,
      title: 'Поймать кадр', description: 'Селфи с Басковым',
      params: { prompt: 'Селфи на фоне сцены караоке' },
    },
    {
      id: 'k2', position: 2, type: 'geolocation', qpReward: 100, isShared: false, completed: false,
      title: 'Гео-трекинг', description: 'Провести в караоке 2 часа',
      params: { radius_meters: 50, duration_seconds: 120 },
    },
    {
      id: 'k3', position: 3, type: 'quiz', qpReward: 50, isShared: true, completed: false,
      title: 'Квиз-тайм', description: 'Тематика: песни The Weeknd',
      questions: [
        { question: 'С какого альбома трек «Blinding Lights»?', options: ['Starboy', 'After Hours', 'Kiss Land', 'Dawn FM'], correctIndex: 1 },
        { question: 'Настоящее имя The Weeknd?', options: ['Абель Тесфайе', 'Аарон Уильямс', 'Адам Фостер', 'Амир Хан'], correctIndex: 0 },
        { question: 'В какой стране он родился?', options: ['США', 'Канада', 'Эфиопия', 'Великобритания'], correctIndex: 1 },
        { question: 'Какой трек открывает альбом «After Hours»?', options: ['Alone Again', 'Hardest To Love', 'Scared To Live', 'Faith'], correctIndex: 0 },
        { question: 'С кем записан трек «Save Your Tears» в ремиксе?', options: ['Дуа Липа', 'Ариана Гранде', 'Билли Айлиш', 'Рианна'], correctIndex: 1 },
        { question: 'Как называется альбом 2022 года?', options: ['Dawn FM', 'My Dear Melancholy', 'Trilogy', 'Beauty Behind the Madness'], correctIndex: 0 },
      ],
    },
  ],
}

export const EVENTS: QuestaEvent[] = [
  {
    id: 'karaoke',
    title: 'Вечер караоке',
    description: 'Простой формат, который хорошо работает для расслабленного вечера: поём по очереди, никто никого не оценивает.',
    coverUrl: art('cover-karaoke.jpg'),
    category: 'party',
    address: 'ул. Малышева, 44',
    lat: 56.8380, lng: 60.5975,
    startsAt: inDays(0, 20),
    minParticipants: 3, maxParticipants: 8,
    status: 'in_progress',
    qpReward: 180,
    myRole: 'participant',
    chatOpened: true,
    quest: karaokeQuest,
    participants: [
      { id: 'me', nickname: 'Макс', role: 'participant', qpEarned: 150, checkedIn: true },
      { id: 'u2', nickname: 'Катя', role: 'organizer', qpEarned: 110, checkedIn: true },
      { id: 'u3', nickname: 'Алексей', role: 'participant', qpEarned: 90, checkedIn: true },
      { id: 'u4', nickname: 'Николай', role: 'participant', qpEarned: 75, checkedIn: false },
      { id: 'u5', nickname: 'Андрей', role: 'participant', qpEarned: 30, checkedIn: true },
    ],
  },
  {
    id: 'run',
    title: 'Утренняя пробежка',
    description: 'Встречаемся и отмечаемся в 9:00 и стартуем в 9:05 от центрального фонтана',
    coverUrl: art('cover-run.jpg'),
    category: 'walk',
    address: 'ЦПКИО им. Маяковского',
    lat: 56.8106, lng: 60.6431,
    startsAt: inDays(1, 9),
    minParticipants: 3, maxParticipants: 10,
    status: 'active',
    qpReward: 180,
    myRole: 'participant',
    chatOpened: true,
    participants: [
      { id: 'u6', nickname: 'Шамиль', role: 'organizer', qpEarned: 0, checkedIn: false },
      { id: 'me', nickname: 'Елена', role: 'participant', qpEarned: 0, checkedIn: false },
      { id: 'u7', nickname: 'Марина', role: 'participant', qpEarned: 0, checkedIn: false },
    ],
  },
  {
    id: 'dnd',
    title: 'Игра в DND',
    description: 'Лёгкое погружение в мир фэнтези: ваншот-приключение на один вечер, новичкам поможем с персонажем.',
    coverUrl: art('cover-dnd.jpg'),
    category: 'boardgames',
    address: 'ул. Розы Люксембург, 54А',
    lat: 56.8255, lng: 60.6112,
    startsAt: inDays(0, 18),
    minParticipants: 4, maxParticipants: 6,
    status: 'active',
    qpReward: 150,
    myRole: 'guest',
    chatOpened: false,
    participants: [
      { id: 'u8', nickname: 'Дмитрий', role: 'organizer', qpEarned: 0, checkedIn: false },
      { id: 'u9', nickname: 'Ольга', role: 'participant', qpEarned: 0, checkedIn: false },
    ],
  },
  {
    id: 'movies',
    title: 'Вечер фильмов и сериалов',
    description: 'Группы готовят одно блюдо из одинакового набора продуктов, а потом смотрим то, что выберем голосованием.',
    coverUrl: art('cover-movies.jpg'),
    category: 'chill',
    address: 'ул. 8 Марта, 12',
    lat: 56.8290, lng: 60.5960,
    startsAt: inDays(2, 19),
    minParticipants: 2, maxParticipants: 6,
    status: 'active',
    qpReward: 120,
    myRole: 'guest',
    chatOpened: false,
    participants: [
      { id: 'u10', nickname: 'Ирина', role: 'organizer', qpEarned: 0, checkedIn: false },
    ],
  },
]

export const MESSAGES: ChatMessage[] = [
  { id: 'm1', eventId: 'karaoke', authorId: null, body: 'Чат создан автоматически', at: '08:45' },
  { id: 'm2', eventId: 'karaoke', authorId: null, body: '📍 Иван отметил присутствие · +50 XP', at: '09:12' },
  { id: 'm3', eventId: 'karaoke', authorId: 'me', body: '🔥🔥🔥', at: '09:38' },
  { id: 'm4', eventId: 'karaoke', authorId: 'me', body: 'Всем привет, я новенький в этом приложении!', at: '09:38' },
  { id: 'm5', eventId: 'karaoke', authorId: 'u5', authorName: 'Андрей', body: 'Привет, тебе надо помочь разобраться?', at: '09:38' },
  { id: 'm6', eventId: 'karaoke', authorId: 'me', body: 'Да, было бы очень даже неплохо!', at: '09:38' },
  { id: 'm7', eventId: 'karaoke', authorId: 'u3', authorName: 'Алексей', body: 'Ох, ребятки, сегодня мощно затусим!', at: '09:38' },
  { id: 'm8', eventId: 'karaoke', authorId: null, body: 'Квесты доступны! Проверьте задания ↓', at: '09:40' },
]

export function findEvent (id: string | undefined): QuestaEvent | undefined {
  return EVENTS.find((event) => event.id === id)
}

export function categoryTitle (code: CategoryCode): string {
  return CATEGORIES.find((c) => c.code === code)?.title ?? 'Другое'
}

export function formatDate (iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

export function formatTime (iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}
