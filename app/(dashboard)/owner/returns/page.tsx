'use client'
import ReturnsTable from '@/components/returns/ReturnsTable'
export default function OwnerReturnsPage() {
  return <ReturnsTable viewerRole="owner" basePath="/owner/returns" />
}
