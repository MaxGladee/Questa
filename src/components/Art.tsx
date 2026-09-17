import type { CategoryCode } from '../data/demo'
import { categoryArt } from '../data/category-art'

// Картинки, которые рисуются кодом, а не грузятся файлом.
//
// Пока обложки не загружаются, у каждого ивента должна быть своя узнаваемая
// картинка: раньше всем подставлялась одна и та же фотография караоке, и
// список выглядел как набор одинаковых мятых миниатюр.

/** Обложка ивента: фотография, если её загрузили, иначе рисунок по категории. */
export function Cover (
  { src, category, className, emojiClassName = 'text-3xl' }:
  { src?: string; category: CategoryCode; className?: string; emojiClassName?: string },
) {
  if (src) {
    return <img src={src} alt="" loading="lazy" className={`object-cover ${className ?? ''}`} />
  }

  const art = categoryArt(category)

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
