'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Table, Button, Tag, Select, Space, DatePicker,
  Typography, Tooltip,
} from 'antd'
import { PlusOutlined, EyeOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import dayjs, { type Dayjs } from 'dayjs'

const { Title } = Typography
const { RangePicker } = DatePicker

type PurchaseStatus = 'pending' | 'received_full' | 'received_partial' | 'cancelled'

interface Purchase {
  id: string
  number: string
  date: string
  warehouse_id: string
  warehouse_name?: string
  supplier_id: string
  supplier_name?: string
  status: PurchaseStatus
  total: number
  item_count?: number
}

interface Props {
  viewerRole: 'admin' | 'owner' | 'worker'
  basePath: string   // e.g. '/admin/purchases'
}

const STATUS_LABELS: Record<PurchaseStatus, string> = {
  pending: 'Ожидается',
  received_full: 'Принят полностью',
  received_partial: 'Принят частично',
  cancelled: 'Отменён',
}

const STATUS_COLORS: Record<PurchaseStatus, string> = {
  pending: 'blue',
  received_full: 'green',
  received_partial: 'gold',
  cancelled: 'red',
}

export default function PurchasesTable({ viewerRole, basePath }: Props) {
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<PurchaseStatus | null>(null)
  const [warehouseFilter, setWarehouseFilter] = useState<string[]>([])
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([])

  const supabase = createClient()
  const router = useRouter()

  const load = useCallback(async () => {
    setLoading(true)

    let query = supabase
      .from('purchases')
      .select('id, number, date, warehouse_id, supplier_id, status, total')
      .order('created_at', { ascending: false })

    if (statusFilter) query = query.eq('status', statusFilter)
    if (warehouseFilter.length > 0) query = query.in('warehouse_id', warehouseFilter)
    if (dateRange) {
      query = query.gte('date', dateRange[0].format('YYYY-MM-DD'))
      query = query.lte('date', dateRange[1].format('YYYY-MM-DD'))
    }

    const { data: pList } = await query

    // Get warehouse names
    const { data: whs } = await supabase.from('warehouses').select('id, name')
    const whMap: Record<string, string> = {}
    for (const w of whs ?? []) { whMap[w.id] = w.name }

    // Get supplier names
    const { data: sups } = await supabase.from('suppliers').select('id, name')
    const supMap: Record<string, string> = {}
    for (const s of sups ?? []) { supMap[s.id] = s.name }

    // Get item counts
    const { data: items } = await supabase
      .from('purchase_items')
      .select('purchase_id')
      .in('purchase_id', (pList ?? []).map(p => p.id))

    const countMap: Record<string, number> = {}
    for (const item of items ?? []) {
      countMap[item.purchase_id] = (countMap[item.purchase_id] ?? 0) + 1
    }

    setWarehouses(whs ?? [])
    setPurchases((pList ?? []).map(p => ({
      ...p,
      warehouse_name: whMap[p.warehouse_id] ?? '—',
      supplier_name: supMap[p.supplier_id] ?? '—',
      item_count: countMap[p.id] ?? 0,
    })))
    setLoading(false)
  }, [statusFilter, warehouseFilter, dateRange]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const isWorker = viewerRole === 'worker'

  const columns: ColumnsType<Purchase> = [
    {
      title: '№ поставки',
      dataIndex: 'number',
      render: (v, record) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => router.push(`${basePath}/${record.id}`)}>
          {v}
        </Button>
      ),
    },
    { title: 'Дата', dataIndex: 'date', render: v => dayjs(v).format('DD.MM.YYYY'), width: 110 },
    ...(!isWorker ? [{ title: 'Склад', dataIndex: 'warehouse_name' as const }] : []),
    { title: 'Поставщик', dataIndex: 'supplier_name' },
    { title: 'Позиций', dataIndex: 'item_count', width: 90 },
    ...(!isWorker ? [{
      title: 'Сумма',
      dataIndex: 'total' as const,
      render: (v: number) => v.toLocaleString('ru-RU') + ' ₸',
    }] : []),
    {
      title: 'Статус',
      dataIndex: 'status',
      render: (v: PurchaseStatus) => (
        <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag>
      ),
    },
    {
      title: '',
      width: 50,
      render: (_, record) => (
        <Tooltip title="Открыть">
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => router.push(`${basePath}/${record.id}`)}
          />
        </Tooltip>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Поставки</Title>
        {!isWorker && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => router.push(`${basePath}/new`)}
          >
            Создать поставку
          </Button>
        )}
      </div>

      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          placeholder="Склад"
          mode="multiple"
          style={{ minWidth: 200 }}
          options={warehouses.map(w => ({ value: w.id, label: w.name }))}
          onChange={v => setWarehouseFilter(v)}
          allowClear
        />
        <Select
          placeholder="Статус"
          style={{ width: 180 }}
          options={[
            { value: 'pending', label: 'Ожидается' },
            { value: 'received_full', label: 'Принят полностью' },
            { value: 'received_partial', label: 'Принят частично' },
            { value: 'cancelled', label: 'Отменён' },
          ]}
          onChange={v => setStatusFilter(v ?? null)}
          allowClear
        />
        <RangePicker
          format="DD.MM.YYYY"
          onChange={v => setDateRange(v as [Dayjs, Dayjs] | null)}
        />
      </Space>

      <Table
        columns={columns}
        dataSource={purchases}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20, showTotal: total => `Всего: ${total}` }}
        size="middle"
        onRow={record => ({
          style: { cursor: 'pointer' },
          onClick: () => router.push(`${basePath}/${record.id}`),
        })}
      />
    </div>
  )
}
