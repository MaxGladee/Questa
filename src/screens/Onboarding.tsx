import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui'

// Тексты слайдов заданы в ЧТЗ 5.2.
const SLIDES = [
  {
    art: 'onboarding-1.png',
    title: 'Находи ивенты рядом',
    text: 'Пробежки, бары, кино, прогулки — находи людей с похожими интересами прямо на карте',
  },
  {
    art: 'onboarding-2.png',
    title: 'Каждая встреча — это квест',
    text: 'Каждый ивент превращается в небольшой квест с тремя заданиями для всей группы',
  },
  {
    art: 'onboarding-3.png',
    title: 'Зарабатывай QuestaPoints',
    text: 'Выполняй задания, получай QP и опыт, повышай уровень и собирай стрик ежедневных входов',
  },
]

/**
 * Приветствие при первом запуске (ЧТЗ 5.2).
 *
 * Слайды листаются пальцем, как в макетах: это настоящая лента с
 * прокруткой и примагничиванием, а не подмена картинки по кнопке. Кнопка
 * «Далее» делает ровно то же самое — прокручивает ленту к следующему
 * слайду, поэтому оба способа выглядят одинаково.
 *
 * Соседние кадры видны по краям — сразу понятно, что лента листается и
 * что впереди ещё что-то есть. Они приглушены и уменьшены, а по мере
 * листания возвращаются к полному размеру: один кадр перетекает в другой,
 * а не сменяется рывком. Прозрачность и масштаб считаются прямо из
 * положения прокрутки, поэтому картинка следует за пальцем.
 */
export default function Onboarding () {
  const navigate = useNavigate()
  const track = useRef<HTMLDivElement>(null)

  /** Положение ленты в «слайдах»: 1.4 — палец между вторым и третьим. */
  const [offset, setOffset] = useState(0)
  const step = Math.round(offset)
  const last = step === SLIDES.length - 1

  const finish = () => navigate('/register')

  /**
   * Геометрия ленты: где стоит первый кадр и через сколько следующий.
   *
   * Считается по настоящим размерам, а не по доле ширины экрана: кадры
   * стоят между распорками, и любая арифметика «в процентах» тут промахнётся
   * — проценты в вёрстке считаются от разных величин.
   */
  function geometry (element: HTMLDivElement) {
    const slides = [...element.children].filter(
      (node): node is HTMLElement => node instanceof HTMLElement && node.dataset.slide === 'yes',
    )

    const first = slides[0]
    const second = slides[1]
    if (!first) return { base: 0, step: element.clientWidth || 1 }

    return {
      base: first.offsetLeft - (element.clientWidth - first.clientWidth) / 2,
      step: second ? second.offsetLeft - first.offsetLeft : element.clientWidth || 1,
    }
  }

  function go (index: number) {
    const element = track.current
    if (!element) return

    const { base, step } = geometry(element)
    element.scrollTo({ left: base + index * step, behavior: 'smooth' })
  }

  // Прокрутка пальцем и прокрутка кнопкой приходят сюда одинаково.
  useEffect(() => {
    const element = track.current
    if (!element) return

    const onScroll = () => {
      const { base, step } = geometry(element)
      setOffset((element.scrollLeft - base) / step)
    }
    element.addEventListener('scroll', onScroll, { passive: true })
    return () => element.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="flex h-full flex-col pb-8 pt-4">
      <button onClick={finish} className="self-end px-6 py-3 text-[17px] text-muted">
        Пропустить
      </button>

      {/*
        Высота ленты и блока текста задана жёстко: заголовки и описания
        занимают разное число строк, и без этого картинка прыгала бы вверх-вниз
        при каждом листании.
      */}
      <div className="flex flex-1 flex-col items-center justify-center gap-7">
        <div
          ref={track}
          /* Кадр занимает 76% ширины, а по краям стоят распорки по 12% —
             так соседние кадры выглядывают слева и справа, а активный
             остаётся по центру даже на первом и последнем слайде.
             Распорки, а не отступы у ленты: от отступов проценты внутри
             начинают считаться от другой ширины, и кадры выходят уже. */
          className="no-scrollbar flex h-[320px] w-full snap-x snap-mandatory gap-3
                     overflow-x-auto overscroll-x-contain"
        >
          <span className="w-[12%] shrink-0" aria-hidden />

          {SLIDES.map((slide, index) => {
            const distance = Math.min(1, Math.abs(offset - index))

            return (
              <div
                key={slide.art} data-slide="yes"
                className="flex w-[76%] shrink-0 snap-center items-center justify-center"
              >
                <img
                  src={`${import.meta.env.BASE_URL}art/${slide.art}`}
                  alt="" width={465} height={488} draggable={false}
                  /* Одинаковая рамка под каждый кадр: иллюстрации немного
                     разной формы, и без неё картинка прыгала бы по высоте
                     от слайда к слайду. */
                  className="size-full rounded-[32px] object-contain"
                  style={{
                    opacity: 1 - distance * 0.55,
                    transform: `scale(${1 - distance * 0.12})`,
                  }}
                />
              </div>
            )
          })}

          <span className="w-[12%] shrink-0" aria-hidden />
        </div>

        <div className="flex gap-2">
          {SLIDES.map((slide, index) => (
            <button
              key={slide.art} onClick={() => go(index)}
              aria-label={`Слайд ${index + 1}`}
              className={`h-2.5 rounded-full transition-all duration-300 ${
                index === step ? 'w-7 bg-white' : 'w-2.5 bg-white/30'}`}
            />
          ))}
        </div>

        <div className="relative h-[160px] w-full px-6">
          {SLIDES.map((slide, index) => {
            const distance = Math.min(1, Math.abs(offset - index))

            return (
              <div
                key={slide.art}
                aria-hidden={index !== step}
                className="absolute inset-0 flex flex-col items-center gap-3 px-6 text-center"
                style={{
                  opacity: Math.max(0, 1 - distance * 2.2),
                  // Текст сдвигается вдвое медленнее картинки — от этого
                  // слайды кажутся слоями, а не одной плоской лентой.
                  transform: `translateX(${(index - offset) * 50}%)`,
                  pointerEvents: index === step ? 'auto' : 'none',
                }}
              >
                <h1 className="text-[30px] leading-tight">{slide.title}</h1>
                <p className="text-[17px] leading-snug text-white/75">{slide.text}</p>
              </div>
            )
          })}
        </div>
      </div>

      <div className="px-6">
        <Button onClick={() => (last ? finish() : go(step + 1))}>
          {last ? 'Вперёд!' : 'Далее'}
        </Button>
      </div>
    </div>
  )
}
