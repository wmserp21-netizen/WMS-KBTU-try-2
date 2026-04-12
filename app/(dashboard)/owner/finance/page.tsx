'use client'
import { useSearchParams } from 'next/navigation'
import FinancePage from '@/components/finance/FinancePage'

export default function OwnerFinancePage() {
  const params = useSearchParams()
  const from = params.get('from')
  const to = params.get('to')
  const wh = params.get('warehouses')

  const initialDateRange: [string, string] | undefined =
    from && to ? [from, to] : undefined

  const initialWarehouses: string[] | undefined =
    wh ? wh.split(',').filter(Boolean) : undefined

  return (
    <FinancePage
      viewerRole="owner"
      initialDateRange={initialDateRange}
      initialWarehouses={initialWarehouses}
    />
  )
}
