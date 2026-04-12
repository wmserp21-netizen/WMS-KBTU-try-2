'use client'

import { useSearchParams } from 'next/navigation'
import ReportsPage from '@/components/reports/ReportsPage'

export default function OwnerReportsPage() {
  const tab = useSearchParams().get('tab') ?? 'stock'
  return <ReportsPage viewerRole="owner" defaultTab={tab} />
}
