'use client'

import EmployeesTable from '@/components/employees/EmployeesTable'

export default function AdminEmployeesPage() {
  return <EmployeesTable viewerRole="admin" />
}
