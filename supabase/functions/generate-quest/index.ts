// ИИ-генерация квеста по контексту ивента (ТЗ 4.2.6).
//
// Моделей две. Основная — Claude: он точнее держится инструкций и умеет
// отдавать ответ строго по схеме (structured outputs), поэтому «ответ не
// разобрался» перестаёт быть отдельным видом отказа. Запасная — Gemini,
// на случай если у Claude нет ключа, он перегружен или отказал. Если молчат
// обе, приложение собирает задания само из контекста встречи.
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

// Версия библиотеки закреплена: в Deno «npm:» без версии тянет свежайшую,
// и однажды утром квесты могли бы перестать генерироваться из-за чужого
// обновления. Обновлять — осознанно, поменяв число здесь.
import Anthropic from 'npm:@anthropic-ai/sdk@0.126.0'

// Ключ Claude задаётся отдельной переменной окружения. Нет ключа — функция
// работает как раньше, через Gemini: развёртывание можно обновить заранее,
// а ключ добавить потом.
//
// Значение чистится перед использованием. При копировании в поле секрета к
// ключу легко прилипает перевод строки, пробел или кавычки — сервер в ответ
// говорит «ключ недействителен», и человек ищет проблему не там.
const CLAUDE_KEY = (Deno.env.get('ANTHROPIC_API_KEY') ?? '')
  .trim()
  .replace(/^["']|["']$/g, '')

const CLAUDE_MODEL = Deno.env.get('CLAUDE_MODEL') ?? 'claude-opus-5'

// Ключ, не похожий на ключ Anthropic, до сервера не отправляется: запрос
// всё равно вернёт 401, а в списке причин появится лишняя строка, за
// которой не видно настоящей.
const claude = CLAUDE_KEY.startsWith('sk-ant-')
  ? new Anthropic({ apiKey: CLAUDE_KEY })
  : null

/**
 * Подсказка по виду ключа. Настоящий ключ к API начинается с sk-ant-api;
 * если там что-то другое, дело не в оплате и не в модели, а в том, что
 * скопировали не то — и сказать об этом лучше сразу.
 */
function keyHint (): string {
  if (!CLAUDE_KEY) return 'ключ не задан'
  if (!CLAUDE_KEY.startsWith('sk-ant-')) {
    return `ключ не похож на ключ к API (начинается с «${CLAUDE_KEY.slice(0, 7)}…», `
      + 'а должен с «sk-ant-api»)'
  }
  return `ключ вида sk-ant, длина ${CLAUDE_KEY.length}`
}

// Схема ответа для квеста (structured outputs).
//
// Задания названы по именам, а не сложены в массив из трёх: так модель не
// может перепутать их порядок, а число вопросов в квизе и диапазон верного
// ответа проверяет сам провайдер — до того, как ответ дойдёт до нас.
//
// Схема описана обычным JSON Schema, без zod: одной зависимостью меньше в
// функции, которую разворачивают вставкой кода в панель.
const QUIZ_QUESTION = {
  type: 'object',
  additionalProperties: false,
  required: ['question', 'options', 'correct_index'],
  properties: {
    question: { type: 'string' },
    options: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
    correct_index: { type: 'integer', minimum: 0, maximum: 3 },
  },
}

const QUEST_FORMAT = {
  type: 'json_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'geo', 'photo', 'quiz'],
    properties: {
      title: { type: 'string' },
      geo: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'description', 'place_index', 'minutes'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          // Номер места из списка «что рядом». Модель выбирает из готовых
          // точек, а не выдумывает координаты: выдуманные не проверить, и
          // задание стало бы невыполнимым.
          place_index: { type: 'integer' },
          // Сколько минут нужно пробыть на месте, чтобы задание засчиталось.
          minutes: { type: 'integer' },
        },
      },
      photo: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'description', 'prompt'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          // Что именно должно быть в кадре — по этому же тексту снимок и проверяется.
          prompt: { type: 'string' },
        },
      },
      quiz: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'description', 'questions'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          questions: { type: 'array', items: QUIZ_QUESTION, minItems: 6, maxItems: 6 },
        },
      },
    },
  },
}

const PHOTO_FORMAT = {
  type: 'json_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['ok', 'reason'],
    properties: { ok: { type: 'boolean' }, reason: { type: 'string' } },
  },
}

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

