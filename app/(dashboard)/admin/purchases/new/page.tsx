'use client'

import PurchaseForm from '@/components/purchases/PurchaseForm'

export default function AdminNewPurchasePage() {
  return <PurchaseForm backPath="/admin/purchases" detailBasePath="/admin/purchases" />
}
