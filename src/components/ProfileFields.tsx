import { Avatar, Field } from './ui'
import { randomAvatar, randomNickname } from './Art'

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

/** Аватар: пока загрузка фотографии не подключена, его можно перебирать. */
export function AvatarPicker (
  { name, value, onChange }:
  { name: string; value?: string; onChange: (value: string) => void },
) {
  return (
    <div className="flex items-center gap-4">
      <Avatar name={name || '?'} src={value} size={72} className="rounded-3xl" />
      <div className="min-w-0 flex-1">
        <button
          type="button" onClick={() => onChange(randomAvatar())}
          className="rounded-full bg-field px-4 py-2.5 text-[15px] font-semibold active:scale-95"
        >
          {value ? 'Другой аватар' : 'Выбрать аватар'}
        </button>
        <p className="mt-1.5 text-[13px] leading-snug text-muted">
          Загрузка своей фотографии появится позже
        </p>
      </div>
    </div>
  )
}

/** Город: сначала популярные одним касанием, потом ручной ввод. */
export function CityPicker (
  { value, onChange }: { value: string; onChange: (value: string) => void },
) {
  const custom = value !== '' && !POPULAR_CITIES.includes(value)

  return (
    <div className="space-y-2">
      <span className="text-[15px] text-muted">Город</span>

      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
        {POPULAR_CITIES.map((city) => (
          <button
            key={city} type="button" onClick={() => onChange(city)}
            className={`shrink-0 rounded-2xl px-4 py-2.5 text-[15px] transition ${
              value === city ? 'bg-accent' : 'border border-white/15'}`}
          >
            {city}
          </button>
        ))}
      </div>

      <Field
        placeholder="Другой город"
        value={custom ? value : ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