const INTEREST_TITLES: Record<string, string> = {
  party: 'тусовки', chill: 'чилл', bar: 'бары', walk: 'прогулки',
  boardgames: 'настолки', other: 'разное', sport: 'спорт', run: 'бег',
  bike: 'велосипед', yoga: 'йога', music: 'музыка', cinema: 'кино',
  books: 'книги', food: 'еда', coffee: 'кофе', travel: 'путешествия',
  photo: 'фотография', art: 'искусство', dance: 'танцы', it: 'айти',
  languages: 'языки', animals: 'животные', quiz: 'квизы', anime: 'аниме',
  volunteer: 'волонтёрство', theatre: 'театр',
}

const CATEGORY_TITLES: Record<string, string> = {
  party: 'Тусовка',
  chill: 'Чилл',
  bar: 'Бар',
  walk: 'Прогулка',
  boardgames: 'Настолки',
  other: 'Другое',
}

// Функция отвечает на два вида запросов: придумать квест и посмотреть на
// снимок. Отдельная функция под проверку фотографий потребовала бы ещё
// одного развёртывания вручную, а работа та же — сходить в модель.
interface PhotoRequest {
  kind: 'photo'
  prompt: string
  /** Снимок строкой; клиент заранее уменьшает его до 1280 точек. */
  image: string
}

const PHOTO_SCHEMA = {
  type: 'object',
  required: ['ok', 'reason'],
  properties: {
    ok: { type: 'boolean' },
    reason: { type: 'string' },
  },
}

/**
 * Проверяющий промпт намеренно снисходительный. Задание выполняет человек,
 * который стоит на месте и видит больше, чем помещается в кадр; строгая
 * проверка отвергала бы правильные снимки из-за темноты и ракурса.
 */
function photoPrompt (task: string): string {
  return `Человек выполняет задание в приложении для встреч и прислал снимок.

Задание звучало так: «${task}»

Реши, похоже ли, что человек действительно его выполнил.

Как судить:
- Будь снисходителен. Засчитывай, если снимок правдоподобно относится к
  заданию, даже если он тёмный, смазанный, снят сбоку или издалека.
- Не требуй художественного качества и точного кадрирования.
- Не засчитывай только явное несоответствие: снимок совсем о другом, скриншот,
  картинка из интернета, пустая стена вместо предмета.
- В поле reason напиши одно короткое предложение по-русски, обращаясь на «ты».
  Если засчитано — что видно на снимке. Если нет — чего не хватает, чтобы
  человек понял, что переснять.`
}

interface NearbyPlace {
  name: string
  /** Чем это место является: парк, кафе, памятник — словом, а не кодом OSM. */
  kind: string
  lat: number
  lng: number
  /** Сколько метров от места встречи. */
  meters: number
}

interface QuestContext {
  title: string
  description?: string
  category: string
  address: string
  /** Координаты места встречи — от них строится маршрут гео-задания. */
  lat?: number
  lng?: number
  /** Что есть вокруг: из этого списка модель выбирает цель гео-задания. */
  nearby?: NearbyPlace[]
  /** Город: одно и то же название улицы есть в десятке городов. */
  city?: string
  /** Время начала — «вечером в пятницу» и «в среду утром» просят разного. */
  startsAt?: string
  participants: number
  /** Интересы собравшихся, от самых частых в компании к редким. */
  interests?: string[]
}

