'use client'

import PurchasesTable from '@/components/purchases/PurchasesTable'

export default function AdminPurchasesPage() {
  return <PurchasesTable viewerRole="admin" basePath="/admin/purchases" />
}
