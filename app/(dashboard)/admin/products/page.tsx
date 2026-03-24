import { createClient } from '@/lib/supabase/server'
import ProductsPageClient from '@/components/products/ProductsPage'

export default async function AdminProductsPage() {
  const supabase = await createClient()
  const { data: owners } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'owner')
    .order('full_name')

  return (
    <ProductsPageClient
      viewerRole="admin"
      owners={owners ?? []}
    />
  )
}
