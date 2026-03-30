'use client'

import { useEffect, useState } from 'react'
import { Tabs, Typography, Tag, Space, Spin, Button } from 'antd'
import { ArrowLeftOutlined, HomeOutlined, AppstoreOutlined, TableOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import CellsTab from '@/components/cells/CellsTab'
import CellMap from '@/components/cells/CellMap'

const { Title, Text } = Typography

interface Warehouse {
  id: string
  name: string
  address: string | null
  status: 'active' | 'closed'
  owner_id: string
  owner_name?: string
}

interface Props {
  warehouseId: string
  viewerRole: 'admin' | 'owner' | 'worker'
  backHref: string
}

export default function WarehouseDetail({ warehouseId, viewerRole, backHref }: Props) {
  const router = useRouter()
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: wh } = await supabase
        .from('warehouses')
        .select('*')
        .eq('id', warehouseId)
        .single()

      if (!wh) { setLoading(false); return }

      let ownerName: string | undefined
      if (viewerRole === 'admin') {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', wh.owner_id)
          .single()
        ownerName = profile?.full_name ?? undefined
      }

      setWarehouse({ ...wh, owner_name: ownerName })
      setLoading(false)
    }
    load()
  }, [warehouseId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!warehouse) {
    return <Text type="danger">Склад не найден</Text>
  }

  const readOnly = viewerRole === 'worker'

  const tabItems = [
    {
      key: 'cells',
      label: <span><TableOutlined /> Ячейки</span>,
      children: <CellsTab warehouseId={warehouseId} readOnly={readOnly} />,
    },
    {
      key: 'map',
      label: <span><AppstoreOutlined /> Карта склада</span>,
      children: <CellMap warehouseId={warehouseId} />,
    },
  ]

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => router.push(backHref)}
          style={{ marginBottom: 8, paddingLeft: 0 }}
        >
          Назад к складам
        </Button>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: '#1677ff15',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginTop: 2,
            }}
          >
            <HomeOutlined style={{ fontSize: 20, color: '#1677ff' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Title level={4} style={{ margin: 0 }}>{warehouse.name}</Title>
              <Tag color={warehouse.status === 'active' ? 'green' : 'red'}>
                {warehouse.status === 'active' ? 'Активен' : 'Закрыт'}
              </Tag>
            </div>
            <Space size={16} style={{ marginTop: 4 }}>
              {warehouse.address && (
                <Text type="secondary">{warehouse.address}</Text>
              )}
              {warehouse.owner_name && (
                <Text type="secondary">Владелец: {warehouse.owner_name}</Text>
              )}
            </Space>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs items={tabItems} defaultActiveKey="cells" />
    </div>
  )
}
