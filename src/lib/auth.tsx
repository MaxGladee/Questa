import {
  createContext, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { db, isLive, supabase } from './supabase'
import { ME, type User } from '../data/demo'

interface AuthValue {
  /** Сессия и профиль загружены — до этого момента судить о входе рано. */
  ready: boolean
  session: Session | null
  profile: User | null
  /** Регистрация. Возвращает, нужно ли подтверждать почту кодом. */
  signUp: (email: string, password: string) => Promise<{ needsCode: boolean }>
  verifyCode: (email: string, code: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  createProfile: (input: ProfileInput) => Promise<void>
  updateProfile: (input: ProfileInput) => Promise<void>
  changePassword: (current: string, next: string) => Promise<void>
  /** Письмо со ссылкой на смену пароля (ЧТЗ 5.1.2). */
  sendPasswordReset: (email: string) => Promise<void>
  /** Новый пароль по ссылке из письма — текущий при этом не спрашивается. */
  setNewPassword: (password: string) => Promise<void>
  /** Удаление аккаунта. purged=false — стереть совсем не вышло, аккаунт отключён. */
  deleteAccount: () => Promise<{ purged: boolean }>
  refreshProfile: () => Promise<void>
}

interface ProfileInput {
  nickname: string
  city: string
  interests: string[]
  avatarUrl?: string
}

const AuthContext = createContext<AuthValue | null>(null)

export function useAuth () {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth вызван вне AuthProvider')
  return value
}

/**
 * Полное удаление аккаунта серверной функцией. Стереть запись входа из
 * браузера нельзя — это умеет только ключ, который в код страницы не кладут.
 * Возвращает, получилось ли: функцию могли ещё не развернуть.
 */
async function purgeAccount (): Promise<boolean> {
  const client = supabase!
  try {
    const { data, error } = await client.functions.invoke('delete-account')
    if (error) return false
    return Boolean((data as { ok?: boolean } | null)?.ok)
  } catch {
    return false
  }
}

/** Профиль из базы в вид, который ждут экраны. */
async function loadProfile (userId: string): Promise<User | null> {
  const client = supabase!

  const { data: row } = await client
    .from('app_user')
    .select('id, nickname, city, avatar_url, qp_balance, exp_total, streak_days, average_rating, deleted_at')
    .eq('id', userId)
    .maybeSingle()

  if (!row) return null

  // Аккаунт помечен удалённым, но запись входа осталась — значит в прошлый
  // раз функция удаления была недоступна. Доводим начатое до конца и
  // выходим: человек просил удалить аккаунт, а не отложить это.
  if (row.deleted_at) {
    await purgeAccount()
    await client.auth.signOut()
    return null
  }

  const [{ data: interests }, attended, hosted] = await Promise.all([
    client.from('user_interest').select('interest(code)').eq('user_id', userId),
    client.from('event_participant').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).not('checked_in_at', 'is', null),
    client.from('event').select('id', { count: 'exact', head: true }).eq('organizer_id', userId),
  ])

  return {
    id: row.id,
    nickname: row.nickname,
    city: row.city ?? '',
    avatarUrl: row.avatar_url ?? undefined,
    qpBalance: row.qp_balance,
    expTotal: row.exp_total,
    streakDays: row.streak_days,
    averageRating: Number(row.average_rating ?? 0),
    eventsAttended: attended.count ?? 0,
    eventsHosted: hosted.count ?? 0,
    // Supabase отдаёт связанную таблицу вложенным объектом или массивом —
    // в зависимости от того, как разобрал связь, поэтому разбираем оба вида.
    interests: (interests ?? []).flatMap((item) => {
      const related = (item as { interest: unknown }).interest
      const list = Array.isArray(related) ? related : [related]
      return list.flatMap((entry) => {
        const code = (entry as { code?: string } | null)?.code
        return code ? [code] : []
      })
    }),
  }
}

export function AuthProvider ({ children }: { children: ReactNode }) {
  const [sessionReady, setSessionReady] = useState(!isLive)
  const [profileReady, setProfileReady] = useState(!isLive)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<User | null>(isLive ? null : ME)

  useEffect(() => {
    if (!isLive) return
    const client = supabase!

    client.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionReady(true)
    })

    const { data: listener } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setSessionReady(true)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  // Профиль подтягивается под текущую сессию и отмечает вход в стрике.
  //
  // Пока он грузится, приложение не должно решать, заполнен профиль или нет:
  // именно из-за преждевременного вывода после перезагрузки страницы
  // пользователя раз за разом уводило на экран создания профиля.
  useEffect(() => {
    if (!isLive) return

    const userId = session?.user.id
    if (!userId) {
      setProfile(null)
      setProfileReady(sessionReady)
      return
    }

    let cancelled = false
    setProfileReady(false)

    loadProfile(userId).then((loaded) => {
      if (cancelled) return
      setProfile(loaded)
      setProfileReady(true)
    }).catch(() => {
      if (!cancelled) setProfileReady(true)
    })

    return () => { cancelled = true }
  }, [session?.user.id, sessionReady])

  const value = useMemo<AuthValue>(() => ({
    ready: sessionReady && profileReady,
    session,
    profile,

    async signUp (email, password) {
      const { data, error } = await db().auth.signUp({ email, password })
      if (error) throw error
      // Сессия приходит сразу, если подтверждение почты выключено в проекте.
      return { needsCode: !data.session }
    },

    async verifyCode (email, code) {
      const { error } = await db().auth.verifyOtp({ email, token: code, type: 'email' })
      if (error) throw error
    },

    async signIn (email, password) {
      const { error } = await db().auth.signInWithPassword({ email, password })
      if (error) throw error
    },

    async signOut () {
      await db().auth.signOut()
      setProfile(null)
    },

    async createProfile ({ nickname, city, interests, avatarUrl }) {
      const client = db()
      const user = (await client.auth.getUser()).data.user
      if (!user) throw new Error('Нет активной сессии')

      const { error } = await client.from('app_user')
        .upsert({ id: user.id, email: user.email!, nickname, city, avatar_url: avatarUrl ?? null })
      if (error) throw error

      const { data: rows } = await client.from('interest').select('id, code').in('code', interests)
      if (rows?.length) {
        await client.from('user_interest')
          .upsert(rows.map((row) => ({ user_id: user.id, interest_id: row.id })))
      }

      setProfile(await loadProfile(user.id))
    },

    async updateProfile ({ nickname, city, interests, avatarUrl }) {
      const client = db()
      if (!profile) throw new Error('Нет профиля')

      const { error } = await client.from('app_user')
        .update({ nickname, city, avatar_url: avatarUrl ?? null }).eq('id', profile.id)
      if (error) throw error

      // Интересы проще переписать целиком, чем вычислять разницу.
      await client.from('user_interest').delete().eq('user_id', profile.id)

      const { data: rows } = await client.from('interest').select('id, code').in('code', interests)
      if (rows?.length) {
        await client.from('user_interest')
          .insert(rows.map((row) => ({ user_id: profile.id, interest_id: row.id })))
      }

      setProfile(await loadProfile(profile.id))
    },

    async changePassword (current, next) {
      const client = db()
      const email = session?.user.email
      if (!email) throw new Error('Нет активной сессии')

      // Supabase меняет пароль без проверки старого, поэтому сверяем сами.
      const { error: wrong } = await client.auth.signInWithPassword({ email, password: current })
      if (wrong) throw new Error('Текущий пароль указан неверно')

      const { error } = await client.auth.updateUser({ password: next })
      if (error) throw error
    },

    /**
     * Удаление аккаунта (ЧТЗ 5.1.5). Запись помечается удалённой и пропадает
     * из приложения; окончательное стирание данных происходит на стороне
     * сервера в срок до 30 дней, как требует ТЗ 4.1.5.
     */
    /**
     * Ссылка из письма приводит человека обратно в приложение уже с
     * действующей сессией, поэтому возвращаемся на его же адрес с пометкой
     * recovery: по ней приложение открывает экран смены пароля.
     */
    async sendPasswordReset (email) {
      const back = `${window.location.origin}${import.meta.env.BASE_URL}?recovery=1`
      const { error } = await db().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: back,
      })
      if (error) throw error
    },

    async setNewPassword (password) {
      const { error } = await db().auth.updateUser({ password })
      if (error) throw error
    },

    async deleteAccount () {
      const client = db()
      if (!profile) return { purged: true }

      const purged = await purgeAccount()

      // Функция могла быть ещё не развёрнута. Тогда аккаунт хотя бы
      // отключается: войти в него уже не выйдет, а стереть его до конца
      // приложение попробует при следующей попытке входа.
      if (!purged) {
        await client.from('app_user')
          .update({ deleted_at: new Date().toISOString() }).eq('id', profile.id)
      }

      await client.auth.signOut()
      setProfile(null)
      return { purged }
    },

    async refreshProfile () {
      if (session?.user.id) setProfile(await loadProfile(session.user.id))
    },
  }), [sessionReady, profileReady, session, profile])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
