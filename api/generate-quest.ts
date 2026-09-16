// ИИ-генерация квеста по контексту ивента (ТЗ 4.2.6).
//
// Функция выполняется на сервере, а не в браузере: ключ LLM-провайдера
// не должен попадать в клиентский код. Клиент присылает контекст ивента,
// получает обратно готовый квест из трёх заданий.
//
// Ответ модели проверяется по схеме перед тем, как попасть в базу: модель
// может вернуть невалидный JSON, четыре задания вместо трёх или тип задания,
// которого в Системе нет. Всё это отсекается здесь (ТЗ 4.2.6, «валидация
// ответа модели»).

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

const CATEGORY_TITLES: Record<string, string> = {
  party: 'Тусовка',
  chill: 'Чилл',
  bar: 'Бар',
  walk: 'Прогулка',
  boardgames: 'Настолки',
  other: 'Другое',
}

/** Контекст ивента, на основе которого генерируется квест. */
export interface QuestContext {
  title: string
  description?: string
  category: keyof typeof CATEGORY_TITLES | string
  address: string
  participants: number
  interests?: string[]
}

export type GeneratedTask =
  | { type: 'geolocation'; title: string; description: string; qp_reward: number }
  | { type: 'photo'; title: string; description: string; qp_reward: number; prompt: string }
  | {
      type: 'quiz'
      title: string
      description: string
      qp_reward: number
      questions: { question: string; options: string[]; correct_index: number }[]
    }

export interface GeneratedQuest {
  title: string
  tasks: [GeneratedTask, GeneratedTask, GeneratedTask]
}

// Схема, по которой модель обязана вернуть ответ. Gemini поддерживает
// структурированный вывод, поэтому форма ответа задаётся, а не выпрашивается.
const RESPONSE_SCHEMA = {
  type: 'object',
  required: ['title', 'tasks'],
  properties: {
    title: { type: 'string' },
    tasks: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        required: ['type', 'title', 'description'],
        properties: {
          type: { type: 'string', enum: ['geolocation', 'photo', 'quiz'] },
          title: { type: 'string' },
          description: { type: 'string' },
          prompt: { type: 'string' },
          questions: {
            type: 'array',
            items: {
              type: 'object',
              required: ['question', 'options', 'correct_index'],
              properties: {
                question: { type: 'string' },
                options: { type: 'array', items: { type: 'string' } },
                correct_index: { type: 'integer' },
              },
            },
          },
        },
      },
    },
  },
}

function buildPrompt (ctx: QuestContext): string {
  const category = CATEGORY_TITLES[ctx.category] ?? ctx.category
  const interests = ctx.interests?.length ? ctx.interests.join(', ') : 'не указаны'

  return `Ты придумываешь квесты для приложения Questa — оно превращает обычную
встречу небольшой компании в короткую игру.

Контекст встречи:
- название: ${ctx.title}
- описание: ${ctx.description || 'не указано'}
- категория: ${category}
- место: ${ctx.address}
- участников: ${ctx.participants}
- интересы участников: ${interests}

Придумай квест ровно из трёх заданий, строго в таком порядке:
1. type "geolocation" — дойти до точки рядом с местом встречи. В description
   объясни, куда идти, словами, без координат.
2. type "photo" — сделать фотографию. Поле prompt — что именно снять, одной фразой.
3. type "quiz" — ровно 6 вопросов с 4 вариантами ответа каждый, по теме встречи
   и места. correct_index — индекс верного варианта, от 0 до 3.

Требования к заданиям:
- Отталкивайся от места и темы встречи, а не от общих слов: задание должно
  подходить именно этой компании в этом месте.
- Задания выполняются за несколько минут и не требуют денег, покупок,
  специального инвентаря или разрешения посторонних.
- Ничего опасного, противозаконного, унизительного или связанного с алкоголем
  и веществами — даже если категория встречи «Бар».
- Тон дружелюбный, на «ты», по-русски. Заголовки короткие, до 40 символов.`
}

