'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Row, Col, Card, Statistic, Select, Typography, Space, Spin, DatePicker,
} from 'antd'
import {
  DollarOutlined, ShoppingOutlined, WarningOutlined,
  TeamOutlined, BankOutlined, StockOutlined,
} from '@ant-design/icons'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import dayjs, { type Dayjs } from 'dayjs'

const { Title } = Typography
const { RangePicker } = DatePicker

export default function AdminDashboardPage() {
  const supabase = createClient()
  const router = useRouter()

  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()])
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null)
  const [warehouseFilter, setWarehouseFilter] = useState<string[]>([])
  const [owners, setOwners] = useState<{ id: string; label: string }[]>([])
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; owner_id: string }[]>([])

  const [turnover, setTurnover] = useState(0)
  const [potentialMoney, setPotentialMoney] = useState(0)
  const [skuCount, setSkuCount] = useState(0)
  const [costValue, setCostValue] = useState(0)
  const [lowStockCount, setLowStockCount] = useState(0)
  const [workerCount, setWorkerCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const loadMeta = useCallback(async () => {
    const { data: ownerData } = await supabase.from('profiles').select('id, full_name').eq('role', 'owner')
    setOwners((ownerData ?? []).map(o => ({ id: o.id, label: o.full_name ?? o.id })))
    const { data: whData } = await supabase.from('warehouses').select('id, name, owner_id').eq('status', 'active')
    setWarehouses(whData ?? [])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadMeta() }, [loadMeta])

  const visibleWarehouses = ownerFilter
    ? warehouses.filter(w => w.owner_id === ownerFilter)
    : warehouses

  const compute = useCallback(async () => {
    setLoading(true)
    const from = dateRange[0].format('YYYY-MM-DD')
    const to = dateRange[1].format('YYYY-MM-DD')

    const whIds: string[] = warehouseFilter.length > 0
      ? warehouseFilter
      : (ownerFilter ? warehouses.filter(w => w.owner_id === ownerFilter).map(w => w.id) : warehouses.map(w => w.id))

    let salesQ = supabase
      .from('sales')
      .select('total')
      .eq('status', 'completed')
      .gte('date', from)
      .lte('date', to)
    if (whIds.length > 0) salesQ = salesQ.in('warehouse_id', whIds)
    const { data: salesData } = await salesQ
    setTurnover((salesData ?? []).reduce((s, r) => s + r.total, 0))

    let stockQ = supabase
      .from('stock')
      .select('quantity, warehouse_id, products(sell_price, buy_price, min_stock, id)')
    if (whIds.length > 0) stockQ = stockQ.in('warehouse_id', whIds)
    const { data: stockData } = await stockQ

    let potMoney = 0, costVal = 0, lowCount = 0
    const skuSet = new Set<string>()
    for (const row of stockData ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = row.products as any
      if (!p) continue
      skuSet.add(p.id)
      potMoney += row.quantity * p.sell_price
      costVal += row.quantity * p.buy_price
      if (row.quantity < p.min_stock) lowCount++
    }
    setPotentialMoney(potMoney)
    setCostValue(costVal)
    setLowStockCount(lowCount)
    setSkuCount(skuSet.size)

    let wkQ = supabase.from('warehouse_workers').select('worker_id')
    if (whIds.length > 0) wkQ = wkQ.in('warehouse_id', whIds)
    const { data: wkData } = await wkQ
    setWorkerCount(new Set((wkData ?? []).map(w => w.worker_id)).size)

    setLoading(false)
  }, [dateRange, ownerFilter, warehouseFilter, warehouses]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (warehouses.length >= 0) compute() }, [compute]) // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (v: number) => v.toLocaleString('ru-RU')

  const clickableCard = (onClick: () => void) => ({
    style: { cursor: 'pointer' },
    onClick,
    styles: { body: { transition: 'opacity 0.15s' } },
    hoverable: true,
  })

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Дашборд администратора</Title>

      <Space wrap style={{ marginBottom: 20 }}>
        <RangePicker
          format="DD.MM.YYYY"
          value={dateRange}
          onChange={v => { if (v?.[0] && v?.[1]) setDateRange([v[0], v[1]]) }}
          allowClear={false}
        />
        <Select
          placeholder="Все владельцы"
          style={{ width: 200 }}
          options={owners.map(o => ({ value: o.id, label: o.label }))}
          onChange={v => { setOwnerFilter(v ?? null); setWarehouseFilter([]) }}
          allowClear
          showSearch
          optionFilterProp="label"
        />
        <Select
          placeholder="Все склады"
          mode="multiple"
          style={{ minWidth: 200 }}
          options={visibleWarehouses.map(w => ({ value: w.id, label: w.name }))}
          value={warehouseFilter}
          onChange={v => setWarehouseFilter(v)}
          allowClear
        />
      </Space>

      {loading ? (
        <Spin style={{ display: 'block', marginTop: 40, textAlign: 'center' }} />
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={8}>
            <Card {...clickableCard(() => {
              const from = dateRange[0].format('YYYY-MM-DD')
              const to = dateRange[1].format('YYYY-MM-DD')
              const whParam = warehouseFilter.length > 0 ? warehouseFilter.join(',') : ''
              const q = whParam ? `?from=${from}&to=${to}&warehouses=${whParam}` : `?from=${from}&to=${to}`
              router.push(`/admin/finance${q}`)
            })}>
              <Statistic title="Оборот за период" value={turnover} suffix="₸"
                prefix={<DollarOutlined />} styles={{ content: { color: '#1677ff' } }} formatter={v => fmt(Number(v))} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card {...clickableCard(() => router.push('/admin/reports?tab=stock'))}>
              <Statistic title="Потенц. деньги в товаре" value={potentialMoney} suffix="₸"
                prefix={<StockOutlined />} styles={{ content: { color: '#52c41a' } }} formatter={v => fmt(Number(v))} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card {...clickableCard(() => router.push('/admin/reports?tab=stock'))}>
              <Statistic title="Кол-во SKU" value={skuCount} suffix="позиций"
                prefix={<ShoppingOutlined />} styles={{ content: { color: '#722ed1' } }} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card {...clickableCard(() => router.push('/admin/reports?tab=stock'))}>
              <Statistic title="Себестоимость склада" value={costValue} suffix="₸"
                prefix={<BankOutlined />} styles={{ content: { color: '#fa8c16' } }} formatter={v => fmt(Number(v))} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card {...clickableCard(() => router.push('/admin/reports?tab=reorder'))}>
              <Statistic title="Требуют пополнения" value={lowStockCount} suffix="товаров"
                prefix={<WarningOutlined />} styles={{ content: { color: lowStockCount > 0 ? '#ff4d4f' : '#52c41a' } }} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card>
              <Statistic title="Кол-во рабочих" value={workerCount} suffix="чел."
                prefix={<TeamOutlined />} styles={{ content: { color: '#13c2c2' } }} />
            </Card>
          </Col>
        </Row>
      )}
    </div>
  )
}
