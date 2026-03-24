'use client'

import { use } from 'react'
import PurchaseDetail from '@/components/purchases/PurchaseDetail'

export default function WorkerPurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <PurchaseDetail id={id} viewerRole="worker" backPath="/worker/purchases" />
}
