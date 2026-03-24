'use client'

import { use } from 'react'
import PurchaseDetail from '@/components/purchases/PurchaseDetail'

export default function AdminPurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <PurchaseDetail id={id} viewerRole="admin" backPath="/admin/purchases" />
}
