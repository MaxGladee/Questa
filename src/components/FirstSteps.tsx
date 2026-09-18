import { Link } from 'react-router-dom'
import { CheckIcon, ChevronIcon } from './icons'

/**
 * Первые шаги — для того, у кого ещё ничего нет.
 *
 * Новый человек открывает приложение и видит пустоту: своих встреч нет,
 * чужих рядом может не быть тоже, а календарь и рекомендации ничего не
 * подсказывают. Вопрос «и что теперь?» остаётся без ответа, и второй раз
 * приложение не открывают.
 *
 * Здесь три шага, и ни один не выдуман ради галочки: без интересов квест
 * не знает, о чём спрашивать; без встречи приложению нечего показывать; а
 * встреча без людей не состоится — позвать их можно только ссылкой.
 *
 * Карточка исчезает сама, как только человек завёл первую встречу или
 * записался в чужую: дальше подсказки только мешают.
 */
export function FirstSteps (
  { interests, hasEvent }: { interests: number; hasEvent: boolean },
) {
  if (hasEvent) return null

  const steps = [
    {
      done: interests > 0,
      to: '/settings',
      title: 'Отметьте интересы',
      note: 'По ним подбираются встречи рядом и задания в квесте',
    },
    {
      done: false,
      to: '/create',
      title: 'Соберите первую встречу',
      note: 'Название, место и время — остальное приложение сделает само',
    },
    {
      done: false,
      to: '/map',
      title: 'Или зайдите в чужую',
      note: 'На карте видно всё, что собирают поблизости',
    },
  ]

  return (
    <section className="space-y-3 rounded-card bg-surface p-4">
      <div>
        <h2 className="text-[20px]">С чего начать</h2>
        <p className="mt-1 text-[15px] leading-snug text-muted">
          Questa превращает встречу в короткую игру: приложение выдаёт компании задания,
          за них дают очки. Но сначала нужна сама встреча.
        </p>
      </div>

      {steps.map((step) => (
        <Link
          key={step.title} to={step.to}
          className={`flex items-center gap-3 rounded-card p-3.5 transition active:scale-[0.99] ${
            step.done ? 'bg-surface-2' : 'bg-surface-3'}`}
        >
          <span
            className={`grid size-9 shrink-0 place-items-center rounded-full ${
              step.done ? 'bg-success/20 text-success' : 'bg-accent/20 text-accent-soft'}`}
          >
            {step.done ? <CheckIcon className="size-5" /> : <span className="text-[17px]">→</span>}
          </span>

          <span className="min-w-0 flex-1">
            <span className={`block text-[17px] font-semibold ${step.done ? 'text-muted' : ''}`}>
              {step.title}
            </span>
            <span className="block text-[15px] leading-snug text-muted">{step.note}</span>
          </span>

          {!step.done && <ChevronIcon className="size-5 shrink-0 text-muted" />}
        </Link>
      ))}
    </section>
  )
}
