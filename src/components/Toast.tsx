import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

// Короткое сообщение о том, что действие прошло. Нужно там, где результат
// иначе не виден: после отмены ивента экран просто сменяется, и без такой
// подсказки непонятно, сработало ли вообще.

interface Toast {
  id: number
  text: string
  tone: 'ok' | 'error'
}

const ToastContext = createContext<((text: string, tone?: Toast['tone']) => void) | null>(null)

export function useToast () {
  const show = useContext(ToastContext)
  if (!show) throw new Error('useToast вызван вне ToastProvider')
  return show
}

export function ToastProvider ({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  const show = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = nextId.current++
    setToasts((list) => [...list, { id, text, tone }])
    setTimeout(() => setToasts((list) => list.filter((item) => item.id !== id)), 3200)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}

      <div className="pointer-events-none absolute inset-x-4 bottom-24 z-[60] flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`animate-message rounded-card px-4 py-3 text-center text-[16px]
                        font-medium shadow-2xl ${
              toast.tone === 'error'
                ? 'bg-red-500/90 text-white'
                : 'bg-surface-3 text-white ring-1 ring-accent/40'}`}
          >
            {toast.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
