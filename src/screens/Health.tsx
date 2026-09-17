import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui'
import { db, isLive } from '../lib/supabase'
import { useAuth } from '../lib/auth'

/**
 * Страница самопроверки. Нужна потому, что проверить боевую базу из среды
 * разработки нельзя: доступ к supabase.co оттуда закрыт. Эта страница делает
 * те же проверки изнутри приложения, на устройстве владельца.
 *
 * Открывается по адресу #/health и никуда не ведёт из интерфейса — это
 * служебный экран, не часть приложения.
 */

type Status = 'idle' | 'checking' | 'ok' | 'warn' | 'fail'

interface Check {
  key: string
  title: string
  status: Status
  detail: string
}

const SIGN: Record<Status, string> = {
  idle: '·', checking: '…', ok: '✓', warn: '!', fail: '×',
}

const TONE: Record<Status, string> = {
  idle: 'text-muted',
  checking: 'text-muted',
  ok: 'text-success',
  warn: 'text-yellow-400',
  fail: 'text-red-400',
}

export default function Health () {
  const { session, profile } = useAuth()
  const [checks, setChecks] = useState<Check[]>([])
  const [aiState, setAiState] = useState<Check | null>(null)
  const [aiBusy, setAiBusy] = useState(false)

  useEffect(() => { void runChecks() }, [session?.user.id])

  async function runChecks () {
    const result: Check[] = []
    const add = (key: string, title: string, status: Status, detail: string) =>
      result.push({ key, title, status, detail })

    if (!isLive) {
      add('mode', 'Режим', 'warn', 'Демонстрационный: ключи базы не заданы')
      setChecks(result)
      return
    }

    const client = db()

    add('session', 'Вход выполнен', session ? 'ok' : 'warn',
        session ? (profile?.nickname ?? 'профиль ещё не заполнен') : 'войдите, иначе часть проверок не пройдёт')

    // 1. Связь с базой и справочник интересов.
    try {
      const { data, error } = await client.from('interest').select('code, is_event_category')
      if (error) throw error

      add('db', 'База отвечает', 'ok', `справочник интересов на месте`)

      const total = data?.length ?? 0
      const categories = data?.filter((row) => row.is_event_category).length ?? 0

      add('interests', 'Расширенные интересы',
          total >= 26 ? 'ok' : 'warn',
          total >= 26
            ? `${total} интересов, из них ${categories} — категории ивента`
            : `${total} интересов: файл 002_photos_and_interests.sql ещё не выполнен`)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      add('db', 'База отвечает', 'fail', message)
      add('interests', 'Расширенные интересы', 'fail', 'проверка не выполнялась')
    }

    // 2. Шаблоны квестов — запасной путь, если модель недоступна.
    try {
      const { count, error } = await client
        .from('quest_template').select('id', { count: 'exact', head: true })
      if (error) throw error
      add('templates', 'Шаблоны квестов', (count ?? 0) > 0 ? 'ok' : 'warn',
          `${count ?? 0} шт. — запасной вариант, если ИИ недоступен`)
    } catch {
      add('templates', 'Шаблоны квестов', 'fail', 'не удалось прочитать')
    }

    // 3. Хранилище фотографий.
    try {
      const { error } = await client.storage.from('media').list('', { limit: 1 })
      if (error) throw error
      add('storage', 'Хранилище фотографий', 'ok', 'папка media доступна')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      add('storage', 'Хранилище фотографий',
          message.toLowerCase().includes('not found') ? 'warn' : 'fail',
          message.toLowerCase().includes('not found')
            ? 'папки нет: файл 002_photos_and_interests.sql ещё не выполнен'
            : message)
    }

    // 4. Чат в реальном времени.
    try {
      const channel = client.channel('health-check')
      const state = await new Promise<string>((resolve) => {
        const timer = setTimeout(() => resolve('timeout'), 6000)
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR') {
            clearTimeout(timer)
            resolve(status)
          }
        })
      })
      client.removeChannel(channel)

      add('realtime', 'Чат в реальном времени', state === 'SUBSCRIBED' ? 'ok' : 'fail',
          state === 'SUBSCRIBED' ? 'подписка установлена' : `не подключилось (${state})`)
    } catch {
      add('realtime', 'Чат в реальном времени', 'fail', 'не удалось подключиться')
    }

    setChecks(result)
  }

  /** Отдельной кнопкой: проверка тратит обращение к модели. */
  async function checkAI () {
    setAiBusy(true)
    setAiState({ key: 'ai', title: 'ИИ-генерация квестов', status: 'checking', detail: 'спрашиваем модель…' })

    try {
      const { data, error } = await db().functions.invoke('generate-quest', {
        body: {
          title: 'Проверка связи',
          description: 'Тестовый запрос со страницы самопроверки',
          category: 'chill',
          address: 'Екатеринбург, Плотинка',
          participants: 3,
          interests: ['coffee'],
        },
      })

      if (error) {
        const status = (error as { context?: { status?: number } }).context?.status
        setAiState({
          key: 'ai', title: 'ИИ-генерация квестов',
          status: 'warn',
          detail: status === 503
            ? 'функция работает, но ключ GEMINI_API_KEY не задан в Secrets'
            : status === 404
              ? 'функция generate-quest ещё не создана'
              : `функция ответила ошибкой (${status ?? 'нет кода'}) — квесты будут из шаблонов`,
        })
        return
      }

      const tasks = Array.isArray(data?.tasks) ? data.tasks.length : 0
      setAiState({
        key: 'ai', title: 'ИИ-генерация квестов',
        status: tasks === 3 ? 'ok' : 'warn',
        detail: tasks === 3
          ? `модель придумала квест: ${data.tasks.map((t: { title: string }) => t.title).join(', ')}`
          : 'ответ пришёл, но не в нужном виде — сработает запасной шаблон',
      })
    } catch (cause) {
      setAiState({
        key: 'ai', title: 'ИИ-генерация квестов', status: 'fail',
        detail: cause instanceof Error ? cause.message : 'не удалось вызвать функцию',
      })
    } finally {
      setAiBusy(false)
    }
  }

  const all = aiState ? [...checks, aiState] : checks

  return (
    <div className="no-scrollbar h-full overflow-y-auto px-5 pb-10 pt-6">
      <h1 className="text-[26px]">Самопроверка</h1>
      <p className="mt-1 text-[15px] leading-snug text-muted">
        Служебный экран: показывает, что уже настроено, а что нет.
      </p>

      <div className="mt-5 space-y-2.5">
        {all.length === 0 && <p className="text-[16px] text-muted">Проверяем…</p>}

        {all.map((check) => (
          <div key={check.key} className="flex gap-3 rounded-card bg-surface-2 p-3.5">
            <span className={`text-[20px] font-bold leading-none ${TONE[check.status]}`}>
              {SIGN[check.status]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-semibold">{check.title}</p>
              <p className="mt-0.5 break-words text-[14px] leading-snug text-muted">
                {check.detail}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        <Button variant="ghost" onClick={runChecks}>Проверить заново</Button>
        <Button disabled={aiBusy} onClick={checkAI}>
          {aiBusy ? 'Спрашиваем модель…' : 'Проверить генерацию квеста'}
        </Button>
        <Link to="/" className="block py-2 text-center text-[16px] text-muted">
          На главную
        </Link>
      </div>
    </div>
  )
}
