import { createClient } from '@/lib/supabase/server'
import { getUserProfile } from '@/lib/auth.server'
import ProductsPageClient from '@/components/products/ProductsPage'

export default async function OwnerProductsPage() {
  const profile = await getUserProfile()
  const supabase = await createClient()

  // Ensure owner exists in profiles (for passing ownerId)
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', profile?.id ?? '')
    .single()

  return (
    <ProductsPageClient
      viewerRole="owner"
      currentOwnerId={data?.id ?? profile?.id}
    />
  )
}
