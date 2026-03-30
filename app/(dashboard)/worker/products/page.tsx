import { createClient } from '@/lib/supabase/server'
import { getUserProfile } from '@/lib/auth.server'
import ProductsPageClient from '@/components/products/ProductsPage'

export default async function WorkerProductsPage() {
  const profile = await getUserProfile()
  const supabase = await createClient()

  // Find the warehouse this worker is assigned to, then get its owner
  const { data: assignment } = await supabase
    .from('warehouse_workers')
    .select('warehouse_id, warehouses(owner_id)')
    .eq('worker_id', profile?.id ?? '')
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ownerId = (assignment?.warehouses as any)?.owner_id ?? null

  return <ProductsPageClient viewerRole="worker" currentOwnerId={ownerId ?? undefined} />
}
