import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PlainScreen } from '../components/Layout'
import { Avatar } from '../components/ui'
import { Failed, Loading } from '../components/States'
import {
  BackIcon, CameraIcon, ChevronIcon, GeoTaskIcon, PinIcon, QuizIcon, SparkIcon,
} from '../components/icons'
import type { QuestTask } from '../data/demo'
import {
  REGENERATE_COST, checkIn, completeTask, getEvent, getQuest, regenerateQuest,
} from '../lib/api'
import { GEO_QUICK, distanceMeters, formatDistance, geoErrorMessage } from '../lib/geo'
import { useAsync } from '../lib/useAsync'
import { useAuth } from '../lib/auth'
import { useCountUp } from '../lib/useCountUp'
import Quiz from './Quiz'
import GeoTask from './GeoTask'
import PhotoTask, { FORCED_REWARD } from './PhotoTask'

/**
 * На каком расстоянии от точки встречи отметка ещё считается честной.
 *
 * Радиус чек-ина по ЧТЗ 5.9 — сто метров, но городская геолокация врёт на
 * десятки метров даже на улице, а в помещении и того больше. Полторы сотни
 * оставляют запас на эту погрешность и всё ещё не позволяют отметиться из
 * дома.
 */
const CHECKIN_RADIUS = 150

const TASK_ICON = {
  photo: CameraIcon,
  geolocation: GeoTaskIcon,
  quiz: QuizIcon,
}

