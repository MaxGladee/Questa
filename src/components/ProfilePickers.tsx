import { useState } from 'react'
import { PickerField, Sheet } from './Sheet'
import { POPULAR_CITIES } from './ProfileFields'
import { INTERESTS, MAX_INTERESTS } from '../data/demo'

/** Город: список вместо россыпи кнопок, со своим вариантом в конце. */
export function CityField (
  { value, onChange }: { value: string; onChange: (value: string) => void },
) {
  const [open, setOpen] = useState(false)
  const [typing, setTyping] = useState(false)

  const options = [
    ...POPULAR_CITIES.map((city) => ({ value: city, title: city })),
    { value: '__other', title: 'Другой город', hint: 'вписать вручную' },
  ]

  if (typing) {
    return (
      <div className="space-y-2">
        <span className="text-[15px] text-muted">Город</span>
        <input
          autoFocus placeholder="Введите город" value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => { if (!value.trim()) setTyping(false) }}
          className="w-full rounded-field bg-field px-5 py-4 text-[17px] text-white
                     placeholder:text-muted outline-none focus:ring-2 focus:ring-accent/60"
        />
        <button onClick={() => setTyping(false)} className="text-[14px] text-accent">
          Выбрать из списка
        </button>
      </div>
    )
  }

  return (
    <>
      <PickerField
        label="Город" value={value} placeholder="Выберите город"
        onOpen={() => setOpen(true)}
      />

      {open && (
        <Sheet
          title="Город" options={options} selected={value ? [value] : []}
          onClose={() => setOpen(false)}
          onApply={([picked]) => {
            setOpen(false)
            if (picked === '__other') {
              onChange('')
              setTyping(true)
            } else {
              onChange(picked)
            }
          }}
        />
      )}
    </>
  )
}

/** Интересы: не больше пяти, в закрытом виде — одна строка перечислением. */
export function InterestsField (
  { value, onChange }: { value: string[]; onChange: (value: string[]) => void },
) {
  const [open, setOpen] = useState(false)

  const titles = value
    .map((code) => INTERESTS.find((item) => item.code === code)?.title)
    .filter(Boolean)

  return (
    <>
      <PickerField
        label={`Интересы · до ${MAX_INTERESTS}`}
        value={titles.join(', ')}
        placeholder="Выберите интересы"
        onOpen={() => setOpen(true)}
      />

      {open && (
        <Sheet
          title="Интересы" multiple limit={MAX_INTERESTS}
          options={INTERESTS.map((item) => ({ value: item.code, title: item.title }))}
          selected={value}
          onClose={() => setOpen(false)}
          onApply={(picked) => { onChange(picked); setOpen(false) }}
        />
      )}
    </>
  )
}
