import { useState } from 'react'
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { parseGeneratedAvatar } from './Art'

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ')

/** Основная кнопка на всю ширину — градиентная пилюля с макетов. */
export function Button (
  { children, variant = 'primary', className, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'quiet' },
) {
  const styles = {
    primary: 'btn-primary text-white',
    ghost: 'bg-surface-2 text-white',
    quiet: 'text-muted',
  }[variant]

  return (
    <button
      {...rest}
      className={cx(
        'w-full rounded-[22px] py-4 text-[17px] font-semibold transition active:scale-[0.98]',
        'disabled:opacity-40 disabled:active:scale-100',
        styles, className,
      )}
    >
      {children}
    </button>
  )
}

/**
 * Браузер считает безымянное текстовое поле формой входа и подставляет туда
 * почту. Просьбы `autocomplete="off"` Chrome при этом сплошь и рядом
 * игнорирует — на неё полагаться нельзя.
 *
 * Работает другое: поле, открытое только для чтения, не заполняют. Оно
 * становится обычным в момент, когда до него дотрагиваются, — к этому
 * времени решение о подстановке уже принято и отменено.
 */
const noAutofill = {
  autoComplete: 'off',
  autoCorrect: 'off',
  spellCheck: false,
  'data-1p-ignore': true,        // 1Password
  'data-lpignore': 'true',       // LastPass
  'data-form-type': 'other',     // Dashlane
} as const

export function useAutofillGuard (enabled = true) {
  const [locked, setLocked] = useState(enabled)
  const unlock = () => setLocked(false)

  // Замок снимается ещё на касании, до того как поле получит фокус: иначе
  // на iPhone по тапу в поле, открытое только для чтения, не поднимается
  // клавиатура.
  return {
    ...(enabled ? noAutofill : {}),
    readOnly: enabled && locked,
    onPointerDown: unlock,
    onFocus: unlock,
  }
}

export function Field ({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  // Поля входа заполнять можно и нужно — там подстановка помогает.
  const guard = useAutofillGuard(!rest.autoComplete || rest.autoComplete === 'off')

  return (
    <input
      {...guard}
      {...rest}
      className={cx(
        'w-full rounded-field bg-field px-5 py-4 text-[17px] text-white',
        'placeholder:text-muted outline-none focus:ring-2 focus:ring-accent/60',
        className,
      )}
    />
  )
}

export function TextArea ({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const guard = useAutofillGuard(!rest.autoComplete || rest.autoComplete === 'off')

  return (
    <textarea
      {...guard}
      {...rest}
      className={cx(
        'w-full resize-none rounded-field bg-field px-5 py-4 text-[17px] text-white',
        'placeholder:text-muted outline-none focus:ring-2 focus:ring-accent/60',
        className,
      )}
    />
  )
}

/** Небольшая плашка: категория, статус, награда. */
export function Chip (
  { children, tone = 'plain', className }:
  { children: ReactNode; tone?: 'plain' | 'accent' | 'success'; className?: string },
) {
  const styles = {
    plain: 'bg-chip text-white',
    accent: 'bg-accent text-white',
    success: 'bg-success/20 text-success',
  }[tone]

  return (
    <span className={cx(
      'whitespace-nowrap rounded-full px-3.5 py-2 text-[15px] font-semibold', styles, className,
    )}>
      {children}
    </span>
  )
}

export function Card ({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-card bg-surface-2 p-4', className)}>{children}</div>
}

/** Аватар: фотография, а при её отсутствии — первая буква имени. */
export function Avatar (
  { name, src, size = 44, className }:
  { name: string; src?: string; size?: number; className?: string },
) {
  const style = { width: size, height: size }
  // Свой radius в className должен побеждать круглую форму по умолчанию.
  const shape = className?.includes('rounded') ? '' : 'rounded-full'

  const generated = parseGeneratedAvatar(src)
  if (generated) {
    return (
      <span
        style={{
          ...style,
          fontSize: size * 0.55,
          background: `linear-gradient(135deg, ${generated.from}, ${generated.to})`,
        }}
        className={cx('grid shrink-0 place-items-center', shape || 'rounded-full', className)}
      >
        {generated.emoji}
      </span>
    )
  }

  if (src) {
    return (
      <img
        src={src} alt={name} style={style}
        className={cx('shrink-0 object-cover', shape, className)}
      />
    )
  }

  return (
    <span
      style={{ ...style, fontSize: size * 0.42 }}
      className={cx(
        'grid shrink-0 place-items-center bg-accent/70 font-semibold text-white',
        shape || 'rounded-full', className,
      )}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}

/** Полоса прогресса: фиолетовая заливка на белом, как в макетах. */
export function Progress ({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cx('h-3 w-full overflow-hidden rounded-full bg-white', className)}>
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </div>
  )
}

/** Переключатель «включено / выключено». */
export function Switch (
  { checked, onChange, label }:
  { checked: boolean; onChange: (value: boolean) => void; label: string },
) {
  return (
    <button
      role="switch" aria-checked={checked} aria-label={label}
      onClick={() => onChange(!checked)}
      className={`flex h-8 w-14 shrink-0 items-center rounded-full p-1 transition
                  ${checked ? 'bg-accent' : 'bg-white/15'}`}
    >
      <span
        className={`size-6 rounded-full bg-white transition-transform
                    ${checked ? 'translate-x-6' : 'translate-x-0'}`}
      />
    </button>
  )
}
