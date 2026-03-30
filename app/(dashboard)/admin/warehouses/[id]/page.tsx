import WarehouseDetail from '@/components/warehouses/WarehouseDetail'

export default async function AdminWarehouseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <WarehouseDetail warehouseId={id} viewerRole="admin" backHref="/admin/warehouses" />
}
