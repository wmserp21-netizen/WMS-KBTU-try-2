'use client'
import SalesTable from '@/components/sales/SalesTable'
export default function WorkerSalesPage() {
  return <SalesTable viewerRole="worker" basePath="/worker/sales" />
}
