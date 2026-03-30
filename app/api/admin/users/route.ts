import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/admin/users — create owner or worker
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!caller || (caller.role !== 'admin' && caller.role !== 'owner')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { email, password, role, full_name, phone, org_name, too_name, bin_iin, status } = body

  const admin = await createAdminClient()

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createError) return NextResponse.json({ error: createError.message }, { status: 400 })

  const { error: profileError } = await admin.from('profiles').upsert({
    id: created.user.id,
    role: role ?? 'worker',
    full_name: full_name ?? null,
    phone: phone ?? null,
    org_name: org_name ?? null,
    too_name: too_name ?? null,
    bin_iin: bin_iin ?? null,
    status: status ?? 'active',
  }, { onConflict: 'id' })
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id)
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  // If warehouse_id provided — assign worker to warehouse
  const { warehouse_id } = body
  if (warehouse_id) {
    await admin.from('warehouse_workers').upsert({
      warehouse_id,
      worker_id: created.user.id,
    }, { onConflict: 'warehouse_id,worker_id' })
  }

  return NextResponse.json({ id: created.user.id })
}

// PATCH /api/admin/users — update profile (optionally reset password)
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!caller || (caller.role !== 'admin' && caller.role !== 'owner')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { id, password, ...profileFields } = body

  const admin = await createAdminClient()

  const { error: profileError } = await admin.from('profiles').update(profileFields).eq('id', id)
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400 })

  if (password) {
    const { error: pwError } = await admin.auth.admin.updateUserById(id, { password })
    if (pwError) return NextResponse.json({ error: pwError.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
