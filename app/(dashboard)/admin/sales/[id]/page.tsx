'use client'
import { use } from 'react'
import SaleDetail from '@/components/sales/SaleDetail'
export default function AdminSaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <SaleDetail id={id} viewerRole="admin" backPath="/admin/sales" returnsNewPath="/admin/returns/new" />
}
