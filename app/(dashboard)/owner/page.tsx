'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Row, Col, Card, Statistic, Select, Segmented, Typography, Space, Spin,
} from 'antd'
import {
  DollarOutlined, ShoppingOutlined, WarningOutlined,
  TeamOutlined, BankOutlined, StockOutlined,
} from '@ant-design/icons'
import { createClient } from '@/lib/supabase/client'
import dayjs from 'dayjs'

const { Title } = Typography

type Period = 'today' | 'week' | 'month' | 'quarter'

function getPeriodRange(period: Period): [string, string] {
  const now = dayjs()
  switch (period) {
    case 'today': return [now.format('YYYY-MM-DD'), now.format('YYYY-MM-DD')]
    case 'week': return [now.startOf('week').format('YYYY-MM-DD'), now.endOf('week').format('YYYY-MM-DD')]
    case 'month': return [now.startOf('month').format('YYYY-MM-DD'), now.endOf('month').format('YYYY-MM-DD')]
    case 'quarter': return [now.startOf('month').subtract(2, 'month').format('YYYY-MM-DD'), now.endOf('month').format('YYYY-MM-DD')]
  }
}

export default function OwnerDashboardPage() {
  const supabase = createClient()

  const [period, setPeriod] = useState<Period>('month')
  const [warehouseFilter, setWarehouseFilter] = useState<string[]>([])
  const [myWarehouses, setMyWarehouses] = useState<{ id: string; name: string }[]>([])

  const [turnover, setTurnover] = useState(0)
  const [potentialMoney, setPotentialMoney] = useState(0)
  const [skuCount, setSkuCount] = useState(0)
  const [costValue, setCostValue] = useState(0)
  const [lowStockCount, setLowStockCount] = useState(0)
  const [workerCount, setWorkerCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const loadMyWarehouses = useCallback(async () => {
    const { data } = await supabase.from('warehouses').select('id, name').eq('status', 'active')
    setMyWarehouses(data ?? [])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadMyWarehouses() }, [loadMyWarehouses])

  const compute = useCallback(async () => {
    setLoading(true)
    const [from, to] = getPeriodRange(period)
    const whIds = warehouseFilter.length > 0 ? warehouseFilter : myWarehouses.map(w => w.id)
    if (whIds.length === 0) { setLoading(false); return }

    const { data: salesData } = await supabase
      .from('sales')
      .select('total')
      .eq('status', 'completed')
      .gte('date', from)
      .lte('date', to)
      .in('warehouse_id', whIds)
    setTurnover((salesData ?? []).reduce((s, r) => s + r.total, 0))

    const { data: stockData } = await supabase
      .from('stock')
      .select('quantity, products(sell_price, buy_price, min_stock, id)')
      .in('warehouse_id', whIds)

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

    const { data: wkData } = await supabase
      .from('warehouse_workers')
      .select('worker_id')
      .in('warehouse_id', whIds)
    setWorkerCount(new Set((wkData ?? []).map(w => w.worker_id)).size)

    setLoading(false)
  }, [period, warehouseFilter, myWarehouses]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (myWarehouses.length >= 0) compute() }, [compute]) // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (v: number) => v.toLocaleString('ru-RU')

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Дашборд</Title>

      <Space wrap style={{ marginBottom: 20 }}>
        <Segmented
          options={[
            { label: 'Сегодня', value: 'today' },
            { label: 'Неделя', value: 'week' },
            { label: 'Месяц', value: 'month' },
            { label: 'Квартал', value: 'quarter' },
          ]}
          value={period}
          onChange={v => setPeriod(v as Period)}
        />
        <Select
          placeholder="Все мои склады"
          mode="multiple"
          style={{ minWidth: 220 }}
          options={myWarehouses.map(w => ({ value: w.id, label: w.name }))}
          onChange={v => setWarehouseFilter(v)}
          allowClear
        />
      </Space>

      {loading ? (
        <Spin style={{ display: 'block', marginTop: 40, textAlign: 'center' }} />
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={8}>
            <Card>
              <Statistic title="Оборот за период" value={turnover} suffix="₸"
                prefix={<DollarOutlined />} styles={{ content: { color: '#1677ff' } }} formatter={v => fmt(Number(v))} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card>
              <Statistic title="Потенц. деньги в товаре" value={potentialMoney} suffix="₸"
                prefix={<StockOutlined />} styles={{ content: { color: '#52c41a' } }} formatter={v => fmt(Number(v))} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card>
              <Statistic title="Кол-во SKU" value={skuCount} suffix="позиций"
                prefix={<ShoppingOutlined />} styles={{ content: { color: '#722ed1' } }} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card>
              <Statistic title="Себестоимость склада" value={costValue} suffix="₸"
                prefix={<BankOutlined />} styles={{ content: { color: '#fa8c16' } }} formatter={v => fmt(Number(v))} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card>
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
