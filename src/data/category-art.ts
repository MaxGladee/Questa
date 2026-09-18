import type { CategoryCode } from './demo'

/**
 * Как выглядит категория там, где нет загруженной обложки: свой знак и своя
 * пара цветов. Лежит отдельно от компонентов, потому что нужна и разметке,
 * и меткам на карте, которые собираются строкой.
 */
export const CATEGORY_ART: Record<CategoryCode, { emoji: string; from: string; to: string }> = {
  party:      { emoji: '🎉', from: '#7C3AED', to: '#DB2777' },
  chill:      { emoji: '🌿', from: '#0F766E', to: '#4F46E5' },
  bar:        { emoji: '🍸', from: '#BE185D', to: '#7C3AED' },
  walk:       { emoji: '🚶', from: '#1D4ED8', to: '#0891B2' },
  boardgames: { emoji: '🎲', from: '#B45309', to: '#7C3AED' },
  sport:      { emoji: '🏃', from: '#047857', to: '#0891B2' },
  food:       { emoji: '🍜', from: '#C2410C', to: '#BE185D' },
  coffee:     { emoji: '☕', from: '#78350F', to: '#B45309' },
  theatre:    { emoji: '🎭', from: '#6D28D9', to: '#2563EB' },
  music:      { emoji: '🎤', from: '#9333EA', to: '#DB2777' },
  cinema:     { emoji: '🎬', from: '#1E3A8A', to: '#6D28D9' },
  games:      { emoji: '🎮', from: '#4338CA', to: '#0891B2' },
  art:   { emoji: '🎨', from: '#BE123C', to: '#7C3AED' },
  quiz:       { emoji: '🧠', from: '#0E7490', to: '#4338CA' },
  nature:     { emoji: '🏕', from: '#15803D', to: '#0E7490' },
  other:      { emoji: '✨', from: '#4338CA', to: '#9333EA' },
}

export function categoryArt (code: CategoryCode) {
  return CATEGORY_ART[code] ?? CATEGORY_ART.other
}
