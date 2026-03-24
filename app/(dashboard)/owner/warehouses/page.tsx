'use client'

import { useEffect, useState, useCallback } from 'react'
import { Table, Tag, Typography, Badge } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { createClient } from '@/lib/supabase/client'

const { Title } = Typography

interface Warehouse {
  id: string
  name: string
  address: string | null
  status: 'active' | 'closed'
  worker_count: number
}

export default function OwnerWarehousesPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  const load = useCallback(async () => {
    setLoading(true)

    const { data: whs } = await supabase
      .from('warehouses')
      .select('id, name, address, status')
      .order('created_at', { ascending: false })

    const { data: assignments } = await supabase
      .from('warehouse_workers')
      .select('warehouse_id')

    const countMap: Record<string, number> = {}
    for (const a of assignments ?? []) {
      countMap[a.warehouse_id] = (countMap[a.warehouse_id] ?? 0) + 1
    }

    setWarehouses((whs ?? []).map(w => ({
      ...w,
      worker_count: countMap[w.id] ?? 0,
    })))
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const columns: ColumnsType<Warehouse> = [
    { title: 'Наименование', dataIndex: 'name' },
    { title: 'Адрес', dataIndex: 'address', render: v => v ?? '—' },
    {
      title: 'Рабочих',
      dataIndex: 'worker_count',
      render: v => <Badge count={v} showZero color="#1677ff" />,
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      render: (v: 'active' | 'closed') => (
        <Tag color={v === 'active' ? 'green' : 'default'}>
          {v === 'active' ? 'Активен' : 'Закрыт'}
        </Tag>
      ),
    },
  ]

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Мои склады</Title>
      <Table
        columns={columns}
        dataSource={warehouses}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20, showTotal: total => `Всего: ${total}` }}
        size="middle"
      />
    </div>
  )
}
