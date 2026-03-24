'use client'
import { use } from 'react'
import ReturnDetail from '@/components/returns/ReturnDetail'
export default function AdminReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <ReturnDetail id={id} viewerRole="admin" backPath="/admin/returns" salesBasePath="/admin/sales" />
}
