// Процедурные аватары: картинка не выбирается из набора готовых, а рисуется
// по случайному зерну. Одно короткое зерно вроде «k7f2q» полностью задаёт
// внешность, поэтому в базе хранится строка, а не файл, и один и тот же
// аватар выглядит одинаково на всех устройствах.

/** Устойчивый генератор чисел из строки: одно зерно — всегда одна картинка. */
function seededRandom (seed: string) {
  let state = 2166136261
  for (const char of seed) {
    state ^= char.charCodeAt(0)
    state = Math.imul(state, 16777619)
  }

  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) % 100000) / 100000
  }
}

const PALETTES: [string, string][] = [
  ['#7C3AED', '#DB2777'], ['#0891B2', '#4F46E5'], ['#B45309', '#DB2777'],
  ['#0F766E', '#7C3AED'], ['#4338CA', '#0891B2'], ['#9333EA', '#F59E0B'],
  ['#DB2777', '#F59E0B'], ['#2563EB', '#7C3AED'], ['#059669', '#0891B2'],
  ['#E11D48', '#7C3AED'], ['#7C3AED', '#22D3EE'], ['#F97316', '#DB2777'],
]

const SKINS = ['#2B2156', '#3B2F63', '#1F2937', '#4C1D95', '#155E75', '#7C2D12']

export interface AvatarLook {
  from: string
  to: string
  skin: string
  /**
   * Поворот цвета делает палитру своей у каждого. Диапазон узкий
   * намеренно: полный круг уводил половину аватаров в болотно-зелёный,
   * а приложение узнаётся по фиолетовому.
   */
  hueShift: number
  /** Форма головы: от круга к слегка квадратной. */
  round: number
  headWidth: number
  headHeight: number
  ears: 'cat' | 'round' | 'antenna' | 'none'
  earTilt: number
  eyes: 'dots' | 'happy' | 'sleepy' | 'star' | 'wide' | 'wink'
  eyeGap: number
  eyeSize: number
  eyeLine: number
  mouth: 'smile' | 'grin' | 'line' | 'small' | 'open' | 'cat'
  mouthWidth: number
  mouthLine: number
  blush: boolean
  freckles: boolean
  blobX: number
  blobY: number
  blobR: number
}

const pick = <T,>(random: () => number, list: T[]): T =>
  list[Math.floor(random() * list.length) % list.length]

/** Число из диапазона с шагом в один пиксель или градус. */
const span = (random: () => number, min: number, max: number) =>
  Math.round(min + random() * (max - min))

/**
 * Черты берутся не только из списков: размеры, расстояния и поворот цвета
 * задаются плавно. Из-за этого двух одинаковых аватаров практически не
 * бывает — набор частей общий, а пропорции у каждого свои.
 */
export function avatarLook (seed: string): AvatarLook {
  const random = seededRandom(seed)
  const [from, to] = pick(random, PALETTES)

  return {
    from,
    to,
    skin: pick(random, SKINS),
    hueShift: span(random, -32, 32),
    round: span(random, 26, 48),
    headWidth: span(random, 58, 70),
    headHeight: span(random, 54, 64),
    ears: pick(random, ['cat', 'round', 'antenna', 'none'] as const),
    earTilt: span(random, -8, 8),
    eyes: pick(random, ['dots', 'happy', 'sleepy', 'star', 'wide', 'wink'] as const),
    eyeGap: span(random, 16, 26),
    eyeSize: span(random, 4, 8),
    eyeLine: span(random, 48, 56),
    mouth: pick(random, ['smile', 'grin', 'line', 'small', 'open', 'cat'] as const),
    mouthWidth: span(random, 10, 20),
    mouthLine: span(random, 65, 73),
    blush: random() > 0.45,
    freckles: random() > 0.7,
    blobX: span(random, 8, 82),
    blobY: span(random, 6, 50),
    blobR: span(random, 16, 34),
  }
}

/**
 * Новое зерно. Двенадцать символов дают столько сочетаний, что совпадение
 * не встретится и на миллионах пользователей: узким местом было не
 * разнообразие черт, а длина самого зерна.
 */
export function randomAvatarSeed (): string {
  const part = () => Math.random().toString(36).slice(2, 8)
  return `gen:${(part() + part()).slice(0, 12)}`
}

export function parseAvatarSeed (value?: string): string | null {
  if (!value?.startsWith('gen:')) return null
  return value.slice(4)
}
