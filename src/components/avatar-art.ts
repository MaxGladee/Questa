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
  /** Форма головы: от круга к слегка квадратной. */
  round: number
  ears: 'cat' | 'round' | 'antenna' | 'none'
  eyes: 'dots' | 'happy' | 'sleepy' | 'star' | 'wide' | 'wink'
  mouth: 'smile' | 'grin' | 'line' | 'small' | 'open' | 'cat'
  blush: boolean
  freckles: boolean
  hue: number
}

const pick = <T,>(random: () => number, list: T[]): T =>
  list[Math.floor(random() * list.length) % list.length]

export function avatarLook (seed: string): AvatarLook {
  const random = seededRandom(seed)
  const [from, to] = pick(random, PALETTES)

  return {
    from,
    to,
    skin: pick(random, SKINS),
    round: 28 + Math.floor(random() * 20),
    ears: pick(random, ['cat', 'round', 'antenna', 'none'] as const),
    eyes: pick(random, ['dots', 'happy', 'sleepy', 'star', 'wide', 'wink'] as const),
    mouth: pick(random, ['smile', 'grin', 'line', 'small', 'open', 'cat'] as const),
    blush: random() > 0.45,
    freckles: random() > 0.7,
    hue: Math.floor(random() * 360),
  }
}

/** Новое зерно. Сочетаний хватает, чтобы совпадения были редкостью. */
export function randomAvatarSeed (): string {
  return `gen:${Math.random().toString(36).slice(2, 8)}`
}

export function parseAvatarSeed (value?: string): string | null {
  if (!value?.startsWith('gen:')) return null
  return value.slice(4)
}