/** «в пятницу вечером» — понятнее модели, чем строка с часовым поясом. */
function whenLabel (iso?: string): string {
  if (!iso) return 'время не указано'

  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'время не указано'

  const weekday = ['в воскресенье', 'в понедельник', 'во вторник', 'в среду',
                   'в четверг', 'в пятницу', 'в субботу'][date.getUTCDay()]
  const hour = date.getUTCHours()
  const part = hour < 6 ? 'ночью' : hour < 11 ? 'утром' : hour < 17 ? 'днём'
    : hour < 22 ? 'вечером' : 'поздно вечером'

  return `${weekday} ${part}, около ${hour}:00 по всемирному времени`
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
          // Только у гео-задания: номер выбранной точки из списка «что
          // рядом» и сколько минут там нужно пробыть.
          place_index: { type: 'integer' },
          minutes: { type: 'integer' },
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
  const interests = ctx.interests?.length
    ? ctx.interests.map((code) => INTEREST_TITLES[code] ?? code).join(', ')
    : 'не указаны'

  const places = (ctx.nearby ?? []).length
    ? (ctx.nearby ?? []).map((place, index) =>
        `  ${index}. ${place.name} — ${place.kind}, ${place.meters} м от места встречи`).join('\n')
    : '  список пуст'

  return `Ты придумываешь квесты для приложения Questa — оно превращает обычную
встречу небольшой компании в короткую игру.

Контекст встречи:
- название: ${ctx.title}
- описание: ${ctx.description || 'не указано'}
- категория: ${category}
- город: ${ctx.city || 'не указан'}
- место встречи: ${ctx.address}
- когда: ${whenLabel(ctx.startsAt)}
- собралось человек: ${ctx.participants}
- интересы собравшихся, от самого частого к редкому: ${interests}

Что есть рядом с местом встречи (номер, название, чем является, расстояние):
${places}

Главное требование: задания должны быть про эту встречу и никакую другую.
Человек, прочитав их, должен узнать своё место, свою компанию и свою тему.
Общие формулировки вроде «сделайте селфи всей компанией» или «дойдите до
ближайшего памятника» не годятся: по ним не понять, о какой встрече речь.

Название и описание встречи — главный источник темы, важнее адреса. Люди
написали их сами и ждут, что квест будет про то, зачем они собрались. Если
в описании сказано, чем компания планирует заняться, задания должны
говорить об этом же; адрес и интересы дополняют тему, а не заменяют её.

Придумай квест ровно из трёх заданий, строго в таком порядке.

1. type "geolocation" — маленькая вылазка: дойти от места встречи до
   другой точки и побыть там. На само место встречи звать не нужно —
   приход к началу отмечается отдельной кнопкой и к квесту отношения не
   имеет. Задание здесь в том, чтобы компания на несколько минут вышла
   куда-то ещё.

   Цель выбирается из списка «что есть рядом» выше: в place_index поставь
   номер строки. Придумывать своё место или координаты нельзя — приложение
   проверяет приход по координатам из списка, и выдуманная точка сделает
   задание невыполнимым. Если список пуст, поставь place_index -1: тогда
   целью останется место встречи.

   Выбирай по смыслу, а не по близости: место должно подходить теме
   встречи и времени суток, и до него должно быть разумно дойти пешком.
   В minutes поставь, сколько минут там нужно пробыть, — от 3 до 10; это
   время, которое компания проведёт на месте, а не время дороги.
   В description объясни, зачем туда идти и что там делать вместе: не
   «дойдите до точки», а короткое дело на эти несколько минут, связанное
   с темой встречи.

2. type "photo" — снимок. В поле prompt назови один конкретный предмет или
   объект, который обязан попасть в кадр, и свяжи его с местом или темой
   встречи: вывеска заведения, конкретная скульптура, чашка с рисунком,
   игровое поле, сцена, велосипед у входа. Не пиши «что-нибудь
   атмосферное» — задание должно проверяться взглядом: предмет либо в
   кадре, либо нет. В description — та же мысль дружелюбной фразой.

3. type "quiz" — ровно 6 вопросов с 4 вариантами ответа. Тема берётся из
   встречи: место и его история, город, тема самого ивента или самый
   частый интерес компании. Вопросы должны быть разными по сложности, с
   однозначно верным ответом и правдоподобными неверными вариантами.
   correct_index — индекс верного варианта, от 0 до 3, и он должен быть
   разным у разных вопросов.

Ещё требования:
- Задания выполняются за несколько минут и не требуют денег, покупок,
  специального инвентаря или разрешения посторонних.
- Учитывай время суток: ночью не отправляй в закрытый парк, утром — в бар.
- Ничего опасного, противозаконного и унизительного. Не требуй покупать
  или употреблять алкоголь и не строй задание вокруг выпивки — но и не
  делай вид, что темы встречи не существует: если компания собралась в
  баре или «попить пива», задание может быть про место, про компанию, про
  разговор или про сам напиток как предмет в кадре. Тему обходим
  аккуратно, а не молча заменяем другой.
- Тон дружелюбный, на «ты», по-русски. Заголовки короткие, до 40 символов,
  и тоже про эту встречу, а не «Задание 1».`
}

