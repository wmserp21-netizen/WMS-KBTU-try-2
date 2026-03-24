'use client'
import ReturnsTable from '@/components/returns/ReturnsTable'
export default function WorkerReturnsPage() {
  return <ReturnsTable viewerRole="worker" basePath="/worker/returns" />
}
