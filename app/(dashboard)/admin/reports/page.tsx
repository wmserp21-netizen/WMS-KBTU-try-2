'use client'

import { useSearchParams } from 'next/navigation'
import ReportsPage from '@/components/reports/ReportsPage'

export default function AdminReportsPage() {
  const tab = useSearchParams().get('tab') ?? 'stock'
  return <ReportsPage viewerRole="admin" defaultTab={tab} />
}