/** Проверяет ответ модели. Возвращает квест или null, если ответ не годится. */
export function validateQuest (raw: unknown): GeneratedQuest | null {
  if (typeof raw !== 'object' || raw === null) return null
  const quest = raw as Record<string, unknown>
  const tasks = quest.tasks

  if (typeof quest.title !== 'string' || !Array.isArray(tasks) || tasks.length !== 3) return null

  const expected = ['geolocation', 'photo', 'quiz'] as const
  const rewards = { geolocation: 20, photo: 25, quiz: 30 }

  const checked = tasks.map((item, index) => {
    if (typeof item !== 'object' || item === null) return null
    const task = item as Record<string, unknown>

    if (task.type !== expected[index]) return null
    if (typeof task.title !== 'string' || !task.title.trim()) return null
    if (typeof task.description !== 'string' || !task.description.trim()) return null

    const base = {
      title: task.title.trim(),
      description: task.description.trim(),
      qp_reward: rewards[expected[index]],
    }

    if (task.type === 'geolocation') return { type: 'geolocation' as const, ...base }

    if (task.type === 'photo') {
      const prompt = typeof task.prompt === 'string' && task.prompt.trim()
        ? task.prompt.trim()
        : base.description
      return { type: 'photo' as const, ...base, prompt }
    }

    // Квиз: шесть вопросов, по 5 QP за верный ответ (ЧТЗ 5.12.1).
    if (!Array.isArray(task.questions) || task.questions.length !== 6) return null

    const questions = task.questions.map((entry) => {
      if (typeof entry !== 'object' || entry === null) return null
      const q = entry as Record<string, unknown>
      if (typeof q.question !== 'string' || !q.question.trim()) return null
      if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4) return null
      if (!q.options.every((option) => typeof option === 'string' && option.trim())) return null
      if (typeof q.correct_index !== 'number') return null
      if (!Number.isInteger(q.correct_index)) return null
      if (q.correct_index < 0 || q.correct_index >= q.options.length) return null
      return {
        question: q.question.trim(),
        options: q.options as string[],
        correct_index: q.correct_index,
      }
    })

    if (questions.some((q) => q === null)) return null
    return { type: 'quiz' as const, ...base, questions: questions as NonNullable<(typeof questions)[number]>[] }
  })

  if (checked.some((task) => task === null)) return null
  return {
    title: quest.title.trim(),
    tasks: checked as GeneratedQuest['tasks'],
  }
}

/** Обращается к модели и возвращает проверенный квест. */
export async function generateQuest (ctx: QuestContext, apiKey: string): Promise<GeneratedQuest> {
  const response = await fetch(`${ENDPOINT}/${MODEL}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(ctx) }] }],
      generationConfig: {
        temperature: 1,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`LLM ответил ${response.status}: ${await response.text()}`)
  }

  const payload = await response.json()
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text

  if (typeof text !== 'string') throw new Error('LLM вернул ответ без текста')

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('LLM вернул не JSON')
  }

  const quest = validateQuest(parsed)
  if (!quest) throw new Error('Ответ LLM не соответствует схеме квеста')

  return quest
}

// Обработчик HTTP-запроса. Клиент шлёт контекст ивента методом POST.
export default async function handler (request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Только POST' }, { status: 405 })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'Ключ LLM не настроен' }, { status: 503 })
  }

  let ctx: QuestContext
  try {
    ctx = await request.json()
  } catch {
    return Response.json({ error: 'Некорректный запрос' }, { status: 400 })
  }

  if (!ctx?.title || !ctx?.category || !ctx?.address) {
    return Response.json({ error: 'Не хватает контекста ивента' }, { status: 400 })
  }

  try {
    return Response.json(await generateQuest(ctx, apiKey))
  } catch (error) {
    // Клиент по этому ответу переходит на шаблон из базы — квест будет в любом
    // случае, даже если модель недоступна.
    console.error('Генерация квеста не удалась:', error)
    return Response.json({ error: 'Генерация недоступна' }, { status: 502 })
  }
}
