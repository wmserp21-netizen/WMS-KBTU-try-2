// Server-only: использует next/headers — не импортировать в Client Components
import { createClient } from '@/lib/supabase/server'
import type { UserProfile } from '@/lib/auth'

export async function getUserProfile(): Promise<UserProfile | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return data as UserProfile | null
}
