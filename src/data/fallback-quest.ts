import type { CategoryCode } from './demo'

/**
 * Запасной квест — когда модель не ответила.
 *
 * Прежде это были неизменные строки из коллекции в базе: «дойдите до места
 * встречи», «найдите деталь, которую другие не заметили». Они одинаковы для
 * любой встречи и потому звучат ни о чём. Здесь задания собираются из того,
 * что о встрече известно: адреса, категории, темы и города. Это не заменяет
 * модель — но человек хотя бы читает про своё место, а не про абстрактное.
 */
export interface FallbackTask {
  type: 'geolocation' | 'photo' | 'quiz'
  title: string
  description: string
  qp_reward: number
  is_shared: boolean
  params: Record<string, unknown>
}

export interface FallbackContext {
  title: string
  category: CategoryCode
  address: string
  city: string
  /** Координаты места встречи — начало маршрута гео-задания. */
  lat?: number
  lng?: number
  /** Что есть вокруг: первое подходящее станет целью гео-задания. */
  nearby?: { name: string; kind: string; lat: number; lng: number; meters: number }[]
}

/** Короткое имя места: «ЦПКИО им. Маяковского» из «ЦПКИО…, ул. Мичурина». */
function placeName (address: string): string {
  const first = address.split(',')[0]?.trim()
  return first && first.length > 2 ? first : address.trim()
}

/**
 * Что снимать — зависит от того, чем компания занята. Общее «сделайте фото
 * атмосферы» не проверяется ни человеком, ни моделью: в кадре может быть
 * что угодно. Здесь у каждой категории свой предмет.
 */
function photoTask (context: FallbackContext): FallbackTask {
  const place = placeName(context.address)

  const byCategory: Record<CategoryCode, { title: string; what: string }> = {
    bar: { title: 'Ваш столик', what: `столик, за которым сидите: стаканы, меню и компанию — в «${place}»` },
    party: { title: 'Где всё происходит', what: `место, где идёт веселье, — сцену, танцпол или гирлянды в «${place}»` },
    boardgames: { title: 'Партия в разгаре', what: 'разложенную игру на столе: поле, карты или фишки' },
    walk: { title: 'Точка маршрута', what: `ориентир, до которого дошли, — «${place}» целиком в кадре` },
    chill: { title: 'Что перед вами', what: 'то, что стоит перед вами на столе: кофе, еду или книгу' },
    sport: { title: 'Перед стартом', what: 'то, чем занимаетесь: кроссовки, мяч, велосипед или трассу перед собой' },
    food: { title: 'Что заказали', what: `блюдо, которое принесли, — целиком в кадре, в «${place}»` },
    coffee: { title: 'Ваша чашка', what: 'чашку с рисунком на пенке или стакан с логотипом кофейни' },
    theatre: { title: 'Что смотрите', what: `экспонат, афишу или зал «${place}» — так, чтобы было понятно, где вы` },
    music: { title: 'Откуда звук', what: 'сцену, экран с текстом или инструмент, под который поёте' },
    cinema: { title: 'Перед сеансом', what: `афишу фильма или вход в зал «${place}»` },
    games: { title: 'Что на экране', what: 'экран с игрой и джойстик или клавиатуру в кадре' },
    art: { title: 'Что получается', what: 'то, что делаете руками: рисунок, глину, ткань — вместе с рабочим столом' },
    quiz: { title: 'Команда в сборе', what: 'стол с бланком ответов и ручкой — так, чтобы было видно команду' },
    nature: { title: 'Куда добрались', what: 'вид, ради которого шли: воду, лес, поле или костёр' },
    other: { title: 'Место встречи', what: `вход или вывеску «${place}» так, чтобы название читалось` },
  }

  const { title, what } = byCategory[context.category] ?? byCategory.other

  return {
    type: 'photo',
    title,
    description: `Сфотографируйте ${what}.`,
    qp_reward: 25,
    is_shared: false,
    params: { prompt: `На снимке должен быть ${what}` },
  }
}

