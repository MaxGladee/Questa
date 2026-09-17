import type { CategoryCode } from './demo'

/**
 * Готовые идеи для встреч. Показываются на главной, когда рядом мало чужих
 * ивентов: пустой список не подсказывает, что делать дальше, а подборка идей
 * подталкивает создать свой — ровно та роль «мотиватора», которую ТЗ 2.4
 * отводит приложению.
 *
 * Каждая идея заполняет форму создания ивента за пользователя.
 */
export interface Idea {
  title: string
  pitch: string
  category: CategoryCode
  description: string
  /** Во сколько такое обычно собирают, по местному времени. */
  hour: number
  participants: [number, number]
}

export const IDEAS: Idea[] = [
  {
    title: 'Утренний забег вдоль пруда',
    pitch: 'Пять километров в спокойном темпе и кофе после',
    category: 'walk', hour: 9, participants: [2, 6],
    description: 'Бежим в комфортном темпе, никого не ждём на результат. После — кофе рядом.',
  },
  {
    title: 'Настолки для новичков',
    pitch: 'Правила объясняем на месте, опыт не нужен',
    category: 'boardgames', hour: 18, participants: [3, 6],
    description: 'Берём пару коротких игр, правила объясняем на месте. Приходить можно одному.',
  },
  {
    title: 'Прогулка по незнакомому району',
    pitch: 'Выбираем район, где никто из нас не был',
    category: 'walk', hour: 17, participants: [2, 5],
    description: 'Гуляем без маршрута и заходим туда, куда обычно не доходим.',
  },
  {
    title: 'Кино и обсуждение',
    pitch: 'Смотрим фильм, потом спорим о нём за чаем',
    category: 'chill', hour: 19, participants: [3, 6],
    description: 'Фильм выбираем голосованием на месте. Обсуждение обязательно.',
  },
  {
    title: 'Квиз-вечер в баре',
    pitch: 'Команда собирается на месте, вопросы — от приложения',
    category: 'bar', hour: 20, participants: [3, 8],
    description: 'Собираемся командой, играем в квиз от приложения и знакомимся.',
  },
  {
    title: 'Завтрак с незнакомцами',
    pitch: 'Час на кофе и разговоры перед рабочим днём',
    category: 'chill', hour: 10, participants: [2, 4],
    description: 'Ровно час: завтракаем, знакомимся и расходимся по делам.',
  },
  {
    title: 'Фотопрогулка',
    pitch: 'Снимаем город на то, что есть в кармане',
    category: 'walk', hour: 16, participants: [2, 6],
    description: 'Снимаем на телефоны, в конце выбираем лучший кадр компании.',
  },
  {
    title: 'Караоке без стеснения',
    pitch: 'Поём по очереди, никто никого не оценивает',
    category: 'party', hour: 20, participants: [3, 8],
    description: 'Формат простой: поём по очереди, поддерживаем друг друга.',
  },
]

/** Три идеи на сегодня. Набор меняется день ото дня, но в течение дня стабилен. */
export function ideasForToday (count = 3): Idea[] {
  const day = Math.floor(Date.now() / 86_400_000)
  return Array.from({ length: count }, (_, index) => IDEAS[(day * count + index) % IDEAS.length])
}
