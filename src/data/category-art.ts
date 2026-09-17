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
  other:      { emoji: '✨', from: '#4338CA', to: '#9333EA' },
}

export function categoryArt (code: CategoryCode) {
  return CATEGORY_ART[code] ?? CATEGORY_ART.other
}
