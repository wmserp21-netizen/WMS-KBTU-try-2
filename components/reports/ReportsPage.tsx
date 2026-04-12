'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  Card, Button, Select, DatePicker, Space, Table, Typography,
  Tabs, Tag, Row, Col, Statistic,
} from 'antd'
import {
  FileExcelOutlined, DownloadOutlined, ReloadOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { createClient } from '@/lib/supabase/client'
import dayjs, { type Dayjs } from 'dayjs'

const { Title, Text } = Typography
const { RangePicker } = DatePicker

interface Warehouse { id: string; name: string }

// ── Stock row ──────────────────────────────────────────────
interface StockRow {
  key: string
  product: string
  sku: string
  warehouse: string
  qty: number
  minStock: number
  buyPrice: number
  sellPrice: number
  costValue: number
  status: 'ok' | 'low' | 'zero'
}

// ── Movement row ───────────────────────────────────────────
interface MovementRow {
  key: string
  date: string
  type: 'purchase' | 'sale' | 'return'
  docNumber: string
  product: string
  warehouse: string
  qty: number
  price: number
  total: number
}

// ── Reorder row ────────────────────────────────────────────
interface ReorderRow {
  key: string
  product: string
  sku: string
  warehouse: string
  qty: number
  minStock: number
  deficit: number
  buyPrice: number
  reorderCost: number
}

interface Props {
  viewerRole: 'admin' | 'owner'
  ownerIds?: string[]   // admin only: list of owners to show in filter
  defaultTab?: string
}

export default function ReportsPage({ viewerRole, ownerIds, defaultTab }: Props) {
  const supabase = createClient()

  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [warehouseFilter, setWarehouseFilter] = useState<string[]>([])
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ])
  const [loading, setLoading] = useState(false)

  const [stockRows, setStockRows] = useState<StockRow[]>([])
  const [movementRows, setMovementRows] = useState<MovementRow[]>([])
  const [reorderRows, setReorderRows] = useState<ReorderRow[]>([])

  useEffect(() => {
    supabase.from('warehouses').select('id, name').eq('status', 'active').then(({ data }) => {
      setWarehouses(data ?? [])
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stock report ──────────────────────────────────────────
  const loadStock = useCallback(async (whIds: string[]) => {
    let q = supabase
      .from('stock')
      .select('quantity, warehouse_id, warehouses(name), products(id, name, sku, buy_price, sell_price, min_stock)')
    if (whIds.length > 0) q = q.in('warehouse_id', whIds)
    const { data } = await q

    const rows: StockRow[] = (data ?? []).map((r, i) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = r.products as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = r.warehouses as any
      const qty = r.quantity
      const min = p?.min_stock ?? 0
      return {
        key: String(i),
        product: p?.name ?? '—',
        sku: p?.sku ?? '—',
        warehouse: w?.name ?? '—',
        qty,
        minStock: min,
        buyPrice: p?.buy_price ?? 0,
        sellPrice: p?.sell_price ?? 0,
        costValue: qty * (p?.buy_price ?? 0),
        status: qty === 0 ? 'zero' : qty < min ? 'low' : 'ok',
      }
    })
    setStockRows(rows)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Movement report ───────────────────────────────────────
  const loadMovement = useCallback(async (whIds: string[], from: string, to: string) => {
    const rows: MovementRow[] = []

    // Purchases
    let pq = supabase
      .from('purchases')
      .select('id, number, date, warehouse_id, warehouses(name), purchase_items(qty_expected, buy_price, products(name))')
      .in('status', ['received_full', 'received_partial'])
      .gte('date', from).lte('date', to)
    if (whIds.length > 0) pq = pq.in('warehouse_id', whIds)
    const { data: pData } = await pq
    for (const pur of pData ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wh = (pur.warehouses as any)?.name ?? '—'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const item of (pur.purchase_items as any[]) ?? []) {
        rows.push({
          key: `p-${pur.id}-${rows.length}`,
          date: pur.date,
          type: 'purchase',
          docNumber: pur.number ?? '—',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          product: (item.products as any)?.name ?? '—',
          warehouse: wh,
          qty: item.qty_expected,
          price: item.buy_price,
          total: item.qty_expected * item.buy_price,
        })
      }
    }

    // Sales
    let sq = supabase
      .from('sales')
      .select('id, number, date, warehouse_id, warehouses(name), sale_items(qty, sell_price, products(name))')
      .eq('status', 'completed')
      .gte('date', from).lte('date', to)
    if (whIds.length > 0) sq = sq.in('warehouse_id', whIds)
    const { data: sData } = await sq
    for (const sale of sData ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wh = (sale.warehouses as any)?.name ?? '—'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const item of (sale.sale_items as any[]) ?? []) {
        rows.push({
          key: `s-${sale.id}-${rows.length}`,
          date: sale.date,
          type: 'sale',
          docNumber: sale.number ?? '—',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          product: (item.products as any)?.name ?? '—',
          warehouse: wh,
          qty: item.qty,
          price: item.sell_price,
          total: item.qty * item.sell_price,
        })
      }
    }

    // Returns
    let rq = supabase
      .from('returns')
      .select('id, number, date, warehouse_id, warehouses(name), return_items(qty, sell_price, products(name))')
      .eq('status', 'completed')
      .gte('date', from).lte('date', to)
    if (whIds.length > 0) rq = rq.in('warehouse_id', whIds)
    const { data: rData } = await rq
    for (const ret of rData ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wh = (ret.warehouses as any)?.name ?? '—'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const item of (ret.return_items as any[]) ?? []) {
        rows.push({
          key: `r-${ret.id}-${rows.length}`,
          date: ret.date,
          type: 'return',
          docNumber: ret.number ?? '—',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          product: (item.products as any)?.name ?? '—',
          warehouse: wh,
          qty: item.qty,
          price: item.sell_price,
          total: item.qty * item.sell_price,
        })
      }
    }

    rows.sort((a, b) => a.date.localeCompare(b.date))
    setMovementRows(rows)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reorder report ────────────────────────────────────────
  const loadReorder = useCallback(async (whIds: string[]) => {
    let q = supabase
      .from('stock')
      .select('quantity, warehouse_id, warehouses(name), products(id, name, sku, buy_price, min_stock)')
    if (whIds.length > 0) q = q.in('warehouse_id', whIds)
    const { data } = await q

    const rows: ReorderRow[] = []
    for (const r of data ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = r.products as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = r.warehouses as any
      const qty = r.quantity
      const min = p?.min_stock ?? 0
      if (qty < min) {
        const deficit = min - qty
        rows.push({
          key: `${r.warehouse_id}-${p?.id}`,
          product: p?.name ?? '—',
          sku: p?.sku ?? '—',
          warehouse: w?.name ?? '—',
          qty,
          minStock: min,
          deficit,
          buyPrice: p?.buy_price ?? 0,
          reorderCost: deficit * (p?.buy_price ?? 0),
        })
      }
    }
    rows.sort((a, b) => b.deficit - a.deficit)
    setReorderRows(rows)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    setLoading(true)
    const whIds = warehouseFilter
    const from = dateRange[0].format('YYYY-MM-DD')
    const to = dateRange[1].format('YYYY-MM-DD')
    await Promise.all([
      loadStock(whIds),
      loadMovement(whIds, from, to),
      loadReorder(whIds),
    ])
    setLoading(false)
  }, [warehouseFilter, dateRange, loadStock, loadMovement, loadReorder])

  useEffect(() => { load() }, [load])

  // ── Excel export ──────────────────────────────────────────
  const exportExcel = async (type: 'stock' | 'movement' | 'reorder') => {
    const { utils, writeFile } = await import('xlsx')

    if (type === 'stock') {
      const ws = utils.json_to_sheet(stockRows.map(r => ({
        'Товар': r.product,
        'Артикул': r.sku,
        'Склад': r.warehouse,
        'Остаток': r.qty,
        'Мин. остаток': r.minStock,
        'Цена закупки': r.buyPrice,
        'Цена продажи': r.sellPrice,
        'Себестоимость остатка': r.costValue,
        'Статус': r.status === 'ok' ? 'В норме' : r.status === 'low' ? 'Мало' : 'Нет',
      })))
      const wb = utils.book_new()
      utils.book_append_sheet(wb, ws, 'Остатки')
      writeFile(wb, `Остатки_${dayjs().format('YYYYMMDD')}.xlsx`)
    }

    if (type === 'movement') {
      const ws = utils.json_to_sheet(movementRows.map(r => ({
        'Дата': r.date,
        'Тип': r.type === 'purchase' ? 'Закуп' : r.type === 'sale' ? 'Продажа' : 'Возврат',
        'Документ': r.docNumber,
        'Товар': r.product,
        'Склад': r.warehouse,
        'Кол-во': r.qty,
        'Цена': r.price,
        'Сумма': r.total,
      })))
      const wb = utils.book_new()
      utils.book_append_sheet(wb, ws, 'Движение')
      writeFile(wb, `Движение_${dayjs().format('YYYYMMDD')}.xlsx`)
    }

    if (type === 'reorder') {
      const ws = utils.json_to_sheet(reorderRows.map(r => ({
        'Товар': r.product,
        'Артикул': r.sku,
        'Склад': r.warehouse,
        'Остаток': r.qty,
        'Мин. остаток': r.minStock,
        'Дефицит': r.deficit,
        'Цена закупки': r.buyPrice,
        'Стоимость пополнения': r.reorderCost,
      })))
      const wb = utils.book_new()
      utils.book_append_sheet(wb, ws, 'Пополнение')
      writeFile(wb, `Пополнение_${dayjs().format('YYYYMMDD')}.xlsx`)
    }
  }

  // ── Columns ───────────────────────────────────────────────
  const stockCols: ColumnsType<StockRow> = [
    { title: 'Товар', dataIndex: 'product', ellipsis: true },
    { title: 'Арт.', dataIndex: 'sku', width: 110 },
    { title: 'Склад', dataIndex: 'warehouse', width: 160, ellipsis: true },
    { title: 'Остаток', dataIndex: 'qty', width: 90, align: 'right' },
    { title: 'Мин.', dataIndex: 'minStock', width: 70, align: 'right' },
    {
      title: 'Статус', dataIndex: 'status', width: 90,
      render: (v) => v === 'ok'
        ? <Tag color="success">В норме</Tag>
        : v === 'low'
          ? <Tag color="warning">Мало</Tag>
          : <Tag color="error">Нет</Tag>,
    },
    {
      title: 'Себест.', dataIndex: 'costValue', width: 120, align: 'right',
      render: v => v.toLocaleString('ru-RU') + ' ₸',
    },
  ]

  const moveCols: ColumnsType<MovementRow> = [
    { title: 'Дата', dataIndex: 'date', width: 100 },
    {
      title: 'Тип', dataIndex: 'type', width: 90,
      render: v => v === 'purchase'
        ? <Tag color="blue">Закуп</Tag>
        : v === 'sale'
          ? <Tag color="green">Продажа</Tag>
          : <Tag color="orange">Возврат</Tag>,
    },
    { title: 'Документ', dataIndex: 'docNumber', width: 130 },
    { title: 'Товар', dataIndex: 'product', ellipsis: true },
    { title: 'Склад', dataIndex: 'warehouse', width: 150, ellipsis: true },
    { title: 'Кол-во', dataIndex: 'qty', width: 80, align: 'right' },
    {
      title: 'Сумма', dataIndex: 'total', width: 120, align: 'right',
      render: v => v.toLocaleString('ru-RU') + ' ₸',
    },
  ]

  const reorderCols: ColumnsType<ReorderRow> = [
    { title: 'Товар', dataIndex: 'product', ellipsis: true },
    { title: 'Арт.', dataIndex: 'sku', width: 110 },
    { title: 'Склад', dataIndex: 'warehouse', width: 160, ellipsis: true },
    { title: 'Остаток', dataIndex: 'qty', width: 90, align: 'right' },
    { title: 'Мин.', dataIndex: 'minStock', width: 70, align: 'right' },
    { title: 'Дефицит', dataIndex: 'deficit', width: 90, align: 'right', render: v => <Text type="danger">{v}</Text> },
    {
      title: 'Стоимость пополнения', dataIndex: 'reorderCost', width: 170, align: 'right',
      render: v => v.toLocaleString('ru-RU') + ' ₸',
    },
  ]

  const totalReorderCost = reorderRows.reduce((s, r) => s + r.reorderCost, 0)

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Отчёты</Title>

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
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          Обновить
        </Button>
      </Space>

      <Tabs
        defaultActiveKey={defaultTab ?? 'stock'}
        items={[
          {
            key: 'stock',
            label: 'Остатки',
            children: (
              <Card
                extra={
                  <Button
                    icon={<FileExcelOutlined />}
                    onClick={() => exportExcel('stock')}
                    disabled={stockRows.length === 0}
                  >
                    Excel
                  </Button>
                }
              >
                <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                  <Col xs={12} sm={6}>
                    <Statistic title="Всего позиций" value={stockRows.length} />
                  </Col>
                  <Col xs={12} sm={6}>
                    <Statistic
                      title="В норме"
                      value={stockRows.filter(r => r.status === 'ok').length}
                      styles={{ content: { color: '#52c41a' } }}
                    />
                  </Col>
                  <Col xs={12} sm={6}>
                    <Statistic
                      title="Мало / Нет"
                      value={stockRows.filter(r => r.status !== 'ok').length}
                      styles={{ content: { color: '#ff4d4f' } }}
                    />
                  </Col>
                  <Col xs={12} sm={6}>
                    <Statistic
                      title="Общая себестоимость"
                      value={stockRows.reduce((s, r) => s + r.costValue, 0)}
                      suffix="₸"
                      formatter={v => Number(v).toLocaleString('ru-RU')}
                    />
                  </Col>
                </Row>
                <Table
                  columns={stockCols}
                  dataSource={stockRows}
                  loading={loading}
                  size="small"
                  pagination={{ pageSize: 50, showSizeChanger: true }}
                  locale={{ emptyText: 'Нет данных' }}
                  scroll={{ x: 700 }}
                />
              </Card>
            ),
          },
          {
            key: 'movement',
            label: 'Движение товара',
            children: (
              <Card
                extra={
                  <Button
                    icon={<FileExcelOutlined />}
                    onClick={() => exportExcel('movement')}
                    disabled={movementRows.length === 0}
                  >
                    Excel
                  </Button>
                }
              >
                <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                  <Col xs={12} sm={8}>
                    <Statistic
                      title="Закуп (строк)"
                      value={movementRows.filter(r => r.type === 'purchase').length}
                      styles={{ content: { color: '#1677ff' } }}
                    />
                  </Col>
                  <Col xs={12} sm={8}>
                    <Statistic
                      title="Продажи (строк)"
                      value={movementRows.filter(r => r.type === 'sale').length}
                      styles={{ content: { color: '#52c41a' } }}
                    />
                  </Col>
                  <Col xs={12} sm={8}>
                    <Statistic
                      title="Возвраты (строк)"
                      value={movementRows.filter(r => r.type === 'return').length}
                      styles={{ content: { color: '#fa8c16' } }}
                    />
                  </Col>
                </Row>
                <Table
                  columns={moveCols}
                  dataSource={movementRows}
                  loading={loading}
                  size="small"
                  pagination={{ pageSize: 50, showSizeChanger: true }}
                  locale={{ emptyText: 'Нет данных за выбранный период' }}
                  scroll={{ x: 800 }}
                />
              </Card>
            ),
          },
          {
            key: 'reorder',
            label: `Пополнение${reorderRows.length > 0 ? ` (${reorderRows.length})` : ''}`,
            children: (
              <Card
                extra={
                  <Space>
                    {reorderRows.length > 0 && (
                      <Text type="danger">
                        Требуется: {totalReorderCost.toLocaleString('ru-RU')} ₸
                      </Text>
                    )}
                    <Button
                      icon={<DownloadOutlined />}
                      onClick={() => exportExcel('reorder')}
                      disabled={reorderRows.length === 0}
                    >
                      Excel
                    </Button>
                  </Space>
                }
              >
                <Table
                  columns={reorderCols}
                  dataSource={reorderRows}
                  loading={loading}
                  size="small"
                  pagination={{ pageSize: 50, showSizeChanger: true }}
                  locale={{ emptyText: 'Всё в норме — пополнение не требуется' }}
                  scroll={{ x: 750 }}
                />
              </Card>
            ),
          },
        ]}
      />
    </div>
  )
}
