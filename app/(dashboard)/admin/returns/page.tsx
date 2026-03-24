'use client'
import ReturnsTable from '@/components/returns/ReturnsTable'
export default function AdminReturnsPage() {
  return <ReturnsTable viewerRole="admin" basePath="/admin/returns" />
}
