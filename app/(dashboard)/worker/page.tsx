'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Row, Col, Card, Statistic, Typography, Alert, Spin,
} from 'antd'
import {
  ShoppingOutlined, WarningOutlined, ImportOutlined, ExportOutlined,
} from '@ant-design/icons'
import { createClient } from '@/lib/supabase/client'
import dayjs from 'dayjs'

const { Title } = Typography

export default function WorkerDashboardPage() {
  const supabase = createClient()

  const [warehouseId, setWarehouseId] = useState<string | null>(null)
  const [warehouseName, setWarehouseName] = useState<string | null>(null)
  const [skuCount, setSkuCount] = useState(0)
  const [lowStockCount, setLowStockCount] = useState(0)
  const [pendingPurchases, setPendingPurchases] = useState(0)
  const [draftSales, setDraftSales] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    // Get worker's warehouse
    const { data: ww } = await supabase
      .from('warehouse_workers')
      .select('warehouse_id, warehouses(name)')
      .eq('worker_id', user.id)
      .single()

    if (!ww) { setLoading(false); return }

    const whId = ww.warehouse_id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whName = (ww.warehouses as any)?.name ?? null
    setWarehouseId(whId)
    setWarehouseName(whName)

    // SKU count & low stock
    const { data: stockData } = await supabase
      .from('stock')
      .select('quantity, products(min_stock, id)')
      .eq('warehouse_id', whId)

    const skuSet = new Set<string>()
    let lowCount = 0
    for (const row of stockData ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = row.products as any
      if (!p) continue
      skuSet.add(p.id)
      if (row.quantity < p.min_stock) lowCount++
    }
    setSkuCount(skuSet.size)
    setLowStockCount(lowCount)

    const today = dayjs().format('YYYY-MM-DD')

    // Pending purchases today
    const { data: purchases } = await supabase
      .from('purchases')
      .select('id')
      .eq('warehouse_id', whId)
      .eq('status', 'pending')
      .eq('date', today)
    setPendingPurchases((purchases ?? []).length)

    // Draft sales today
    const { data: sales } = await supabase
      .from('sales')
      .select('id')
      .eq('warehouse_id', whId)
      .eq('status', 'draft')
      .eq('date', today)
    setDraftSales((sales ?? []).length)

    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  if (loading) return <Spin style={{ marginTop: 40, display: 'block', textAlign: 'center' }} />

  if (!warehouseId) {
    return (
      <div style={{ maxWidth: 480, marginTop: 40 }}>
        <Alert
          type="warning"
          message="Склад не назначен"
          description="Обратитесь к администратору для привязки к складу."
          showIcon
        />
      </div>
    )
  }

  return (
    <div>
      <Title level={4} style={{ marginBottom: 4 }}>Дашборд</Title>
      <p style={{ color: '#888', marginBottom: 20 }}>Склад: <strong>{warehouseName}</strong></p>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12}>
          <Card>
            <Statistic
              title="Кол-во SKU"
              value={skuCount}
              suffix="позиций"
              prefix={<ShoppingOutlined />}
              styles={{ content: { color: '#722ed1' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card>
            <Statistic
              title="Требуют пополнения"
              value={lowStockCount}
              suffix="товаров"
              prefix={<WarningOutlined />}
              styles={{ content: { color: lowStockCount > 0 ? '#ff4d4f' : '#52c41a' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card>
            <Statistic
              title="Поставок сегодня"
              value={pendingPurchases}
              suffix="в ожидании"
              prefix={<ImportOutlined />}
              styles={{ content: { color: pendingPurchases > 0 ? '#fa8c16' : '#52c41a' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card>
            <Statistic
              title="Отгрузок сегодня"
              value={draftSales}
              suffix="черновиков"
              prefix={<ExportOutlined />}
              styles={{ content: { color: draftSales > 0 ? '#1677ff' : '#52c41a' } }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
