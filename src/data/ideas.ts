import type { CategoryCode } from './demo'
import { distanceMeters } from '../lib/geo'
import { venuesFor, type Venue } from './venues'

/**
 * Готовые идеи для встреч. Показываются на главной: пустой список чужих
 * ивентов не подсказывает, что делать дальше, а подборка идей подталкивает
 * создать свой — ровно та роль «мотиватора», которую ТЗ 2.4 отводит
 * приложению.
 *
 * Каждая идея заполняет форму создания за пользователя: название,
 * описание, категорию, время и размер компании, а если рядом нашлось
 * подходящее место — то и его.
 */
export interface Idea {
  title: string
  pitch: string
  category: CategoryCode
  description: string
  /** Во сколько такое обычно собирают, по местному времени. */
  hour: number
  participants: [number, number]
  /**
   * Где такое проходит. По этому подбирается место рядом: звать на квиз в
   * парк так же нелепо, как на пробежку в торговый центр.
   */
  setting: 'outdoor' | 'indoor' | 'any'
}

export const IDEAS: Idea[] = [
  // ─── утро ───
  {
    title: 'Утренний забег вдоль пруда',
    pitch: 'Пять километров в спокойном темпе и кофе после',
    category: 'walk', hour: 9, participants: [2, 6], setting: 'outdoor',
    description: 'Бежим в комфортном темпе, никого не ждём на результат. После — кофе рядом.',
  },
  {
    title: 'Завтрак с незнакомцами',
    pitch: 'Час на кофе и разговоры перед рабочим днём',
    category: 'chill', hour: 10, participants: [2, 4], setting: 'indoor',
    description: 'Ровно час: завтракаем, знакомимся и расходимся по делам.',
  },
  {
    title: 'Зарядка на свежем воздухе',
    pitch: 'Полчаса разминки, чтобы день начался бодро',
    category: 'walk', hour: 8, participants: [2, 8], setting: 'outdoor',
    description: 'Простые упражнения без подготовки. Коврик по желанию, хорошее настроение обязательно.',
  },
  {
    title: 'Рассветная прогулка',
    pitch: 'Встречаем утро, пока город ещё пустой',
    category: 'walk', hour: 7, participants: [2, 5], setting: 'outdoor',
    description: 'Выходим рано, идём медленно и молчим больше обычного. Термос приветствуется.',
  },

  // ─── день ───
  {
    title: 'Прогулка по незнакомому району',
    pitch: 'Выбираем район, где никто из нас не был',
    category: 'walk', hour: 15, participants: [2, 5], setting: 'outdoor',
    description: 'Гуляем без маршрута и заходим туда, куда обычно не доходим.',
  },
  {
    title: 'Фотопрогулка',
    pitch: 'Снимаем город на то, что есть в кармане',
    category: 'walk', hour: 16, participants: [2, 6], setting: 'outdoor',
    description: 'Снимаем на телефоны, в конце выбираем лучший кадр компании.',
  },
  {
    title: 'Пикник со своим',
    pitch: 'Каждый приносит одно блюдо и рассказывает о нём',
    category: 'chill', hour: 14, participants: [3, 8], setting: 'outdoor',
    description: 'Каждый берёт что-то одно. Плед, музыка и два часа без спешки.',
  },
  {
    title: 'Книжный обмен',
    pitch: 'Приносим прочитанное, уносим чужое',
    category: 'chill', hour: 13, participants: [3, 8], setting: 'any',
    description: 'Приносим по книге, коротко рассказываем, почему её стоит прочесть, и меняемся.',
  },
  {
    title: 'Велозаезд по набережной',
    pitch: 'Неспешный круг и остановка на кофе',
    category: 'walk', hour: 12, participants: [2, 6], setting: 'outdoor',
    description: 'Катим в разговорном темпе, маршрут выбираем на месте. Свой велосипед или прокат.',
  },
  {
    title: 'Скетчинг на улице',
    pitch: 'Рисуем что видим, умение не требуется',
    category: 'chill', hour: 14, participants: [2, 6], setting: 'outdoor',
    description: 'Блокнот и карандаш. Рисуем час, потом показываем друг другу, что вышло.',
  },
  {
    title: 'Бадминтон в парке',
    pitch: 'Пара ракеток и никакого счёта',
    category: 'walk', hour: 13, participants: [2, 6], setting: 'outdoor',
    description: 'Играем без правил и рейтинга, меняемся парами. Ракетки — у кого есть.',
  },
  {
    title: 'Поход в музей компанией',
    pitch: 'Идём вместе, обсуждаем после',
    category: 'chill', hour: 12, participants: [2, 5], setting: 'indoor',
    description: 'Ходим по выставке в своём темпе, а потом делимся впечатлениями за кофе.',
  },

  // ─── вечер ───
  {
    title: 'Настолки для новичков',
    pitch: 'Правила объясняем на месте, опыт не нужен',
    category: 'boardgames', hour: 18, participants: [3, 6], setting: 'indoor',
    description: 'Берём пару коротких игр, правила объясняем на месте. Приходить можно одному.',
  },
  {
    title: 'Кино и обсуждение',
    pitch: 'Смотрим фильм, потом спорим о нём за чаем',
    category: 'chill', hour: 19, participants: [3, 6], setting: 'indoor',
    description: 'Фильм выбираем голосованием на месте. Обсуждение обязательно.',
  },
  {
    title: 'Квиз-вечер в баре',
    pitch: 'Команда собирается на месте, вопросы — от приложения',
    category: 'bar', hour: 20, participants: [3, 8], setting: 'indoor',
    description: 'Собираемся командой, играем в квиз от приложения и знакомимся.',
  },
  {
    title: 'Караоке без стеснения',
    pitch: 'Поём по очереди, никто никого не оценивает',
    category: 'party', hour: 20, participants: [3, 8], setting: 'indoor',
    description: 'Формат простой: поём по очереди, поддерживаем друг друга.',
  },
  {
    title: 'Закат на высокой точке',
    pitch: 'Смотрим, как город выключает свет',
    category: 'chill', hour: 19, participants: [2, 6], setting: 'outdoor',
    description: 'Находим место с видом, встречаем закат и остаёмся на час разговоров.',
  },
  {
    title: 'Мафия вживую',
    pitch: 'Классика на десятерых, ведущий из своих',
    category: 'boardgames', hour: 19, participants: [6, 10], setting: 'indoor',
    description: 'Играем несколько кругов, ведущего выбираем жребием. Новичкам объясняем по ходу.',
  },
  {
    title: 'Дегустация кофе',
    pitch: 'Три сорта вслепую и спор о вкусе',
    category: 'chill', hour: 18, participants: [2, 5], setting: 'indoor',
    description: 'Пробуем несколько сортов вслепую и пытаемся угадать, что именно пьём.',
  },
  {
    title: 'Разговорный английский',
    pitch: 'Час только на английском, уровень любой',
    category: 'chill', hour: 19, participants: [3, 6], setting: 'indoor',
    description: 'Говорим на английском час, ошибки не исправляем. Темы вытягиваем случайно.',
  },
  {
    title: 'Вечер настольного тенниса',
    pitch: 'Круговой турнир без серьёзных лиц',
    category: 'party', hour: 19, participants: [3, 8], setting: 'indoor',
    description: 'Играем на вылет, проигравший подаёт следующему. Ракетки на месте.',
  },
  {
    title: 'Бар-хоппинг',
    pitch: 'Три места за вечер, по одному напитку',
    category: 'bar', hour: 20, participants: [3, 6], setting: 'indoor',
    description: 'Маршрут из трёх баров, в каждом по одному напитку и не больше получаса.',
  },
  {
    title: 'Вечер историй',
    pitch: 'Каждый рассказывает свою самую странную',
    category: 'chill', hour: 20, participants: [3, 7], setting: 'any',
    description: 'По кругу: каждый рассказывает историю из жизни, остальные не перебивают.',
  },
  {
    title: 'Джем для музыкантов',
    pitch: 'Приходим с инструментом или просто слушать',
    category: 'party', hour: 19, participants: [3, 8], setting: 'indoor',
    description: 'Играем что помним, подхватываем друг друга. Слушателям тоже рады.',
  },
  {
    title: 'Прогулка с собаками',
    pitch: 'Выгул превращаем в знакомство',
    category: 'walk', hour: 18, participants: [2, 6], setting: 'outdoor',
    description: 'Гуляем вместе, собаки знакомятся первыми. Без собаки тоже можно.',
  },
  {
    title: 'Настольный покер на фантики',
    pitch: 'Без денег, зато с азартом',
    category: 'boardgames', hour: 20, participants: [4, 8], setting: 'indoor',
    description: 'Играем на фишки, новичкам объясняем комбинации. Ставок на деньги нет.',
  },
]

