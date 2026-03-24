'use client'
import { use } from 'react'
import ReturnDetail from '@/components/returns/ReturnDetail'
export default function OwnerReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <ReturnDetail id={id} viewerRole="owner" backPath="/owner/returns" salesBasePath="/owner/sales" />
}
