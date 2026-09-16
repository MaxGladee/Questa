/** Заглушки на время загрузки и на случай ошибки — вместо пустого экрана. */

export function Loading ({ label = 'Загружаем…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-muted">
      <span className="size-8 animate-spin rounded-full border-2 border-white/20 border-t-accent" />
      <span className="text-[16px]">{label}</span>
    </div>
  )
}

export function Failed ({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
      <p className="text-[17px] text-muted">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="rounded-full bg-surface-2 px-6 py-3 text-[16px]">
          Попробовать снова
        </button>
      )}
    </div>
  )
}

export function Empty ({ label }: { label: string }) {
  return <p className="px-6 py-16 text-center text-[17px] text-muted">{label}</p>
}
