'use client'

import PurchasesTable from '@/components/purchases/PurchasesTable'

export default function WorkerPurchasesPage() {
  return <PurchasesTable viewerRole="worker" basePath="/worker/purchases" />
}
