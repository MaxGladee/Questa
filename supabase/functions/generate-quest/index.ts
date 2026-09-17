// ИИ-генерация квеста по контексту ивента (ТЗ 4.2.6).
//
// Функция выполняется на стороне Supabase, а не в браузере: ключ модели не
// должен попадать в код приложения, иначе его увидит любой, кто откроет
// страницу. Клиент присылает контекст встречи, получает готовый квест.
//
// Ответ модели проверяется по схеме до того, как попасть в базу: модель может
// вернуть четыре задания вместо трёх, тип, которого в Системе нет, или номер
// правильного ответа за пределами списка вариантов. Всё это отсекается здесь
// («валидация ответа модели» из ТЗ 4.2.6). Если проверка не прошла, клиент
// берёт шаблон из коллекции — квест у ивента будет в любом случае.

// Названия моделей у провайдера меняются, и промах по имени неотличим от
// недоступности. Перебираем варианты по очереди и берём первый, который
// ответит; своё имя задаётся переменной GEMINI_MODEL и пробуется первым.
//
// Порядок не случайный. gemini-2.5-flash новым проектам уже не выдают —
// провайдер сам указал на замену. Псевдоним flash-latest оставлен следом:
// он переживёт очередное переименование, но под нагрузкой отвечает отказом
// чаще, поэтому не первый.
const MODELS = [
  Deno.env.get('GEMINI_MODEL'),
  'gemini-3.6-flash',
  'gemini-flash-latest',
  'gemini-2.0-flash',
].filter(Boolean) as string[]

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const CATEGORY_TITLES: Record<string, string> = {
  party: 'Тусовка',
  chill: 'Чилл',
  bar: 'Бар',
  walk: 'Прогулка',
  boardgames: 'Настолки',
  other: 'Другое',
}

interface QuestContext {
  title: string
  description?: string
  category: string
  address: string
  participants: number
  interests?: string[]
}

// Форма ответа задаётся модели, а не выпрашивается словами.
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
function validateQuest (raw: unknown) {
  if (typeof raw !== 'object' || raw === null) return null
  const quest = raw as Record<string, unknown>
  const tasks = quest.tasks

  if (typeof quest.title !== 'string' || !Array.isArray(tasks) || tasks.length !== 3) return null

  const expected = ['geolocation', 'photo', 'quiz'] as const
  const rewards = { geolocation: 20, photo: 25, quiz: 30 }

  const checked = tasks.map((item, index) => {
    if (typeof item !== 'object' || item === null) return null
    const task = item as Record<string, unknown>
    const type = expected[index]

    if (task.type !== type) return null
    if (typeof task.title !== 'string' || !task.title.trim()) return null
    if (typeof task.description !== 'string' || !task.description.trim()) return null

    const base = {
      type,
      title: task.title.trim().slice(0, 60),
      description: task.description.trim(),
      qp_reward: rewards[type],
    }

    if (type === 'geolocation') {
      return { ...base, params: { radius_meters: 50 }, is_shared: false }
    }

    if (type === 'photo') {
      const prompt = typeof task.prompt === 'string' && task.prompt.trim()
        ? task.prompt.trim()
        : base.description
      return { ...base, params: { prompt }, is_shared: false }
    }

    // Квиз: шесть вопросов, по 5 QP за верный ответ (ЧТЗ 5.12.1).
    if (!Array.isArray(task.questions) || task.questions.length !== 6) return null

    const questions = task.questions.map((entry) => {
      if (typeof entry !== 'object' || entry === null) return null
      const q = entry as Record<string, unknown>
      if (typeof q.question !== 'string' || !q.question.trim()) return null
      if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4) return null
      if (!q.options.every((option) => typeof option === 'string' && option.trim())) return null
      if (typeof q.correct_index !== 'number' || !Number.isInteger(q.correct_index)) return null
      if (q.correct_index < 0 || q.correct_index >= q.options.length) return null
      return {
        question: q.question.trim(),
        options: q.options,
        correct_index: q.correct_index,
      }
    })

    if (questions.some((q) => q === null)) return null
    return { ...base, params: { questions }, is_shared: true }
  })

  if (checked.some((task) => task === null)) return null
  return { title: quest.title.trim(), tasks: checked }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'content-type': 'application/json' },
    })

  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) return json({ error: 'Ключ модели не настроен' }, 503)

  let ctx: QuestContext
  try {
    ctx = await request.json()
  } catch {
    return json({ error: 'Некорректный запрос' }, 400)
  }

  if (!ctx?.title || !ctx?.category || !ctx?.address) {
    return json({ error: 'Не хватает контекста ивента' }, 400)
  }

  const body = JSON.stringify({
    contents: [{ parts: [{ text: buildPrompt(ctx) }] }],
    generationConfig: {
      temperature: 1,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  })

  // Причина отказа возвращается вызывающему, а не только пишется в журнал:
  // журнал функции виден лишь в панели Supabase, а разбираться приходится по
  // тому, что видно в приложении.
  const failures: string[] = []
  let overloaded = false

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  // Два прохода по списку моделей. «Высокая нагрузка» — состояние временное,
  // и вторая попытка через пару секунд нередко проходит; один проход отдавал
  // бы отказ там, где достаточно подождать.
  for (let pass = 0; pass < 2; pass++) {
    if (pass > 0) {
      if (!overloaded) break        // отказ был не из-за нагрузки — ждать нечего
      await wait(2000)
    }

    for (const model of MODELS) {
      try {
        const response = await fetch(`${ENDPOINT}/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        })

        if (!response.ok) {
          if (response.status === 503 || response.status === 429) overloaded = true
          const detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 160)
          failures.push(`${model} → ${response.status}: ${detail}`)
          continue
        }

        const payload = await response.json()
        const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text

        if (typeof text !== 'string') {
          failures.push(`${model} → ответ без текста`)
          continue
        }

        const quest = validateQuest(JSON.parse(text))
        if (!quest) {
          failures.push(`${model} → ответ не соответствует схеме квеста`)
          continue
        }

        return json({ ...quest, model })
      } catch (cause) {
        failures.push(`${model} → ${cause instanceof Error ? cause.message : String(cause)}`)
      }
    }
  }

  console.error('Генерация не удалась:', failures)

  // Перегрузку у провайдера отделяем от настоящей поломки: лечится она
  // ожиданием, и сообщать о ней надо иначе.
  return json({
    error: overloaded
      ? 'Провайдер модели сейчас перегружен. Это временно: попробуйте через несколько минут.'
      : 'Модель недоступна',
    overloaded,
    details: failures,
  }, overloaded ? 503 : 502)
})
