import { useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../components/ui'
import { BackIcon } from '../components/icons'
import { useAuth } from '../lib/auth'

// Длина кода задана почтовым шаблоном Supabase и равна шести цифрам.
// В ЧТЗ 5.1.1 указан четырёхзначный код — расхождение зафиксировано в README.
const LENGTH = 6

/** Подтверждение почты кодом из письма (ЧТЗ 5.1.1, шаги 3–4). */
export default function Confirm () {
  const navigate = useNavigate()
  const { state } = useLocation() as { state?: { email?: string } }
  const { verifyCode, resendCode } = useAuth()
  const [digits, setDigits] = useState(Array<string>(LENGTH).fill(''))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const [resent, setResent] = useState('')

  async function resend () {
    if (!state?.email) return setError('Неизвестно, на какую почту отправлять')
    setResent('Отправляем…')
    try {
      await resendCode(state.email)
      setResent('Код отправлен ещё раз')
    } catch (cause) {
      setResent(cause instanceof Error ? cause.message : 'Письмо не отправилось')
    }
  }

  /**
   * Код из письма копируют целиком, а не по цифре. Вставка в любое поле
   * раскладывается по всем — иначе в первую клетку попадают все шесть цифр
   * и человек стирает их вручную.
   */
  function paste (text: string) {
    const code = text.replace(/\D/g, '').slice(0, LENGTH)
    if (code.length < 2) return false

    const next = Array<string>(LENGTH).fill('')
    for (let index = 0; index < code.length; index += 1) next[index] = code[index]
    setDigits(next)
    setError('')
    inputs.current[Math.min(code.length, LENGTH - 1)]?.focus()
    return true
  }

  function setDigit (index: number, value: string) {
    if (value.length > 1 && paste(value)) return

    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    setError('')
    if (digit && index < LENGTH - 1) inputs.current[index + 1]?.focus()
  }

  async function submit () {
    if (!state?.email) return setError('Неизвестно, какую почту подтверждать')
    setBusy(true)
    try {
      await verifyCode(state.email, digits.join(''))
      navigate('/interests')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Код не подошёл')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex h-full flex-col justify-center gap-8 px-6 pb-16">
      <button
        onClick={() => navigate('/register')} aria-label="Назад"
        className="absolute left-6 top-6"
      >
        <BackIcon className="size-7" />
      </button>

      <div className="space-y-3 text-center">
        <h1 className="text-[28px]">Подтвердите почту</h1>
        <p className="text-[17px] text-white/75">
          Мы отправили код на {state?.email ?? 'вашу почту'}. Он действует 5 минут.
        </p>
      </div>

      <div className="flex justify-center gap-2">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => { inputs.current[index] = el }}
            value={digit}
            onChange={(e) => setDigit(index, e.target.value)}
            onPaste={(e) => {
              if (paste(e.clipboardData.getData('text'))) e.preventDefault()
            }}
            onKeyDown={(e) => {
              // Backspace в пустой клетке возвращает к предыдущей: иначе
              // приходится целиться пальцем в нужный квадратик.
              if (e.key === 'Backspace' && !digits[index] && index > 0) {
                inputs.current[index - 1]?.focus()
              }
            }}
            inputMode="numeric" maxLength={1} aria-label={`Цифра ${index + 1}`}
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            className="size-12 rounded-2xl bg-field text-center text-[24px] font-semibold
                       outline-none focus:ring-2 focus:ring-accent"
          />
        ))}
      </div>

      {error && <p className="text-center text-[15px] text-red-400">{error}</p>}

      <div className="space-y-3">
        <Button disabled={busy || digits.some((d) => !d)} onClick={submit}>
          {busy ? 'Проверяем…' : 'Подтвердить'}
        </Button>

        <button onClick={resend} className="w-full py-2 text-center text-[16px] text-muted">
          {resent || 'Отправить код ещё раз'}
        </button>
      </div>
    </div>
  )
}
