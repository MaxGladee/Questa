import { useEffect } from 'react'
import { CloseIcon } from './icons'

/**
 * Просмотр снимка во весь экран.
 *
 * Миниатюра в чате и обложка ивента показывают картинку обрезанной по
 * размеру карточки: лица по краям и мелкие детали в неё не помещаются.
 * Здесь снимок показывается целиком — по нажатию и без ухода с экрана.
 */
export function Lightbox (
  { src, alt = 'Снимок', onClose }: { src: string; alt?: string; onClose: () => void },
) {
  // Пока смотрим картинку, экран под ней не должен прокручиваться.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)

    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      onClick={onClose}
      className="absolute inset-0 z-[75] flex items-center justify-center bg-black/90 p-4"
    >
      <button
        onClick={onClose} aria-label="Закрыть"
        className="absolute right-4 top-4 grid size-11 place-items-center rounded-full
                   bg-white/10 text-white"
      >
        <CloseIcon className="size-6" />
      </button>

      <img
        src={src} alt={alt}
        onClick={(event) => event.stopPropagation()}
        className="max-h-full max-w-full rounded-card object-contain"
      />
    </div>
  )
}
