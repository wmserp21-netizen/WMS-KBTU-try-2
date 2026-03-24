'use client'
import SalesTable from '@/components/sales/SalesTable'
export default function OwnerSalesPage() {
  return <SalesTable viewerRole="owner" basePath="/owner/sales" />
}
