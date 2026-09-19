import { useRef, useState } from 'react'
import { Button } from '../components/ui'
import { CameraIcon, CloseIcon } from '../components/icons'
import { shrinkImage, toBase64 } from '../lib/image'
import { uploadImage, verifyPhoto, type PhotoVerdict } from '../lib/api'
import type { QuestTask } from '../data/demo'

type Stage = 'ask' | 'preview' | 'checking' | 'verdict'

/** Сколько даётся за снимок, засчитанный вопреки отказу модели. */
export const FORCED_REWARD = 5

/**
 * Задание типа «Фото» (ЧТЗ 5.11.2), с проверкой снимка моделью из ТЗ 4.2.6.
 *
 * Вердикт модели намеренно нежёсткий. Она может не узнать правильный снимок
 * из-за темноты или ракурса, и на защите отказ выглядел бы поломкой, а не
 * строгостью. Поэтому при отказе видно, чего не хватило, и есть обе кнопки:
 * переснять и засчитать как есть. Если модель недоступна, задание
 * засчитывается по факту загрузки — ровно как описано в ЧТЗ 3.3.
 *
 * Но засчитать себе задание вопреки отказу — не то же самое, что выполнить
 * его: за такой снимок начисляются символические очки, и человек знает об
 * этом до нажатия, а не узнаёт из баланса.
 */
export default function PhotoTask (
  { task, userId, onClose, onDone }: {
    task: QuestTask
    userId: string
    onClose: () => void
    /** verified — модель подтвердила снимок; от этого зависит награда. */
    onDone: (result: { photoUrl?: string; verified: boolean }) => void
  },
) {
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)

  const [stage, setStage] = useState<Stage>('ask')
  const [preview, setPreview] = useState<string>()
  const [shot, setShot] = useState<File>()
  const [verdict, setVerdict] = useState<PhotoVerdict>()
  const [photoUrl, setPhotoUrl] = useState<string>()
  const [error, setError] = useState('')

  const prompt = task.params?.prompt ?? task.description

  async function choose (file: File | undefined) {
    if (!file) return
    setError('')

    try {
      const small = await shrinkImage(file)
      setShot(small)
      setPreview(URL.createObjectURL(small))
      setStage('preview')
    } catch {
      setError('Не удалось прочитать снимок. Попробуйте другой.')
    }
  }

  async function send () {
    if (!shot) return
    setStage('checking')
    setError('')

    try {
      // Модели уходит уменьшенная копия, а в хранилище — снимок покрупнее.
      //
      // Картинку модель считает плитками: кадр в 1280 точек стоит вдвое
      // дороже, чем в 900, а «есть ли в кадре вывеска» одинаково видно и
      // там, и там. Платит за токены владелец ключа, и эта экономия ему
      // достаётся даром.
      const forModel = await shrinkImage(shot, 900, 0.8)
      const result = await verifyPhoto(prompt, await toBase64(forModel))
      setVerdict(result)

      if (result.ok) {
        // Сохранение снимка — не то, ради чего человек это делал. Если
        // хранилище недоступно, задание всё равно засчитывается: терять
        // выполненное из-за неудачной загрузки несправедливо.
        try {
          setPhotoUrl(await uploadImage(shot, userId, 'task'))
        } catch {
          setPhotoUrl(undefined)
        }
      }

      setStage('verdict')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось отправить снимок')
      setStage('preview')
    }
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-bg">
      <header className="flex items-center justify-between gap-3 px-5 pb-3 pt-4">
        <h2 className="min-w-0 flex-1 truncate text-[22px] font-extrabold">{task.title}</h2>
        <button onClick={onClose} aria-label="Закрыть"><CloseIcon className="size-7" /></button>
      </header>

      <p className="px-5 pb-4 text-[17px] leading-snug text-white/80">{prompt}</p>

      <div className="flex min-h-0 flex-1 flex-col justify-center px-5">
        {preview ? (
          <img
            src={preview} alt="Ваш снимок"
            className="max-h-full w-full rounded-card object-contain"
          />
        ) : (
          <div className="grid aspect-square w-full place-items-center rounded-card bg-surface-2">
            <CameraIcon className="size-16 text-muted" />
          </div>
        )}
      </div>

      <div className="shrink-0 space-y-3 p-5 pb-[calc(1.25rem+var(--safe-bottom))]">
        {error && <p className="text-center text-[15px] text-red-400">{error}</p>}

        {stage === 'ask' && (
          <>
            <Button onClick={() => camera.current?.click()}>Сделать снимок</Button>
            <Button variant="ghost" onClick={() => gallery.current?.click()}>
              Выбрать из галереи
            </Button>
          </>
        )}

        {stage === 'preview' && (
          <>
            <Button onClick={send}>Отправить</Button>
            <Button variant="ghost" onClick={() => camera.current?.click()}>Переснять</Button>
          </>
        )}

        {stage === 'checking' && (
          <p className="py-3 text-center text-[17px] text-muted">Смотрим, что получилось…</p>
        )}

        {stage === 'verdict' && verdict && (
          <>
            <p className={`text-center text-[17px] leading-snug ${
              verdict.skipped ? 'text-muted' : verdict.ok ? 'text-success' : 'text-yellow-300'}`}>
              {verdict.skipped
                ? 'Проверка недоступна — снимок принят на слово'
                : verdict.ok
                  ? verdict.reason || 'Снимок подходит'
                  : verdict.reason || 'Кажется, на снимке не то, что нужно'}
            </p>

            {/* Почему модель не посмотрела — мелким шрифтом: человеку это
                не мешает, а понять, что сломалось, без этого нельзя. */}
            {verdict.skipped && verdict.reason && (
              <p className="text-center text-[13px] leading-snug text-muted/70">
                {verdict.reason}
              </p>
            )}

            {verdict.ok ? (
              <Button onClick={() => onDone({ photoUrl, verified: true })}>
                Забрать +{task.qpReward} QP
              </Button>
            ) : (
              <>
                <Button onClick={() => { setStage('ask'); setPreview(undefined) }}>
                  Переснять
                </Button>

                {/* Последнее слово за человеком: он был на месте, а модель нет.
                    Но и награда за такой снимок другая — о чём сказано прямо. */}
                <Button variant="ghost" onClick={() => onDone({ photoUrl, verified: false })}>
                  Всё равно засчитать · +{FORCED_REWARD} QP
                </Button>
                <p className="text-center text-[13px] leading-snug text-muted">
                  Модель не подтвердила снимок, поэтому начислим {FORCED_REWARD} QP вместо
                  {' '}{task.qpReward}. Переснимете — получите полную награду.
                </p>
              </>
            )}
          </>
        )}
      </div>

      <input
        ref={camera} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => choose(e.target.files?.[0])}
      />
      <input
        ref={gallery} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
        onChange={(e) => choose(e.target.files?.[0])}
      />
    </div>
  )
}
