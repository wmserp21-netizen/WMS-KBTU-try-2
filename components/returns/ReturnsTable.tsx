'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Table, Button, Tag, Select, Space, DatePicker, Typography, Tooltip,
} from 'antd'
import { PlusOutlined, EyeOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import dayjs, { type Dayjs } from 'dayjs'

const { Title } = Typography
const { RangePicker } = DatePicker

type ReturnStatus = 'draft' | 'completed' | 'cancelled'

interface ReturnRow {
  id: string
  number: string
  date: string
  warehouse_id: string
  warehouse_name?: string
  sale_id: string
  sale_number?: string
  status: ReturnStatus
  total: number
  item_count?: number
}

interface Props {
  viewerRole: 'admin' | 'owner' | 'worker'
  basePath: string
}

const STATUS_LABELS: Record<ReturnStatus, string> = {
  draft: 'Черновик',
  completed: 'Проведён',
  cancelled: 'Отменён',
}
const STATUS_COLORS: Record<ReturnStatus, string> = {
  draft: 'blue',
  completed: 'green',
  cancelled: 'red',
}

export default function ReturnsTable({ viewerRole, basePath }: Props) {
  const [returns, setReturns] = useState<ReturnRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<ReturnStatus | null>(null)
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([])
  const [warehouseFilter, setWarehouseFilter] = useState<string[]>([])

  const supabase = createClient()
  const router = useRouter()

  const load = useCallback(async () => {
    setLoading(true)

    let query = supabase
      .from('returns')
      .select('id, number, date, warehouse_id, sale_id, status, total')
      .order('created_at', { ascending: false })

    if (statusFilter) query = query.eq('status', statusFilter)
    if (warehouseFilter.length > 0) query = query.in('warehouse_id', warehouseFilter)
    if (dateRange) {
      query = query.gte('date', dateRange[0].format('YYYY-MM-DD'))
      query = query.lte('date', dateRange[1].format('YYYY-MM-DD'))
    }

    const { data: rList } = await query

    const { data: whs } = await supabase.from('warehouses').select('id, name')
    const whMap: Record<string, string> = {}
    for (const w of whs ?? []) whMap[w.id] = w.name

    const returnIds = (rList ?? []).map(r => r.id)
    const saleIds = (rList ?? []).map(r => r.sale_id)

    const { data: salesData } = saleIds.length > 0
      ? await supabase.from('sales').select('id, number').in('id', saleIds)
      : { data: [] }
    const saleMap: Record<string, string> = {}
    for (const s of salesData ?? []) saleMap[s.id] = s.number

    const { data: items } = returnIds.length > 0
      ? await supabase.from('return_items').select('return_id').in('return_id', returnIds)
      : { data: [] }
    const countMap: Record<string, number> = {}
    for (const item of items ?? []) {
      countMap[item.return_id] = (countMap[item.return_id] ?? 0) + 1
    }

    setWarehouses(whs ?? [])
    setReturns((rList ?? []).map(r => ({
      ...r,
      warehouse_name: whMap[r.warehouse_id] ?? '—',
      sale_number: saleMap[r.sale_id] ?? '—',
      item_count: countMap[r.id] ?? 0,
    })))
    setLoading(false)
  }, [statusFilter, warehouseFilter, dateRange]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const isWorker = viewerRole === 'worker'

  const columns: ColumnsType<ReturnRow> = [
    {
      title: '№ возврата',
      dataIndex: 'number',
      render: (v, record) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => router.push(`${basePath}/${record.id}`)}>
          {v}
        </Button>
      ),
    },
    { title: 'Дата', dataIndex: 'date', render: v => dayjs(v).format('DD.MM.YYYY'), width: 110 },
    ...(!isWorker ? [{ title: 'Склад', dataIndex: 'warehouse_name' as const }] : []),
    { title: '№ продажи', dataIndex: 'sale_number' },
    { title: 'Позиций', dataIndex: 'item_count', width: 90 },
    ...(!isWorker ? [{
      title: 'Сумма',
      dataIndex: 'total' as const,
      render: (v: number) => v.toLocaleString('ru-RU') + ' ₸',
    }] : []),
    {
      title: 'Статус',
      dataIndex: 'status',
      render: (v: ReturnStatus) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag>,
    },
    {
      title: '',
      width: 50,
      render: (_, record) => (
        <Tooltip title="Открыть">
          <Button size="small" icon={<EyeOutlined />} onClick={() => router.push(`${basePath}/${record.id}`)} />
        </Tooltip>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Возвраты</Title>
        {!isWorker && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push(`${basePath}/new`)}>
            Создать возврат
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
          style={{ width: 160 }}
          options={[
            { value: 'draft', label: 'Черновик' },
            { value: 'completed', label: 'Проведён' },
            { value: 'cancelled', label: 'Отменён' },
          ]}
          onChange={v => setStatusFilter(v ?? null)}
          allowClear
        />
        <RangePicker format="DD.MM.YYYY" onChange={v => setDateRange(v as [Dayjs, Dayjs] | null)} />
      </Space>

      <Table
        columns={columns}
        dataSource={returns}
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
