import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { type UserRole } from '@/lib/auth'
import DashboardShell from '@/components/layout/DashboardShell'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, full_name, status')
    .eq('id', user.id)
    .single()

  if (!profile || profile.status === 'blocked') {
    redirect('/login')
  }

  return (
    <DashboardShell role={profile.role as UserRole} fullName={profile.full_name}>
      {children}
    </DashboardShell>
  )
}