// ─────────── сторонний провайдер по протоколу OpenAI ───────────
//
// Сюда подключается любой сервис, говорящий на протоколе chat/completions:
// сам OpenAI, российские агрегаторы, локальная модель. Нужны три значения:
// адрес, ключ и название модели. Не задан адрес — провайдер просто не
// участвует, и цепочка работает как прежде.
const AI_BASE_URL = (Deno.env.get('AI_BASE_URL') ?? '').trim().replace(/\/+$/, '')
const AI_API_KEY = (Deno.env.get('AI_API_KEY') ?? '').trim().replace(/^["']|["']$/g, '')
const AI_MODEL = (Deno.env.get('AI_MODEL') ?? '').trim()

const customReady = Boolean(AI_BASE_URL && AI_API_KEY && AI_MODEL)

/**
 * Запрос к стороннему провайдеру.
 *
 * Схема ответа просится через response_format. Не все сервисы его умеют,
 * поэтому отказ по этой причине не считается провалом: повторяем запрос без
 * схемы и разбираем ответ сами — модель и так просят вернуть JSON.
 */
/**
 * Адреса, по которым стоит попробовать.
 *
 * Одни сервисы дают базовый адрес уже с /v1, другие без него, и человек
 * копирует то, что написано у них в документации. Промах по этой мелочи
 * выглядит как «сервис не отвечает», поэтому проверяем оба варианта.
 */
function endpoints (): string[] {
  const urls = [`${AI_BASE_URL}/chat/completions`]
  if (!/\/v\d+$/.test(AI_BASE_URL)) urls.push(`${AI_BASE_URL}/v1/chat/completions`)
  return urls
}

async function askCustom (
  messages: unknown[], schema: Record<string, unknown>, maxTokens: number,
): Promise<unknown> {
  const call = async (withSchema: boolean, url: string) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: maxTokens,
        messages,
        ...(withSchema
          ? {
              response_format: {
                type: 'json_schema',
                json_schema: { name: 'questa', strict: true, schema },
              },
            }
          : {}),
      }),
    })

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300)
      throw new Error(`${response.status}: ${detail}`)
    }

    const data = await response.json()
    const text = data?.choices?.[0]?.message?.content
    if (typeof text !== 'string') throw new Error('ответ без содержимого')

    // Некоторые сервисы оборачивают JSON в ```json … ``` — снимаем обёртку.
    return JSON.parse(text.replace(/^```(?:json)?|```$/g, '').trim())
  }

  let last: unknown = new Error('нет адреса')

  for (const url of endpoints()) {
    try {
      return await call(true, url)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)

      // Схему не приняли — повторяем без неё по тому же адресу: JSON модель
      // всё равно просят вернуть словами.
      if (/response_format|json_schema|400/i.test(message)) {
        try {
          return await call(false, url)
        } catch (second) {
          last = second
          continue
        }
      }

      last = cause
      // 404 — скорее всего промах с /v1: пробуем следующий адрес.
      if (!/404/.test(message)) break
    }
  }

  throw last
}

/**
 * Ответ по схеме приходит текстом в первом блоке — разбираем его один раз
 * для обоих запросов. Схему гарантирует провайдер, поэтому проверяем только
 * то, что текст вообще пришёл и оказался разбираемым.
 */