/**
 * Гео-задание — маленькая вылазка, а не приход на место встречи: на встречу
 * и так приходят, и отмечается это отдельной кнопкой. Цель берётся из
 * найденных вокруг мест; не нашлось ни одного — остаётся прежний вариант с
 * приходом по адресу, потому что вести людей в точку без координат нельзя.
 */
function geoTask (context: FallbackContext): FallbackTask {
  const place = placeName(context.address)
  const target = (context.nearby ?? [])[0]

  if (!target) {
    return {
      type: 'geolocation',
      title: `Дойти до «${place}»`,
      description: `Доберитесь до места встречи — ${context.address} — и задержитесь на пару `
        + 'минут: приложение само отметит, что вы на месте.',
      qp_reward: 20,
      is_shared: false,
      params: {
        radius_meters: 60,
        duration_seconds: 120,
        from_latitude: context.lat,
        from_longitude: context.lng,
      },
    }
  }

  return {
    type: 'geolocation',
    title: `Вылазка к «${target.name}»`.slice(0, 60),
    description: `Отойдите от места встречи к ${target.kind} «${target.name}» — это `
      + `${target.meters} м — и побудьте там пять минут всей компанией. `
      + 'Приложение засчитает задание само, как только вы дойдёте.',
    qp_reward: 20,
    is_shared: false,
    params: {
      radius_meters: 60,
      duration_seconds: 300,
      from_latitude: context.lat,
      from_longitude: context.lng,
      target_latitude: target.lat,
      target_longitude: target.lng,
      place_name: target.name,
    },
  }
}

interface Question {
  question: string
  options: string[]
  correct_index: number
}

/**
 * Вопросы о городе. Не «общая эрудиция», а то, что видно вокруг: реки,
 * площади, названия районов. Для городов без своей подборки берётся общая —
 * тоже про страну, а не про поп-культуру.
 */
