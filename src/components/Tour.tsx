import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Короткое обучение по главному экрану.
 *
 * Раньше на его месте была карточка «С чего начать» — три пункта поверх
 * содержимого. Она мешала вдвойне: занимала полэкрана у того, кто и так
 * разобрался, и успевала мигнуть при каждом возврате на главную, пока
 * приложение не узнало, есть ли у человека встречи.
 *
 * Вместо неё — обход по экрану: приложение затемняется, кроме одного
 * места, и рядом появляется подпись, что это и зачем. Шесть шагов,
 * прерываемых в любой момент, и только один раз: дальше подсказки не
 * возвращаются, пока их не попросят в настройках.
 *
 * Шаги ищут цели по атрибуту `data-tour`. Если цели на экране нет —
 * например, кнопка появляется только у организатора, — шаг молча
 * пропускается, а не показывает пустое пятно.
 */

interface Step {
  target: string
  title: string
  text: string
}

const STEPS: Step[] = [
  {
    target: '[data-tour="search"]',
    title: 'Поиск встреч',
    text: 'Ищет не только по названию: можно набрать «настолки» или «у Плотинки» — '
      + 'приложение поймёт.',
  },
  {
    target: '[data-tour="feed"]',
    title: 'Что собирают рядом',
    text: 'Здесь чужие встречи на выбранный день. День переключается календарём '
      + 'сверху, а «Фильтры» уберут лишнее — например, оставят только бесплатные.',
  },
  {
    target: '[data-tour="ideas"]',
    title: 'Своя встреча за минуту',
    text: 'Не нашли подходящую — соберите свою. Нажмите на идею, и форма '
      + 'заполнится сама: останется поправить время и место.',
  },
  {
    target: '[data-tour="tab-events"]',
    title: 'Ваши встречи',
    text: 'Всё, куда вы записались или что ведёте сами, — вместе с чатами и '
      + 'заданиями квеста.',
  },
  {
    target: '[data-tour="tab-map"]',
    title: 'Карта',
    text: 'Те же встречи, но видно, далеко ли идти. Там же — места поблизости, '
      + 'если ещё не решили, где собираться.',
  },
  {
    target: '[data-tour="tab-profile"]',
    title: 'Ваш профиль',
    text: 'Очки за задания, уровень, ачивки и архив прошедших встреч.',
  },
]

const KEY = 'questa.tour.v1'

/** Показывали ли обучение в этом браузере. */
export function tourSeen (): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    // Хранилище закрыто (приватный режим) — покажем ещё раз, не страшно.
    return false
  }
}

function remember () {
  try {
    localStorage.setItem(KEY, '1')
  } catch { /* см. выше */ }
}

/** Забыть, что обучение показывали, — для кнопки в настройках. */
export function forgetTour () {
  try {
    localStorage.removeItem(KEY)
  } catch { /* см. выше */ }
}

export function Tour ({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0)
  const [spot, setSpot] = useState<DOMRect | null>(null)

  const finish = useCallback(() => {
    remember()
    onClose()
  }, [onClose])

  // Цель шага: подвести к ней экран и запомнить, где она оказалась.
  useEffect(() => {
    const step = STEPS[index]
    if (!step) return finish()

    const node = document.querySelector(step.target)
    if (!node) {
      setIndex((step) => step + 1)
      return
    }

    node.scrollIntoView({ block: 'center', behavior: 'smooth' })

    let alive = true
    const measure = () => { if (alive) setSpot(node.getBoundingClientRect()) }

    measure()
    // Прокрутка плавная: пока она идёт, место цели ещё меняется.
    const settle = setTimeout(measure, 320)
    const later = setTimeout(measure, 700)
    window.addEventListener('resize', measure)

    return () => {
      alive = false
      clearTimeout(settle)
      clearTimeout(later)
      window.removeEventListener('resize', measure)
    }
  }, [index, finish])

  const step = STEPS[index]
  if (!step || !spot) return null

  const last = index === STEPS.length - 1
  const padding = 8
  // Подпись становится под целью, а если внизу тесно — над ней.
  const below = spot.bottom + 220 < window.innerHeight

  return createPortal(
    <div className="fixed inset-0 z-[90]" role="dialog" aria-label="Подсказки">
      {/*
        Вырез в затемнении сделан огромной тенью вокруг небольшого блока:
        так подсвеченное место остаётся настоящим — с его цветами и
        скруглениями, — а не перерисовывается поверх.
      */}
      <div
        className="pointer-events-none absolute rounded-[20px] ring-2 ring-accent
                   transition-all duration-200"
        style={{
          top: spot.top - padding,
          left: spot.left - padding,
          width: spot.width + padding * 2,
          height: spot.height + padding * 2,
          boxShadow: '0 0 0 9999px rgb(5 2 17 / .88)',
        }}
      />

      <div
        className="absolute inset-x-4 rounded-card bg-surface p-4 shadow-2xl"
        style={below
          ? { top: Math.min(spot.bottom + 14, window.innerHeight - 200) }
          : { bottom: Math.min(window.innerHeight - spot.top + 14, window.innerHeight - 200) }}
      >
        <p className="text-[13px] font-semibold uppercase tracking-wide text-accent-soft">
          {index + 1} из {STEPS.length}
        </p>
        <h2 className="mt-1 text-[20px]">{step.title}</h2>
        <p className="mt-1.5 text-[15px] leading-snug text-muted">{step.text}</p>

        <div className="mt-4 flex items-center gap-3">
          {!last && (
            <button onClick={finish} className="rounded-full px-3 py-2 text-[15px] text-muted">
              Пропустить
            </button>
          )}
          <button
            onClick={() => (last ? finish() : setIndex((step) => step + 1))}
            className="ml-auto rounded-full bg-accent px-6 py-2.5 text-[16px] font-semibold
                       transition active:scale-[0.98]"
          >
            {last ? 'Понятно' : 'Дальше'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