/** Идея вместе с местом, которое нашлось для неё поблизости. */
export interface IdeaSuggestion extends Idea {
  place?: { address: string; lat: number; lng: number }
  /** Расстояние до места, если известно, где человек. */
  distance?: number
}

// Характер места читается по значку: у подборки мест значок и выбирался
// по тому, что это — парк, набережная, зал или заведение.
const OUTDOOR = '🎡🌉🌊🚶🌳🌲🏙⛲🦆🌅🏖🚴🪨🗿⚓🐈'

function isOutdoor (venue: Venue): boolean {
  return OUTDOOR.includes(venue.emoji)
}

function suits (idea: Idea, venue: Venue): boolean {
  if (idea.setting === 'any') return true
  return idea.setting === 'outdoor' ? isOutdoor(venue) : !isOutdoor(venue)
}

/**
 * Какая часть дня сейчас. Предлагать пробежку в десять вечера так же
 * бессмысленно, как бар-хоппинг в восемь утра.
 */
function partOfDay (hour: number): (idea: Idea) => boolean {
  if (hour < 11) return (idea) => idea.hour < 12
  if (hour < 17) return (idea) => idea.hour >= 11 && idea.hour < 18
  return (idea) => idea.hour >= 17
}

export interface IdeaRequest {
  count?: number
  /** Сдвиг подборки: кнопка «другие идеи» просто увеличивает его. */
  seed?: number
  at?: Date
  city?: string | null
  /** Где человек сейчас — чтобы предложить место рядом и показать расстояние. */
  near?: [number, number] | null
}

