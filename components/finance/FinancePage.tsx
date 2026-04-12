'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Row, Col, Card, Statistic, Select, DatePicker,
  Button, Typography, Table, Space, Divider,
} from 'antd'
import {
  DollarOutlined, RiseOutlined, FallOutlined,
  ShoppingCartOutlined, RollbackOutlined, LineChartOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { createClient } from '@/lib/supabase/client'
import dayjs, { type Dayjs } from 'dayjs'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, Legend, ResponsiveContainer,
} from 'recharts'

const { Title, Text } = Typography
const { RangePicker } = DatePicker

interface Warehouse { id: string; name: string }

interface ChartPoint {
  date: string
  revenue: number
  profit: number
}

interface TopProduct {
  name: string
  qty: number
  revenue: number
  share: number
}

interface Props {
  viewerRole: 'admin' | 'owner'
  initialDateRange?: [string, string]   // 'YYYY-MM-DD'
  initialWarehouses?: string[]          // warehouse ids
}

export default function FinancePage({ viewerRole, initialDateRange, initialWarehouses }: Props) {
  const supabase = createClient()

  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [warehouseFilter, setWarehouseFilter] = useState<string[]>(initialWarehouses ?? [])
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>(
    initialDateRange
      ? [dayjs(initialDateRange[0]), dayjs(initialDateRange[1])]
      : [dayjs().startOf('month'), dayjs().endOf('month')]
  )

  // Metrics
  const [revenue, setRevenue] = useState(0)
  const [cogs, setCogs] = useState(0)      // cost of goods sold (себестоимость продаж)
  const [purchasesTotal, setPurchasesTotal] = useState(0)
  const [returnsTotal, setReturnsTotal] = useState(0)

  const [chartData, setChartData] = useState<ChartPoint[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [loading, setLoading] = useState(false)

  const loadWarehouses = useCallback(async () => {
    const { data } = await supabase.from('warehouses').select('id, name').eq('status', 'active')
    setWarehouses(data ?? [])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadWarehouses() }, [loadWarehouses])

  const compute = useCallback(async () => {
    setLoading(true)
    const from = dateRange[0].format('YYYY-MM-DD')
    const to = dateRange[1].format('YYYY-MM-DD')

    // ─── Completed sales in period ───
    let salesQuery = supabase
      .from('sales')
      .select('id, total, date, warehouse_id')
      .eq('status', 'completed')
      .gte('date', from)
      .lte('date', to)

    if (warehouseFilter.length > 0) salesQuery = salesQuery.in('warehouse_id', warehouseFilter)
    const { data: salesData } = await salesQuery

    const saleIds = (salesData ?? []).map(s => s.id)

    // ─── Revenue from sale_items ───
    let totalRevenue = 0
    let saleItemsData: { product_id: string; qty: number; sell_price: number; sale_id: string }[] = []
    if (saleIds.length > 0) {
      const { data: si } = await supabase
        .from('sale_items')
        .select('product_id, qty, sell_price, sale_id')
        .in('sale_id', saleIds)
      saleItemsData = si ?? []
      totalRevenue = saleItemsData.reduce((s, i) => s + i.qty * i.sell_price, 0)
    }
    setRevenue(totalRevenue)

    // ─── COGS: use buy_price from last received purchase_item per product/warehouse ───
    // Simplified: use the latest buy_price from purchase_items for each product
    let totalCogs = 0
    if (saleItemsData.length > 0) {
      const productIds = [...new Set(saleItemsData.map(i => i.product_id))]
      const { data: pi } = await supabase
        .from('purchase_items')
        .select('product_id, buy_price, purchases(warehouse_id, status)')
        .in('product_id', productIds)
        .eq('purchases.status', 'received_full')

      // latest buy_price per product
      const buyPriceMap: Record<string, number> = {}
      for (const p of pi ?? []) {
        buyPriceMap[p.product_id] = p.buy_price
      }

      totalCogs = saleItemsData.reduce((s, i) => {
        const bp = buyPriceMap[i.product_id] ?? 0
        return s + i.qty * bp
      }, 0)
    }
    setCogs(totalCogs)

    // ─── Purchases total in period ───
    let purchasesQuery = supabase
      .from('purchases')
      .select('total, warehouse_id')
      .in('status', ['received_full', 'received_partial'])
      .gte('date', from)
      .lte('date', to)
    if (warehouseFilter.length > 0) purchasesQuery = purchasesQuery.in('warehouse_id', warehouseFilter)
    const { data: pData } = await purchasesQuery
    setPurchasesTotal((pData ?? []).reduce((s, p) => s + p.total, 0))

    // ─── Returns total in period ───
    let returnsQuery = supabase
      .from('returns')
      .select('total, warehouse_id')
      .eq('status', 'completed')
      .gte('date', from)
      .lte('date', to)
    if (warehouseFilter.length > 0) returnsQuery = returnsQuery.in('warehouse_id', warehouseFilter)
    const { data: rData } = await returnsQuery
    setReturnsTotal((rData ?? []).reduce((s, r) => s + r.total, 0))

    // ─── Chart: daily revenue & profit ───
    const dailyMap: Record<string, { revenue: number; cogs: number }> = {}
    const saleMap: Record<string, string> = {}
    for (const s of salesData ?? []) saleMap[s.id] = s.date

    // Build buy price map for chart too
    const productIds2 = [...new Set(saleItemsData.map(i => i.product_id))]
    const { data: pi2 } = await supabase
      .from('purchase_items')
      .select('product_id, buy_price')
      .in('product_id', productIds2.length > 0 ? productIds2 : ['00000000-0000-0000-0000-000000000000'])
    const buyPriceMap2: Record<string, number> = {}
    for (const p of pi2 ?? []) buyPriceMap2[p.product_id] = p.buy_price

    for (const item of saleItemsData) {
      const date = saleMap[item.sale_id]
      if (!date) continue
      if (!dailyMap[date]) dailyMap[date] = { revenue: 0, cogs: 0 }
      dailyMap[date].revenue += item.qty * item.sell_price
      dailyMap[date].cogs += item.qty * (buyPriceMap2[item.product_id] ?? 0)
    }

    // Fill all days in range
    const points: ChartPoint[] = []
    let cur = dateRange[0].clone()
    while (cur.isBefore(dateRange[1]) || cur.isSame(dateRange[1], 'day')) {
      const key = cur.format('YYYY-MM-DD')
      const d = dailyMap[key] ?? { revenue: 0, cogs: 0 }
      points.push({
        date: cur.format('DD.MM'),
        revenue: Math.round(d.revenue),
        profit: Math.round(d.revenue - d.cogs),
      })
      cur = cur.add(1, 'day')
    }
    setChartData(points)

    // ─── Top-10 products ───
    const productRevMap: Record<string, { name: string; qty: number; revenue: number }> = {}
    const productIds3 = [...new Set(saleItemsData.map(i => i.product_id))]
    let productNames: Record<string, string> = {}
    if (productIds3.length > 0) {
      const { data: prods } = await supabase
        .from('products')
        .select('id, name')
        .in('id', productIds3)
      for (const p of prods ?? []) productNames[p.id] = p.name
    }

    for (const item of saleItemsData) {
      if (!productRevMap[item.product_id]) {
        productRevMap[item.product_id] = { name: productNames[item.product_id] ?? '—', qty: 0, revenue: 0 }
      }
      productRevMap[item.product_id].qty += item.qty
      productRevMap[item.product_id].revenue += item.qty * item.sell_price
    }

    const sorted = Object.values(productRevMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10)
    const totalRev = sorted.reduce((s, p) => s + p.revenue, 0)
    setTopProducts(sorted.map(p => ({
      ...p,
      share: totalRev > 0 ? Math.round((p.revenue / totalRev) * 100) : 0,
    })))

    setLoading(false)
  }, [dateRange, warehouseFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { compute() }, [compute])

  const grossProfit = revenue - cogs
  const netRevenue = revenue - returnsTotal

  const topCols: ColumnsType<TopProduct> = [
    { title: 'Товар', dataIndex: 'name' },
    { title: 'Кол-во продано', dataIndex: 'qty', width: 140 },
    {
      title: 'Выручка',
      dataIndex: 'revenue',
      render: v => v.toLocaleString('ru-RU') + ' ₸',
    },
    {
      title: 'Доля',
      dataIndex: 'share',
      width: 80,
      render: v => `${v}%`,
    },
  ]

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Финансы</Title>

      {/* Filters */}
      <Space wrap style={{ marginBottom: 20 }}>
        <RangePicker
          value={dateRange}
          format="DD.MM.YYYY"
          onChange={v => v && setDateRange(v as [Dayjs, Dayjs])}
          allowClear={false}
        />
        <Select
          placeholder="Все склады"
          mode="multiple"
          style={{ minWidth: 220 }}
          options={warehouses.map(w => ({ value: w.id, label: w.name }))}
          onChange={v => setWarehouseFilter(v)}
          allowClear
        />
        <Button type="primary" onClick={compute} loading={loading}>
          Применить
        </Button>
      </Space>

      {/* Stat cards row 1 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Выручка"
              value={revenue}
              suffix="₸"
              precision={0}
              styles={{ content: { color: '#1677ff' } }}
              prefix={<DollarOutlined />}
              formatter={v => Number(v).toLocaleString('ru-RU')}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Себестоимость продаж"
              value={cogs}
              suffix="₸"
              precision={0}
              styles={{ content: { color: '#fa8c16' } }}
              prefix={<ShoppingCartOutlined />}
              formatter={v => Number(v).toLocaleString('ru-RU')}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Валовая прибыль"
              value={grossProfit}
              suffix="₸"
              precision={0}
              styles={{ content: { color: grossProfit >= 0 ? '#52c41a' : '#ff4d4f' } }}
              prefix={<RiseOutlined />}
              formatter={v => Number(v).toLocaleString('ru-RU')}
            />
          </Card>
        </Col>
      </Row>

      {/* Stat cards row 2 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Сумма закупок"
              value={purchasesTotal}
              suffix="₸"
              precision={0}
              styles={{ content: { color: '#722ed1' } }}
              prefix={<LineChartOutlined />}
              formatter={v => Number(v).toLocaleString('ru-RU')}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Сумма возвратов"
              value={returnsTotal}
              suffix="₸"
              precision={0}
              styles={{ content: { color: '#ff4d4f' } }}
              prefix={<RollbackOutlined />}
              formatter={v => Number(v).toLocaleString('ru-RU')}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Чистая выручка"
              value={netRevenue}
              suffix="₸"
              precision={0}
              styles={{ content: { color: netRevenue >= 0 ? '#52c41a' : '#ff4d4f' } }}
              prefix={<FallOutlined />}
              formatter={v => Number(v).toLocaleString('ru-RU')}
            />
          </Card>
        </Col>
      </Row>

      {/* Chart */}
      <Card style={{ marginBottom: 24 }}>
        <Text strong style={{ display: 'block', marginBottom: 16 }}>
          Выручка и прибыль по дням
        </Text>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                interval={chartData.length > 14 ? Math.floor(chartData.length / 14) : 0}
              />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v / 1000).toFixed(0) + 'k'} />
              <ReTooltip formatter={(v) => (Number(v) || 0).toLocaleString('ru-RU') + ' ₸'} />
              <Legend />
              <Line type="monotone" dataKey="revenue" name="Выручка" stroke="#1677ff" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="profit" name="Прибыль" stroke="#52c41a" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>
            Нет данных за выбранный период
          </div>
        )}
      </Card>

      {/* Top-10 */}
      <Card>
        <Text strong style={{ display: 'block', marginBottom: 12 }}>Топ-10 товаров по выручке</Text>
        <Table
          columns={topCols}
          dataSource={topProducts}
          rowKey="name"
          pagination={false}
          size="small"
          locale={{ emptyText: 'Нет данных' }}
        />
      </Card>
    </div>
  )
}
