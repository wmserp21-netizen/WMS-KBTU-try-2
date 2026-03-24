'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Descriptions, Table, Tag, Button, Space, Breadcrumb,
  Typography, Modal, InputNumber, message, Popconfirm, Spin,
} from 'antd'
import {
  CheckOutlined, ProfileOutlined, CloseOutlined, ArrowLeftOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'

const { Title, Text } = Typography

type PurchaseStatus = 'pending' | 'received_full' | 'received_partial' | 'cancelled'

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

interface PurchaseItem {
  id: string
  product_id: string
  product_name: string
  product_unit: string
  qty_expected: number
  qty_actual: number | null
  buy_price: number
}

interface Purchase {
  id: string
  number: string
  date: string
  status: PurchaseStatus
  total: number
  warehouse_id: string
  warehouse_name: string
  supplier_name: string
  created_by_name: string
  updated_by_name: string
  items: PurchaseItem[]
}

interface Props {
  id: string
  viewerRole: 'admin' | 'owner' | 'worker'
  backPath: string
}

export default function PurchaseDetail({ id, viewerRole, backPath }: Props) {
  const [purchase, setPurchase] = useState<Purchase | null>(null)
  const [loading, setLoading] = useState(true)
  const [partialOpen, setPartialOpen] = useState(false)
  const [partialQtys, setPartialQtys] = useState<Record<string, number>>({})
  const [acting, setActing] = useState(false)

  const supabase = createClient()
  const router = useRouter()

  const load = useCallback(async () => {
    setLoading(true)

    const { data: p } = await supabase
      .from('purchases')
      .select('*')
      .eq('id', id)
      .single()

    if (!p) { setLoading(false); return }

    const { data: items } = await supabase
      .from('purchase_items')
      .select('id, product_id, qty_expected, qty_actual, buy_price, products(name, unit)')
      .eq('purchase_id', id)

    const { data: wh } = await supabase.from('warehouses').select('name').eq('id', p.warehouse_id).single()
    const { data: sup } = await supabase.from('suppliers').select('name').eq('id', p.supplier_id).single()

    const profileIds = [p.created_by, p.updated_by].filter(Boolean)
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', profileIds)
    const profileMap: Record<string, string> = {}
    for (const pr of profilesData ?? []) profileMap[pr.id] = pr.full_name ?? pr.id

    setPurchase({
      ...p,
      warehouse_name: wh?.name ?? '—',
      supplier_name: sup?.name ?? '—',
      created_by_name: profileMap[p.created_by] ?? '—',
      updated_by_name: profileMap[p.updated_by] ?? '—',
      items: (items ?? []).map(i => ({
        id: i.id,
        product_id: i.product_id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        product_name: (i.products as any)?.name ?? '—',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        product_unit: (i.products as any)?.unit ?? 'шт',
        qty_expected: i.qty_expected,
        qty_actual: i.qty_actual,
        buy_price: i.buy_price,
      })),
    })
    setLoading(false)
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const getCurrentUserId = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id ?? null
  }

  const receiveAll = async () => {
    if (!purchase) return
    setActing(true)
    const userId = await getCurrentUserId()

    // Update all items qty_actual = qty_expected
    for (const item of purchase.items) {
      await supabase.from('purchase_items').update({ qty_actual: item.qty_expected }).eq('id', item.id)
      await supabase.from('stock').upsert({
        product_id: item.product_id,
        warehouse_id: purchase.warehouse_id,
        quantity: item.qty_expected,
      }, { onConflict: 'product_id,warehouse_id', ignoreDuplicates: false })

      // We need to increment, not replace — read current and add
      const { data: currentStock } = await supabase
        .from('stock')
        .select('quantity')
        .eq('product_id', item.product_id)
        .eq('warehouse_id', purchase.warehouse_id)
        .single()

      await supabase.from('stock').update({
        quantity: (currentStock?.quantity ?? 0) + item.qty_expected,
      }).eq('product_id', item.product_id).eq('warehouse_id', purchase.warehouse_id)
    }

    await supabase.from('purchases').update({
      status: 'received_full',
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }).eq('id', purchase.id)

    message.success('Поставка принята полностью')
    setActing(false)
    load()
  }

  const receivePartial = async () => {
    if (!purchase) return
    setActing(true)
    const userId = await getCurrentUserId()

    for (const item of purchase.items) {
      const actualQty = partialQtys[item.id] ?? 0
      await supabase.from('purchase_items').update({ qty_actual: actualQty }).eq('id', item.id)

      if (actualQty > 0) {
        const { data: currentStock } = await supabase
          .from('stock')
          .select('quantity')
          .eq('product_id', item.product_id)
          .eq('warehouse_id', purchase.warehouse_id)
          .single()

        await supabase.from('stock').update({
          quantity: (currentStock?.quantity ?? 0) + actualQty,
        }).eq('product_id', item.product_id).eq('warehouse_id', purchase.warehouse_id)
      }
    }

    await supabase.from('purchases').update({
      status: 'received_partial',
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }).eq('id', purchase.id)

    message.success('Поставка принята частично')
    setActing(false)
    setPartialOpen(false)
    load()
  }

  const cancel = async () => {
    if (!purchase) return
    setActing(true)
    const userId = await getCurrentUserId()
    await supabase.from('purchases').update({
      status: 'cancelled',
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }).eq('id', purchase.id)
    message.success('Поставка отменена')
    setActing(false)
    load()
  }

  const isWorker = viewerRole === 'worker'
  const isFinal = purchase?.status !== 'pending'

  const itemColumns: ColumnsType<PurchaseItem> = [
    { title: 'Товар', dataIndex: 'product_name' },
    { title: 'Ед. изм.', dataIndex: 'product_unit', width: 80 },
    { title: 'Ожид. кол-во', dataIndex: 'qty_expected', width: 130 },
    {
      title: 'Факт. кол-во',
      dataIndex: 'qty_actual',
      width: 130,
      render: v => v ?? '—',
    },
    ...(!isWorker ? [
      {
        title: 'Цена',
        dataIndex: 'buy_price' as const,
        width: 110,
        render: (v: number) => v.toLocaleString('ru-RU') + ' ₸',
      },
      {
        title: 'Сумма',
        width: 120,
        render: (_: unknown, r: PurchaseItem) => ((r.qty_expected * r.buy_price).toLocaleString('ru-RU') + ' ₸'),
      },
    ] : []),
  ]

  const partialColumns: ColumnsType<PurchaseItem> = [
    { title: 'Товар', dataIndex: 'product_name' },
    { title: 'Ожид.', dataIndex: 'qty_expected', width: 90 },
    {
      title: 'Факт. кол-во',
      width: 140,
      render: (_, record) => (
        <InputNumber
          min={0}
          max={record.qty_expected}
          defaultValue={record.qty_expected}
          onChange={v => setPartialQtys(prev => ({ ...prev, [record.id]: v ?? 0 }))}
          style={{ width: '100%' }}
        />
      ),
    },
  ]

  if (loading) return <Spin style={{ marginTop: 40, display: 'block', textAlign: 'center' }} />
  if (!purchase) return <Text type="danger">Поставка не найдена</Text>

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push(backPath)}>Назад</Button>
      </Space>

      <Breadcrumb
        style={{ marginBottom: 8 }}
        items={[
          { title: 'Поставки', onClick: () => router.push(backPath), className: 'cursor-pointer' },
          { title: purchase.number },
        ]}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>{purchase.number}</Title>
        <Tag color={STATUS_COLORS[purchase.status]}>{STATUS_LABELS[purchase.status]}</Tag>
      </div>

      <Descriptions bordered size="small" style={{ marginBottom: 20 }}>
        <Descriptions.Item label="№ документа">{purchase.number}</Descriptions.Item>
        <Descriptions.Item label="Дата">{dayjs(purchase.date).format('DD.MM.YYYY')}</Descriptions.Item>
        <Descriptions.Item label="Склад">{purchase.warehouse_name}</Descriptions.Item>
        <Descriptions.Item label="Поставщик">{purchase.supplier_name}</Descriptions.Item>
        <Descriptions.Item label="Статус">
          <Tag color={STATUS_COLORS[purchase.status]}>{STATUS_LABELS[purchase.status]}</Tag>
        </Descriptions.Item>
        {!isWorker && (
          <Descriptions.Item label="Сумма">
            {purchase.total.toLocaleString('ru-RU')} ₸
          </Descriptions.Item>
        )}
      </Descriptions>

      <Table
        columns={itemColumns}
        dataSource={purchase.items}
        rowKey="id"
        pagination={false}
        size="middle"
        style={{ marginBottom: 20 }}
      />

      {!isFinal && (
        <Space>
          <Popconfirm
            title="Принять полностью?"
            description="Остатки всех товаров будут обновлены."
            onConfirm={receiveAll}
            okText="Да, принять"
            cancelText="Отмена"
          >
            <Button
              type="primary"
              icon={<CheckOutlined />}
              loading={acting}
            >
              Принять полностью
            </Button>
          </Popconfirm>
          <Button
            icon={<ProfileOutlined />}
            onClick={() => {
              const init: Record<string, number> = {}
              purchase.items.forEach(i => { init[i.id] = i.qty_expected })
              setPartialQtys(init)
              setPartialOpen(true)
            }}
            loading={acting}
          >
            Принять частично
          </Button>
          {!isWorker && (
            <Popconfirm
              title="Отменить поставку?"
              onConfirm={cancel}
              okText="Да, отменить"
              cancelText="Нет"
              okButtonProps={{ danger: true }}
            >
              <Button danger icon={<CloseOutlined />} loading={acting}>
                Отменить
              </Button>
            </Popconfirm>
          )}
        </Space>
      )}

      <Modal
        title="Принять частично"
        open={partialOpen}
        onCancel={() => setPartialOpen(false)}
        onOk={receivePartial}
        confirmLoading={acting}
        okText="Подтвердить приёмку"
        cancelText="Отмена"
        width={500}
      >
        <Table
          columns={partialColumns}
          dataSource={purchase.items}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </Modal>
    </div>
  )
}