/**
 * Подборка идей на ближайшее время.
 *
 * Меняется сама: набор привязан к трёхчасовому отрезку суток, поэтому
 * утром, днём и вечером главная предлагает разное, а в течение одного
 * отрезка список не скачет под руками. Кнопкой можно попросить другие.
 */
export function ideasForNow (
  { count = 3, seed = 0, at = new Date(), city, near }: IdeaRequest = {},
): IdeaSuggestion[] {
  const fitting = IDEAS.filter(partOfDay(at.getHours()))
  const pool = fitting.length >= count ? fitting : IDEAS

  const slot = Math.floor(at.getTime() / (3 * 3_600_000)) + seed
  const chosen = Array.from(
    { length: Math.min(count, pool.length) },
    (_, index) => pool[(slot * count + index) % pool.length],
  )

  const venues = venuesFor(city)

  return chosen.map((idea, index) => {
    const matching = venues.filter((venue) => suits(idea, venue))
    if (matching.length === 0) return idea

    // Если знаем, где человек, — берём ближайшее подходящее место.
    // Если нет, перебираем подборку по тому же сдвигу, чтобы предложения
    // не повторялись от идеи к идее.
    const venue = near
      ? [...matching].sort(
          (a, b) => distanceMeters(near, [a.lat, a.lng]) - distanceMeters(near, [b.lat, b.lng]),
        )[index % Math.min(3, matching.length)]
      : matching[(slot + index) % matching.length]

    return {
      ...idea,
      place: {
        address: `${venue.title}, ${venue.address}`,
        lat: venue.lat,
        lng: venue.lng,
      },
      distance: near ? distanceMeters(near, [venue.lat, venue.lng]) : undefined,
    }
  })
}