function readJson (response: { content: Array<{ type: string; text?: string }> }): unknown {
  const text = response.content.find((block) => block.type === 'text')?.text
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** Награды за задания одинаковы у обеих моделей — это правило Системы. */
const REWARDS = { geolocation: 20, photo: 25, quiz: 30 }

/**
 * Параметры гео-задания: откуда, куда и сколько там быть.
 *
 * Координаты берутся из списка мест, который ушёл модели, — по номеру
 * строки. Так задание всегда указывает на существующую точку: модель
 * выбирает из готового, а не сочиняет широту и долготу, проверить которые
 * нечем. Не выбрала ничего (или рядом ничего не нашлось) — целью остаётся
 * место встречи, и задание превращается в обычный приход.
 */
function geoParams (ctx: QuestContext, index: unknown, minutes: unknown) {
  const list = ctx.nearby ?? []
  const chosen = typeof index === 'number' && index >= 0 && index < list.length
    ? list[index]
    : null

  const held = typeof minutes === 'number' && minutes >= 1 && minutes <= 15
    ? Math.round(minutes)
    : 5

  return {
    // Точка старта — место встречи: экран показывает маршрут целиком.
    from_latitude: ctx.lat,
    from_longitude: ctx.lng,
    target_latitude: chosen?.lat ?? ctx.lat,
    target_longitude: chosen?.lng ?? ctx.lng,
    place_name: chosen?.name,
    radius_meters: 60,
    duration_seconds: held * 60,
  }
}

/**
 * Квест от Claude.
 *
 * Ответ приходит строго по схеме (structured outputs): модель не может
 * вернуть четыре задания, перепутать их порядок или указать номер верного
 * ответа за пределами списка. Проверять после этого почти нечего —
 * остаётся разложить ответ в тот вид, который ждёт приложение.
 */
async function questWithClaude (ctx: QuestContext) {
  if (!claude) return null

  const response = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    system: 'Ты придумываешь квесты для приложения Questa. Отвечай по-русски.',
    messages: [{ role: 'user', content: buildPrompt(ctx) }],
    output_config: { format: QUEST_FORMAT },
  })

  const quest = readJson(response) as {
    title: string
    geo: { title: string; description: string; place_index?: number; minutes?: number }
    photo: { title: string; description: string; prompt: string }
    quiz: { title: string; description: string; questions: unknown[] }
  } | null

  if (!quest?.geo || !quest?.photo || !quest?.quiz) return null

  return {
    title: quest.title,
    tasks: [
      {
        type: 'geolocation',
        title: quest.geo.title.slice(0, 60),
        description: quest.geo.description,
        qp_reward: REWARDS.geolocation,
        is_shared: false,
        params: geoParams(ctx, quest.geo.place_index, quest.geo.minutes),
      },
      {
        type: 'photo',
        title: quest.photo.title.slice(0, 60),
        description: quest.photo.description,
        qp_reward: REWARDS.photo,
        is_shared: false,
        params: { prompt: quest.photo.prompt },
      },
      {
        type: 'quiz',
        title: quest.quiz.title.slice(0, 60),
        description: quest.quiz.description,
        qp_reward: REWARDS.quiz,
        is_shared: true,
        params: { questions: quest.quiz.questions },
      },
    ],
  }
}

/**
 * Опрос поставщиков для страницы самопроверки.
 *
 * Нужен потому, что в обычной работе отказ первого поставщика не виден:
 * если ответил следующий, запрос успешен, и причина остаётся только в
 * журнале функции. Здесь каждый опрашивается отдельно и рассказывает о
 * себе сам — включая коды ответов по обоим возможным адресам.
 *
 * Секреты наружу не выдаются: только длина ключа и его первые символы.
 */
