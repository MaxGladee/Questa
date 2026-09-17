import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/**
 * Приложение работает в двух режимах.
 *
 * Боевой — когда заданы адрес и ключ проекта: данные читаются и пишутся в
 * PostgreSQL, чат идёт через Realtime, вход настоящий.
 *
 * Демонстрационный — когда их нет: экраны наполняются данными из
 * src/data/demo.ts. Нужен для разработки и как страховка: если база окажется
 * недоступна, приложение всё равно откроется и его можно будет показать.
 */
export const isLive = Boolean(url && publishableKey)

export const supabase = isLive
  ? createClient(url, publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null

/** Обращение к базе там, где она обязана быть. */
export function db () {
  if (!supabase) throw new Error('База не настроена: нет VITE_SUPABASE_URL')
  return supabase
}
