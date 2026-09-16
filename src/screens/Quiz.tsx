import { useState } from 'react'
import { Button } from '../components/ui'
import { CloseIcon } from '../components/icons'
import type { QuestTask } from '../data/demo'

/**
 * Квиз (ЧТЗ 5.11.3). Общее задание: вопрос один и тот же у всех участников,
 * ответы засчитываются каждому отдельно, по 5 QP за верный (ЧТЗ 5.12.1).
 */
export default function Quiz (
  { task, onClose, onDone }: { task: QuestTask; onClose: () => void; onDone: (correct: number) => void },
) {
  const questions = task.questions ?? []
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [correct, setCorrect] = useState(0)
  const question = questions[index]
  const finished = index >= questions.length

  function next () {
    if (picked === null) return
    if (picked === question.correctIndex) setCorrect((n) => n + 1)
    setPicked(null)
    setIndex((n) => n + 1)
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-bg px-5 pb-8 pt-4">
      <header className="flex items-center justify-between">
        <h2 className="text-[22px]">{task.title}</h2>
        <button onClick={onClose} aria-label="Закрыть"><CloseIcon className="size-7" /></button>
      </header>

      {finished ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-[22px] font-semibold">Квиз пройден</p>
          <p className="text-[52px] font-extrabold leading-none text-accent">
            +{correct * 5} QP
          </p>
          <p className="text-[18px] text-white/80">
            Верных ответов: {correct} из {questions.length}
          </p>
          <Button className="mt-4" onClick={() => onDone(correct)}>Забрать награду</Button>
        </div>
      ) : (
        <>
          <p className="mt-6 text-[15px] text-muted">
            Вопрос {index + 1} из {questions.length}
          </p>
          <p className="mt-2 text-[24px] font-bold leading-snug">{question.question}</p>

          <div className="mt-6 space-y-3">
            {question.options.map((option, optionIndex) => (
              <button
                key={optionIndex} onClick={() => setPicked(optionIndex)}
                className={`w-full rounded-[20px] px-5 py-4 text-left text-[18px] transition ${
                  picked === optionIndex ? 'bg-accent' : 'bg-surface-2'}`}
              >
                {option}
              </button>
            ))}
          </div>

          <div className="mt-auto">
            <Button disabled={picked === null} onClick={next}>
              {index === questions.length - 1 ? 'Завершить' : 'Дальше'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