/** Прогресс квеста: чек-ин, заработанные QP, задания и таблица участников. */
export default function Quest () {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile, refreshProfile } = useAuth()
  const [quizTask, setQuizTask] = useState<QuestTask | null>(null)
  const [geoTask, setGeoTask] = useState<QuestTask | null>(null)
  const [photoTask, setPhotoTask] = useState<QuestTask | null>(null)
  const [busy, setBusy] = useState(false)
  const [questNote, setQuestNote] = useState('')
  const [presenceNote, setPresenceNote] = useState('')
  // Отметка о приходе засчитывается сразу, не дожидаясь перезагрузки
  // экрана: человек нажал, геопозиция сошлась — значит он на месте.
  const [presence, setPresence] = useState<'idle' | 'locating' | 'saving' | 'done'>('idle')

  const { data: event } = useAsync(() => getEvent(id!, profile?.id ?? null), [id, profile?.id])
  const { data: state, error, loading, reload } = useAsync(
    () => getQuest(id!, profile?.id ?? null), [id, profile?.id],
  )

  /**
   * Перепридумать задания. Нужна организатору, когда модель не ответила на
   * старте и квест достался запасной: переигрывать встречу ради этого никто
   * не станет, а пока задания никто не выполнил — заменить их можно.
   */
  async function regenerate () {
    if (!profile || !id || busy) return

    setBusy(true)
    setQuestNote('')
    try {
      const outcome = await regenerateQuest(id, profile.id)
      setQuestNote(outcome.source === 'ai'
        ? `Готово: задания придумал ИИ · −${REGENERATE_COST} QP`
        : `Не вышло: ${outcome.reason ?? 'модель не ответила'}. Очки не списаны`)
      await refreshProfile()
      reload()
    } catch (problem) {
      setQuestNote(problem instanceof Error ? problem.message : 'Не получилось')
    } finally {
      setBusy(false)
    }
  }

  const myId = profile?.id ?? ''
  const earned = state?.earned[myId] ?? 0
  const shownEarned = useCountUp(earned)

  if (loading) return <PlainScreen title="Задания"><Loading /></PlainScreen>
  if (error) return <PlainScreen title="Задания"><Failed message={error} onRetry={reload} /></PlainScreen>

  if (!state?.quest) {
    return (
      <PlainScreen title="Квест ещё не запущен">
        <p className="px-6 py-10 text-center text-[17px] text-muted">
          Организатор запустит его после начала ивента.
        </p>
      </PlainScreen>
    )
  }

  const tasks = state.quest.tasks
  const checkedIn = presence === 'done'
    || (event?.participants.find((person) => person.id === myId)?.checkedIn ?? false)

  /** Кто ещё выполнил это задание — кроме меня: свой значок и так виден. */
  const others = (taskId: string) => (state.doneBy[taskId] ?? [])
    .filter((personId) => personId !== myId)
    .flatMap((personId) => {
      const person = event?.participants.find((item) => item.id === personId)
      return person ? [person] : []
    })

  const board = (event?.participants ?? [])
    .map((person) => ({ ...person, qpEarned: state.earned[person.id] ?? 0 }))
    .sort((a, b) => b.qpEarned - a.qpEarned)

  const myPlace = Math.max(1, board.findIndex((person) => person.id === myId) + 1)

  async function finish (
    task: QuestTask, qpAwarded: number, answer?: unknown, photoUrl?: string,
  ) {
    if (!profile || !id) return
    setBusy(true)
    try {
      await completeTask({
        task, userId: profile.id,
        qpAwarded, answer, photoUrl,
      })
      await refreshProfile()
      reload()
    } finally {
      setBusy(false)
      setQuizTask(null)
    }
  }

  /**
   * Отметка о присутствии (ЧТЗ 5.9).
   *
   * Присутствие проверяется, а не объявляется: приложение спрашивает у
   * браузера, где человек, и сверяет с точкой встречи. Отметиться из дома
   * было бы странно — на этом держится смысл и чек-ина, и гео-задания.
   *
   * Запрос положения идёт по нажатию: Safari на iPhone показывает окно с
   * вопросом только в ответ на действие человека.
   */
  async function markPresence () {
    if (!profile || !id || checkedIn || presence !== 'idle' || !event) return

    setPresence('locating')
    setPresenceNote('')

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!('geolocation' in navigator)) {
          reject(new Error('Устройство не умеет определять геопозицию'))
          return
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, GEO_QUICK)
      })

      const away = distanceMeters(
        [position.coords.latitude, position.coords.longitude],
        [event.lat, event.lng],
      )

      if (away > CHECKIN_RADIUS) {
        setPresence('idle')
        setPresenceNote(
          `До места встречи ${formatDistance(away)} — отметиться можно, подойдя ближе.`,
        )
        return
      }

      setPresence('saving')
      await checkIn(id, profile.id)

      // Кнопка становится отмеченной сразу. Полная перезагрузка экрана
      // здесь только мешала: список заданий подменялся полосой загрузки, и
      // казалось, что нажатие не сработало, а отметка появлялась «через
      // какое-то время сама».
      setPresence('done')
      setPresenceNote('')
      refreshProfile().catch(() => {})
    } catch (cause) {
      setPresence('idle')
      setPresenceNote(
        cause instanceof GeolocationPositionError
          ? geoErrorMessage(cause)
          : cause instanceof Error ? cause.message : 'Не удалось отметиться',
      )
    }
  }

  return (
    <PlainScreen
      title={event?.title ?? 'Задания'}
      left={<button onClick={() => navigate(-1)} aria-label="Назад"><BackIcon className="size-7" /></button>}
    >
      <div className="space-y-6 px-4 pb-10 pt-2">
        <button
          onClick={markPresence} disabled={presence !== 'idle' || checkedIn}
          /*
            До отметки это действие, а не подпись: яркая кнопка, которая
            откликается на нажатие. После — спокойная плашка с галочкой:
            нажимать больше нечего, и выглядеть она должна иначе.
          */
          className={`flex w-full items-center gap-3 rounded-card p-4 text-left transition ${
            checkedIn
              ? 'bg-surface-2'
              : 'bg-accent shadow-lg shadow-accent/25 active:scale-[0.99]'}`}
        >
          <span
            className={`grid size-11 shrink-0 place-items-center rounded-full ${
              checkedIn ? 'bg-success/15' : 'bg-white/20'}`}
          >
            {checkedIn
              ? <span className="text-[20px] font-bold text-success">✓</span>
              : <PinIcon className="size-6 text-white" />}
          </span>

          <span className="min-w-0 flex-1">
            <span className={`block text-[18px] font-bold ${checkedIn ? 'text-muted' : ''}`}>
              {checkedIn ? 'Вы пришли'
                : presence === 'locating' ? 'Ищем вас на карте…'
                : presence === 'saving' ? 'Отмечаем…'
                : 'Я пришёл'}
            </span>
            <span className={`block text-[15px] ${checkedIn ? 'text-muted' : 'text-white/85'}`}>
              {checkedIn
                ? 'Компания видит, что вы на месте · +50 XP'
                : presence === 'locating'
                  ? 'Браузер спрашивает у телефона координаты — это пара секунд'
                  : 'Отметка о приходе к началу встречи · +50 XP'}
            </span>
          </span>

          {!checkedIn && <ChevronIcon className="size-5 shrink-0 text-white/70" />}
        </button>

        {presenceNote && (
          <p className="-mt-1 px-1 text-[14px] leading-snug text-muted">{presenceNote}</p>
        )}

        <div className="flex items-end justify-between rounded-card bg-surface-2 p-5">
          <div className="min-w-0 flex-1">
            <p className="whitespace-nowrap text-[17px] font-bold">Заработанные очки</p>
            <p className="whitespace-nowrap text-[40px] font-extrabold leading-tight text-accent
                          tabular-nums">
              {shownEarned} QP
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="whitespace-nowrap text-[18px] font-bold">
              #{myPlace} из {board.length}
            </p>
            <p className="whitespace-nowrap text-[13px] font-semibold">в таблице лидеров</p>
          </div>
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[24px]">Твои задания</h2>
            {/* Откуда взялись задания, видно сразу: это же и подсказка,
                что модель была недоступна и сработал запасной путь. */}
            {state.quest.source === 'ai' ? (
              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent/20
                               px-3 py-1.5 text-[13px] font-semibold text-accent-soft">
                <SparkIcon className="size-3.5" />
                придумано ИИ
              </span>
            ) : (
              <span className="shrink-0 rounded-full bg-surface-3 px-3 py-1.5 text-[13px]
                               font-semibold text-muted">
                шаблон
              </span>
            )}
          </div>
          {tasks.map((task) => {
            const Icon = TASK_ICON[task.type]
            return (
              <button
                key={task.id} disabled={busy || task.completed}
                onClick={() => {
                  if (task.type === 'quiz') return setQuizTask(task)
                  if (task.type === 'geolocation') return setGeoTask(task)
                  if (task.type === 'photo') return setPhotoTask(task)
                  finish(task, task.qpReward)
                }}
                className={`flex w-full items-center gap-4 rounded-card p-4 text-left transition
                            active:scale-[0.99] ${
                  task.completed ? 'bg-surface-3' : 'bg-accent-2'}`}
              >
                <Icon className="size-8 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[20px] font-bold">{task.title}</p>
                  <p className="line-clamp-2 text-[16px] leading-snug text-white/85">
                    {task.description}
                  </p>

                  {/* Кто из компании уже справился. Строкой в самом
                      задании, а не отдельной лентой событий: экран квеста
                      и так плотный, а знать полезно — видно, что все
                      заняты тем же, и не один ты возишься. */}
                  {others(task.id).length > 0 && (
                    <span className="mt-2 flex items-center gap-2">
                      <span className="flex items-center">
                        {others(task.id).slice(0, 3).map((person, index) => (
                          <span key={person.id} className={index > 0 ? '-ml-2' : ''}>
                            <Avatar
                              name={person.nickname} src={person.avatarUrl} size={22}
                              className="ring-2 ring-black/20"
                            />
                          </span>
                        ))}
                      </span>
                      <span className="text-[13px] text-white/70">
                        {others(task.id).length === 1
                          ? `${others(task.id)[0].nickname} уже справился`
                          : `справились: ${others(task.id).length}`}
                      </span>
                    </span>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  {/*
                    У квиза награда зависит от числа верных ответов, поэтому
                    до выполнения показываем потолок, а после — начисленное.
                  */}
                  <p className={`whitespace-nowrap text-[16px] font-semibold ${
                    task.completed ? 'animate-pop text-success' : 'text-white'}`}>
                    {task.completed
                      ? `+${task.awardedQp ?? task.qpReward} QP`
                      : task.type === 'quiz'
                        ? `до +${task.qpReward} QP`
                        : `+${task.qpReward} QP`}
                  </p>
                  <ChevronIcon className="ml-auto mt-1 size-5" />
                </div>
              </button>
            )
          })}
        </section>

        {event?.myRole === 'organizer' && (
          <div className="space-y-2">
            <button
              disabled={busy} onClick={regenerate}
              className="w-full rounded-card bg-surface-2 py-3 text-center text-[15px]
                         text-accent-soft disabled:opacity-50"
            >
              {busy
                ? 'Придумываем заново…'
                : `Перепридумать задания через ИИ · ${REGENERATE_COST} QP`}
            </button>
            {questNote && (
              <p className="text-center text-[14px] leading-snug text-muted">{questNote}</p>
            )}
          </div>
        )}

        <section className="space-y-2">
          <h2 className="text-[24px]">Таблица участников</h2>
          {board.map((person) => {
            const mine = person.id === myId
            return (
              <div
                key={person.id}
                className={`flex items-center gap-3 rounded-2xl bg-surface-3 p-3 ${
                  mine ? 'ring-1 ring-accent' : ''}`}
              >
                <Avatar name={person.nickname} src={person.avatarUrl} size={40} />
                <span className="min-w-0 flex-1 truncate text-[18px]">
                  {person.nickname}{mine ? ' (ты)' : ''}
                </span>
                <span className="shrink-0 text-[18px] font-bold">{person.qpEarned} QP</span>
              </div>
            )
          })}
        </section>
      </div>

      {geoTask && event && (
        <GeoTask
          task={geoTask}
          target={[
            geoTask.params?.target_latitude ?? event.lat,
            geoTask.params?.target_longitude ?? event.lng,
          ]}
          start={[
            geoTask.params?.from_latitude ?? event.lat,
            geoTask.params?.from_longitude ?? event.lng,
          ]}
          onClose={() => setGeoTask(null)}
          onDone={() => { finish(geoTask, geoTask.qpReward); setGeoTask(null) }}
        />
      )}

      {photoTask && profile && (
        <PhotoTask
          task={photoTask}
          userId={profile.id}
          onClose={() => setPhotoTask(null)}
          onDone={({ photoUrl, verified }) => {
            finish(
              photoTask,
              verified ? photoTask.qpReward : FORCED_REWARD,
              undefined,
              photoUrl,
            )
            setPhotoTask(null)
          }}
        />
      )}

      {quizTask && (
        <Quiz
          task={quizTask}
          onClose={() => setQuizTask(null)}
          onDone={(correct) => finish(quizTask, correct * 5, { correct })}
        />
      )}
    </PlainScreen>
  )
}
