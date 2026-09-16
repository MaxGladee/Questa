import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui'

/** Подтверждение почты четырёхзначным кодом (ЧТЗ 5.1.1, шаг 3-4). */
export default function Confirm () {
  const navigate = useNavigate()
  const [digits, setDigits] = useState(['', '', '', ''])
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  function setDigit (index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    if (digit && index < 3) inputs.current[index + 1]?.focus()
  }

  return (
    <div className="flex h-full flex-col justify-center gap-8 px-6 pb-16">
      <div className="space-y-3 text-center">
        <h1 className="text-[28px]">Подтвердите почту</h1>
        <p className="text-[17px] text-white/75">
          Мы отправили код из четырёх цифр. Он действует 5 минут.
        </p>
      </div>

      <div className="flex justify-center gap-3">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => { inputs.current[index] = el }}
            value={digit}
            onChange={(e) => setDigit(index, e.target.value)}
            inputMode="numeric" maxLength={1} aria-label={`Цифра ${index + 1}`}
            className="size-16 rounded-2xl bg-field text-center text-[28px] font-semibold
                       outline-none focus:ring-2 focus:ring-accent"
          />
        ))}
      </div>

      <div className="space-y-3">
        <Button disabled={digits.some((d) => !d)} onClick={() => navigate('/interests')}>
          Подтвердить
        </Button>
        <button className="w-full py-2 text-center text-[15px] text-muted">
          Отправить код заново
        </button>
      </div>
    </div>
  )
}
