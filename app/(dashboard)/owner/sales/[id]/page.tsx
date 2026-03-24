'use client'
import { use } from 'react'
import SaleDetail from '@/components/sales/SaleDetail'
export default function OwnerSaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <SaleDetail id={id} viewerRole="owner" backPath="/owner/sales" returnsNewPath="/owner/returns/new" />
}
