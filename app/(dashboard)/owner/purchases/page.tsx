'use client'

import PurchasesTable from '@/components/purchases/PurchasesTable'

export default function OwnerPurchasesPage() {
  return <PurchasesTable viewerRole="owner" basePath="/owner/purchases" />
}
