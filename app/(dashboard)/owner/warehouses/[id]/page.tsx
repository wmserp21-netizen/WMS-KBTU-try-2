import WarehouseDetail from '@/components/warehouses/WarehouseDetail'

export default async function OwnerWarehouseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <WarehouseDetail warehouseId={id} viewerRole="owner" backHref="/owner/warehouses" />
}