const CITY_QUESTIONS: Record<string, Question[]> = {
  'Екатеринбург': [
    { question: 'На какой реке стоит Екатеринбург?', options: ['Тура', 'Исеть', 'Чусовая', 'Пышма'], correct_index: 1 },
    { question: 'В каком году основан город?', options: ['1723', '1781', '1698', '1812'], correct_index: 0 },
    { question: 'Как в городе называют Исторический сквер?', options: ['Стрелка', 'Плотинка', 'Набережная', 'Ротонда'], correct_index: 1 },
    { question: 'Какая граница проходит рядом с городом?', options: ['Европа и Азия', 'Север и Юг', 'Сибирь и Урал', 'Восток и Запад'], correct_index: 0 },
    { question: 'Как называется главная площадь Екатеринбурга?', options: ['Площадь Труда', 'Площадь 1905 года', 'Октябрьская', 'Привокзальная'], correct_index: 1 },
    { question: 'Какой завод дал имя большому району города?', options: ['Уралмаш', 'Севмаш', 'Ижмаш', 'Кировец'], correct_index: 0 },
  ],
  'Москва': [
    { question: 'В каком году Москва впервые упомянута в летописи?', options: ['1147', '1237', '1380', '1054'], correct_index: 0 },
    { question: 'Как называется река, давшая имя городу?', options: ['Яуза', 'Москва', 'Ока', 'Клязьма'], correct_index: 1 },
    { question: 'В каком году открылось московское метро?', options: ['1935', '1917', '1955', '1947'], correct_index: 0 },
    { question: 'Как расшифровывается ВДНХ?', options: ['Выставка достижений народного хозяйства', 'Всероссийский дом народных художеств', 'Восточный дворец науки и хозяйства', 'Выставочный дом народного капитала'], correct_index: 0 },
    { question: 'С какой смотровой площадки видно почти весь центр?', options: ['Воробьёвы горы', 'Крылатские холмы', 'Поклонная гора', 'Лосиный остров'], correct_index: 0 },
    { question: 'Что находится на Красной площади?', options: ['Эрмитаж', 'Собор Василия Блаженного', 'Петропавловская крепость', 'Мамаев курган'], correct_index: 1 },
  ],
  'Санкт-Петербург': [
    { question: 'В каком году основан Санкт-Петербург?', options: ['1703', '1721', '1682', '1762'], correct_index: 0 },
    { question: 'На какой реке стоит город?', options: ['Волхов', 'Нева', 'Свирь', 'Луга'], correct_index: 1 },
    { question: 'Как называют Петербург неофициально?', options: ['Северная столица', 'Третий Рим', 'Ворота Сибири', 'Русский Детройт'], correct_index: 0 },
    { question: 'Какой музей занимает Зимний дворец?', options: ['Русский музей', 'Эрмитаж', 'Кунсткамера', 'Этнографический музей'], correct_index: 1 },
    { question: 'Что стоит на Заячьем острове?', options: ['Петропавловская крепость', 'Смольный', 'Адмиралтейство', 'Исаакиевский собор'], correct_index: 0 },
    { question: 'Как называется самое высокое здание города?', options: ['Лахта Центр', 'Газпром-арена', 'Башня Петра', 'Дом Зингера'], correct_index: 0 },
  ],
  'Казань': [
    { question: 'На какой большой реке стоит Казань?', options: ['Кама', 'Волга', 'Вятка', 'Белая'], correct_index: 1 },
    { question: 'Как называется главная мечеть Казанского кремля?', options: ['Кул-Шариф', 'Марджани', 'Апанаевская', 'Нурулла'], correct_index: 0 },
    { question: 'Какая улица в центре — пешеходная?', options: ['Баумана', 'Кремлёвская', 'Пушкина', 'Táтарстан'], correct_index: 0 },
    { question: 'Как неофициально называют Казань?', options: ['Третья столица России', 'Северная Пальмира', 'Ворота Урала', 'Город на семи холмах'], correct_index: 0 },
    { question: 'Что включено в список ЮНЕСКО?', options: ['Казанский кремль', 'Улица Баумана', 'Озеро Кабан', 'Дворец земледельцев'], correct_index: 0 },
    { question: 'Какое озеро находится в центре Казани?', options: ['Кабан', 'Селигер', 'Тургояк', 'Зюраткуль'], correct_index: 0 },
  ],
}

const GENERAL_QUESTIONS: Question[] = [
  { question: 'Самое глубокое озеро в мире?', options: ['Байкал', 'Ладожское', 'Онежское', 'Каспийское'], correct_index: 0 },
  { question: 'Сколько часовых поясов в России?', options: ['9', '11', '13', '7'], correct_index: 1 },
  { question: 'Самая высокая гора России?', options: ['Эльбрус', 'Казбек', 'Белуха', 'Народная'], correct_index: 0 },
  { question: 'Какой город называют Северной столицей?', options: ['Мурманск', 'Санкт-Петербург', 'Архангельск', 'Новгород'], correct_index: 1 },
  { question: 'Самое большое озеро мира по площади?', options: ['Каспийское море', 'Байкал', 'Верхнее', 'Виктория'], correct_index: 0 },
  { question: 'Какие части света разделяет Уральский хребет?', options: ['Европу и Азию', 'Азию и Африку', 'Европу и Африку', 'Азию и Америку'], correct_index: 0 },
]

function quizTask (context: FallbackContext): FallbackTask {
  const questions = CITY_QUESTIONS[context.city] ?? GENERAL_QUESTIONS
  const about = CITY_QUESTIONS[context.city] ? context.city : 'Россию'

  return {
    type: 'quiz',
    title: `Квиз про ${about}`,
    description: `Шесть вопросов про ${about}. За каждый верный ответ — 5 QP.`,
    qp_reward: 30,
    is_shared: true,
    params: { questions },
  }
}

/** Три задания, собранные из контекста встречи. */
export function fallbackQuest (context: FallbackContext): FallbackTask[] {
  return [geoTask(context), photoTask(context), quizTask(context)]
}
