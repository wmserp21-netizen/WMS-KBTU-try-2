'use client'
import SalesTable from '@/components/sales/SalesTable'
export default function AdminSalesPage() {
  return <SalesTable viewerRole="admin" basePath="/admin/sales" />
}
