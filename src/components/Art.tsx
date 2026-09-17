import type { CategoryCode } from '../data/demo'

// Картинки, которые рисуются кодом, а не грузятся файлом.
//
// Пока обложки не загружаются, у каждого ивента должна быть своя узнаваемая
// картинка: раньше всем подставлялась одна и та же фотография караоке, и
// список выглядел как набор одинаковых мятых миниатюр.

const CATEGORY_ART: Record<CategoryCode, { emoji: string; from: string; to: string }> = {
  party:      { emoji: '🎉', from: '#7C3AED', to: '#DB2777' },
  chill:      { emoji: '🌿', from: '#0F766E', to: '#4F46E5' },
  bar:        { emoji: '🍸', from: '#BE185D', to: '#7C3AED' },
  walk:       { emoji: '🚶', from: '#1D4ED8', to: '#0891B2' },
  boardgames: { emoji: '🎲', from: '#B45309', to: '#7C3AED' },
  other:      { emoji: '✨', from: '#4338CA', to: '#9333EA' },
}

/** Обложка ивента: фотография, если её загрузили, иначе рисунок по категории. */
export function Cover (
  { src, category, className, emojiClassName = 'text-3xl' }:
  { src?: string; category: CategoryCode; className?: string; emojiClassName?: string },
) {
  if (src) {
    return <img src={src} alt="" loading="lazy" className={`object-cover ${className ?? ''}`} />
  }

  const art = CATEGORY_ART[category] ?? CATEGORY_ART.other

  return (
    <span
      aria-hidden
      className={`grid place-items-center ${className ?? ''}`}
      style={{ background: `linear-gradient(135deg, ${art.from}, ${art.to})` }}
    >
      <span className={emojiClassName}>{art.emoji}</span>
    </span>
  )
}

// ─────────────────────── случайные аватары и ники ───────────────────────

export { randomAvatarSeed as randomAvatar } from './avatar-art'

export { makeNickname as randomNickname } from './nickname-art'
