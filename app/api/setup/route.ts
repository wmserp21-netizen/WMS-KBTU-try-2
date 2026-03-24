import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST() {
  const adminClient = await createAdminClient()

  // Создать admin-пользователя
  const { data: user, error: userError } = await adminClient.auth.admin.createUser({
    email: 'wmserp21@gmail.com',
    password: 'diploma2026',
    email_confirm: true,
  })

  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 400 })
  }

  // Создать профиль
  const { error: profileError } = await adminClient
    .from('profiles')
    .insert({
      id: user.user.id,
      role: 'admin',
      full_name: 'Администратор системы',
      status: 'active',
    })

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, userId: user.user.id })
}
