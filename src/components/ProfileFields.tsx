import { useRef, useState } from 'react'
import { Avatar, Field } from './ui'
import { randomAvatar, randomNickname } from './Art'
import { uploadImage } from '../lib/api'

// Города по численности населения; Екатеринбург первым — приложение делается
// для него, и на защите демонстрация идёт именно по нему.
export const POPULAR_CITIES = [
  'Екатеринбург', 'Москва', 'Санкт-Петербург', 'Новосибирск', 'Казань',
  'Нижний Новгород', 'Челябинск', 'Самара', 'Омск', 'Ростов-на-Дону',
  'Уфа', 'Красноярск', 'Пермь', 'Воронеж', 'Волгоград', 'Тюмень',
]

/** Никнейм с кнопкой «придумать за меня». */
export function NicknameField (
  { value, onChange }: { value: string; onChange: (value: string) => void },
) {
  return (
    <label className="block space-y-2">
      <span className="text-[15px] text-muted">Никнейм</span>
      <div className="flex gap-2">
        <Field
          placeholder="Никнейм" maxLength={20} className="flex-1"
          value={value} onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button" onClick={() => onChange(randomNickname())}
          title="Придумать случайный никнейм" aria-label="Придумать случайный никнейм"
          className="shrink-0 rounded-field bg-field px-4 text-[22px] active:scale-95"
        >
          🎲
        </button>
      </div>
    </label>
  )
}

/** Аватар: своя фотография либо сгенерированный, который можно перебирать. */
export function AvatarPicker (
  { name, value, userId, onChange }:
  { name: string; value?: string; userId?: string; onChange: (value: string) => void },
) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function upload (file: File | undefined) {
    if (!file || !userId) return
    setBusy(true)
    setError('')
    try {
      onChange(await uploadImage(file, userId, 'avatar'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        <Avatar name={name || '?'} src={value} size={72} className="rounded-3xl" />

        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          <button
            type="button" disabled={busy || !userId} onClick={() => input.current?.click()}
            className="rounded-full bg-accent px-4 py-2.5 text-[15px] font-semibold
                       active:scale-95 disabled:opacity-40"
          >
            {busy ? 'Загружаем…' : 'Загрузить фото'}
          </button>
          <button
            type="button" onClick={() => onChange(randomAvatar())}
            className="rounded-full bg-field px-4 py-2.5 text-[15px] font-semibold active:scale-95"
          >
            Случайный
          </button>
        </div>
      </div>

      <input
        ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
        onChange={(e) => upload(e.target.files?.[0])}
      />

      {error && <p className="text-[14px] text-red-400">{error}</p>}
    </div>
  )
}