async function probeProviders (geminiKey?: string) {
  const report: Array<{ name: string; ok: boolean; detail: string }> = []

  // ── свой сервис ──
  const missing = [
    !AI_BASE_URL && 'AI_BASE_URL',
    !AI_API_KEY && 'AI_API_KEY',
    !AI_MODEL && 'AI_MODEL',
  ].filter(Boolean)

  if (missing.length) {
    report.push({
      name: 'Свой сервис',
      ok: false,
      detail: `не настроен: не задано ${missing.join(', ')}`,
    })
  } else {
    const head = `${AI_BASE_URL} · модель ${AI_MODEL} · ключ ${AI_API_KEY.slice(0, 3)}…`
      + `${AI_API_KEY.length} символов`

    // Сначала дёшево: список моделей по обоим адресам. Код ответа сразу
    // говорит, верен ли адрес и принимают ли ключ, и не тратит токены.
    const paths = [`${AI_BASE_URL}/models`]
    if (!/\/v\d+$/.test(AI_BASE_URL)) paths.push(`${AI_BASE_URL}/v1/models`)

    const seen: string[] = []
    for (const path of paths) {
      try {
        const response = await fetch(path, {
          headers: { authorization: `Bearer ${AI_API_KEY}` },
        })
        const body = (await response.text()).slice(0, 200)
        seen.push(`${path} → ${response.status} ${body}`)
      } catch (cause) {
        seen.push(`${path} → не отвечает: ${cause instanceof Error ? cause.message : cause}`)
      }
    }

    // Затем настоящий запрос — тот же, что уходит за квестом, но крошечный.
    try {
      const reply = await askCustom(
        [{ role: 'user', content: 'Верни JSON: {"ok": true, "reason": "готов"}' }],
        PHOTO_FORMAT.schema,
        100,
      )
      report.push({
        name: 'Свой сервис',
        ok: true,
        detail: `${head} · ответил: ${JSON.stringify(reply).slice(0, 120)}`,
      })
    } catch (cause) {
      report.push({
        name: 'Свой сервис',
        ok: false,
        detail: `${head} · запрос: ${cause instanceof Error ? cause.message : cause} · `
          + seen.join(' | '),
      })
    }
  }

  // ── Claude ──
  if (!claude) {
    report.push({
      name: 'Claude',
      ok: false,
      detail: CLAUDE_KEY ? keyHint() : 'не настроен: ANTHROPIC_API_KEY не задан',
    })
  } else {
    try {
      await claude.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Ответь словом: готов' }],
      })
      report.push({ name: 'Claude', ok: true, detail: `${CLAUDE_MODEL} ответил` })
    } catch (cause) {
      report.push({
        name: 'Claude',
        ok: false,
        detail: `${CLAUDE_MODEL}: ${cause instanceof Error ? cause.message : cause}`,
      })
    }
  }

  // ── Gemini ──
  if (!geminiKey) {
    report.push({ name: 'Gemini', ok: false, detail: 'не настроен: GEMINI_API_KEY не задан' })
  } else {
    const model = MODELS[0]
    try {
      const response = await fetch(`${ENDPOINT}/${model}:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Ответь словом: готов' }] }] }),
      })
      report.push({
        name: 'Gemini',
        ok: response.ok,
        detail: response.ok ? `${model} ответил` : `${model} → ${response.status}`,
      })
    } catch (cause) {
      report.push({
        name: 'Gemini',
        ok: false,
        detail: `${model}: ${cause instanceof Error ? cause.message : cause}`,
      })
    }
  }

  return report
}

/** Квест от стороннего провайдера — тот же контекст, та же схема. */
async function questWithCustom (ctx: QuestContext) {
  if (!customReady) return null

  const quest = await askCustom([
    { role: 'system', content: 'Ты придумываешь квесты для приложения Questa. Отвечай по-русски и только JSON по схеме.' },
    { role: 'user', content: buildPrompt(ctx) },
  ], QUEST_FORMAT.schema, 4000) as {
    title?: string
    geo?: { title: string; description: string; place_index?: number; minutes?: number }
    photo?: { title: string; description: string; prompt: string }
    quiz?: { title: string; description: string; questions: unknown[] }
  } | null

  if (!quest?.geo || !quest?.photo || !quest?.quiz) return null

  return {
    title: quest.title ?? 'Квест встречи',
    tasks: [
      {
        type: 'geolocation',
        title: quest.geo.title.slice(0, 60),
        description: quest.geo.description,
        qp_reward: REWARDS.geolocation,
        is_shared: false,
        params: geoParams(ctx, quest.geo.place_index, quest.geo.minutes),
      },
      {
        type: 'photo',
        title: quest.photo.title.slice(0, 60),
        description: quest.photo.description,
        qp_reward: REWARDS.photo,
        is_shared: false,
        params: { prompt: quest.photo.prompt },
      },
      {
        type: 'quiz',
        title: quest.quiz.title.slice(0, 60),
        description: quest.quiz.description,
        qp_reward: REWARDS.quiz,
        is_shared: true,
        params: { questions: quest.quiz.questions },
      },
    ],
  }
}

/** Взгляд стороннего провайдера на снимок. Картинка идёт строкой data:. */
async function photoWithCustom (prompt: string, image: string) {
  if (!customReady) return null

  const verdict = await askCustom([{
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } },
      { type: 'text', text: photoPrompt(prompt) },
    ],
  }], PHOTO_FORMAT.schema, 1000) as { ok?: unknown; reason?: unknown } | null

  if (typeof verdict?.ok !== 'boolean') return null
  return { ok: verdict.ok, reason: String(verdict.reason ?? '') }
}

/** Взгляд Claude на снимок — тем же способом, ответ по схеме. */
async function photoWithClaude (prompt: string, image: string) {
  if (!claude) return null

  const response = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: [
        // Картинка идёт перед текстом: так модель сначала смотрит, а потом
        // читает, что от неё хотят, — это рекомендация Anthropic.
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
        { type: 'text', text: photoPrompt(prompt) },
      ],
    }],
    output_config: { format: PHOTO_FORMAT },
  })

  const verdict = readJson(response) as { ok?: unknown; reason?: unknown } | null
  if (typeof verdict?.ok !== 'boolean') return null

  return { ok: verdict.ok, reason: String(verdict.reason ?? '') }
}

/** Проверяет ответ модели. Возвращает квест или null, если ответ не годится. */
function validateQuest (raw: unknown, ctx: QuestContext) {
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
      return {
        ...base,
        params: geoParams(ctx, task.place_index, task.minutes),
        is_shared: false,
      }
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

/** Взгляд модели на снимок. Отказ проверки разбирает уже клиент. */
async function checkPhoto (
  { prompt, image }: PhotoRequest,
  apiKey: string,
  json: (body: unknown, status?: number) => Response,
): Promise<Response> {
  const body = JSON.stringify({
    contents: [{
      parts: [
        { text: photoPrompt(prompt) },
        { inlineData: { mimeType: 'image/jpeg', data: image } },
      ],
    }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: PHOTO_SCHEMA,
    },
  })

  for (const model of MODELS) {
    try {
      const response = await fetch(`${ENDPOINT}/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      })
      if (!response.ok) continue

      const data = await response.json()
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
      if (typeof text !== 'string') continue

      const verdict = JSON.parse(text)
      if (typeof verdict?.ok !== 'boolean') continue

      return json({ ok: verdict.ok, reason: String(verdict.reason ?? ''), model })
    } catch {
      // пробуем следующую модель
    }
  }

  return json({ error: 'Проверка недоступна' }, 502)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'content-type': 'application/json' },
    })

  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey && !claude && !customReady) {
    return json({ error: 'Ключ модели не настроен' }, 503)
  }

  let payload: QuestContext | PhotoRequest
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'Некорректный запрос' }, 400)
  }

  if ((payload as { kind?: string })?.kind === 'probe') {
    return json({ providers: await probeProviders(apiKey) })
  }

  if ((payload as PhotoRequest)?.kind === 'photo') {
    const request = payload as PhotoRequest
    if (!request.prompt || !request.image) {
      return json({ error: 'Не хватает снимка или задания' }, 400)
    }

    // Первым — подключённый вручную провайдер, если он настроен.
    if (customReady) {
      try {
        const verdict = await photoWithCustom(request.prompt, request.image)
        if (verdict) return json({ ...verdict, model: AI_MODEL })
      } catch (cause) {
        console.error('custom photo failed', cause)
      }
    }

    // Затем Claude: он и смотрит внимательнее, и отвечает по схеме.
    if (claude) {
      try {
        const verdict = await photoWithClaude(request.prompt, request.image)
        if (verdict) return json({ ...verdict, model: CLAUDE_MODEL })
      } catch (cause) {
        // Отказ Claude — не конец: ниже пробуем запасную модель.
        console.error('claude photo failed', cause, keyHint())
      }
    }

    if (!apiKey) return json({ error: 'Проверка недоступна' }, 502)
    return await checkPhoto(request, apiKey, json)
  }

  const ctx = payload as QuestContext

  if (!ctx?.title || !ctx?.category || !ctx?.address) {
    return json({ error: 'Не хватает контекста ивента' }, 400)
  }

  // Причина отказа возвращается вызывающему, а не только пишется в журнал:
  // журнал функции виден лишь в панели Supabase, а разбираться приходится по
  // тому, что видно в приложении.
  const failures: string[] = []

  // Подключённый вручную провайдер идёт первым: его выбрали осознанно.
  if (customReady) {
    try {
      const quest = await questWithCustom(ctx)
      if (quest) return json({ ...quest, model: AI_MODEL })
      failures.push(`${AI_MODEL}: ответ без нужных полей`)
    } catch (cause) {
      console.error('custom quest failed', cause)
      failures.push(`${AI_MODEL}: ${cause instanceof Error ? cause.message : cause}`)
    }
  }

  // Следом Claude. Его отказ не роняет запрос: ниже остаётся Gemini.
  if (claude) {
    try {
      const quest = await questWithClaude(ctx)
      if (quest) return json({ ...quest, model: CLAUDE_MODEL })
    } catch (cause) {
      console.error('claude quest failed', cause)
      failures.push(
        `${CLAUDE_MODEL}: ${cause instanceof Error ? cause.message : cause} · ${keyHint()}`,
      )
    }
  }

  if (!apiKey) {
    return json({ error: 'Модель не ответила', details: failures }, 502)
  }

  const body = JSON.stringify({
    contents: [{ parts: [{ text: buildPrompt(ctx) }] }],
    generationConfig: {
      temperature: 1,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  })

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

        const quest = validateQuest(JSON.parse(text), ctx)
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
