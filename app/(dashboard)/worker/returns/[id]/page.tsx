'use client'
import { use } from 'react'
import ReturnDetail from '@/components/returns/ReturnDetail'
export default function WorkerReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <ReturnDetail id={id} viewerRole="worker" backPath="/worker/returns" salesBasePath="/worker/sales" />
}
