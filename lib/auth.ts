// Типы и утилиты — безопасны как в Client, так и в Server компонентах

export type UserRole = 'admin' | 'owner' | 'worker'

export interface UserProfile {
  id: string
  role: UserRole
  full_name: string | null
  phone: string | null
  org_name: string | null
  too_name: string | null
  bin_iin: string | null
  status: 'active' | 'blocked'
}

export function getRoleDashboard(role: UserRole): string {
  switch (role) {
    case 'admin': return '/admin'
    case 'owner': return '/owner'
    case 'worker': return '/worker'
  }
}

export function getRoleLabel(role: UserRole): string {
  switch (role) {
    case 'admin': return 'Администратор'
    case 'owner': return 'Владелец'
    case 'worker': return 'Сотрудник'
  }
}
