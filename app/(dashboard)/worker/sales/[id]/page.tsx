'use client'
import { use } from 'react'
import SaleDetail from '@/components/sales/SaleDetail'
export default function WorkerSaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <SaleDetail id={id} viewerRole="worker" backPath="/worker/sales" returnsNewPath="/worker/returns/new" />
}
