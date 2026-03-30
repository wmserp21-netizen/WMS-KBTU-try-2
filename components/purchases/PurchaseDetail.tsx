'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Descriptions, Table, Tag, Button, Space, Breadcrumb,
  Typography, Modal, InputNumber, Popconfirm, Spin, App, Select, Tooltip,
  Timeline, Divider,
} from 'antd'
import {
  CheckOutlined, ProfileOutlined, CloseOutlined, ArrowLeftOutlined,
  AppstoreOutlined, HistoryOutlined, UserOutlined, PlusCircleOutlined,
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

const ACTION_LABELS: Record<string, string> = {
  created: 'Создана поставка',
  received_full: 'Принято полностью',
  received_partial: 'Принято частично',
  cancelled: 'Поставка отменена',
}

const ACTION_COLORS: Record<string, string> = {
  created: 'blue',
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

interface PurchaseLog {
  id: string
  action: string
  note: string | null
  created_at: string
  user_name: string
}

interface Cell { id: string; code: string }

interface Props {
  id: string
  viewerRole: 'admin' | 'owner' | 'worker'
  backPath: string
}

export default function PurchaseDetail({ id, viewerRole, backPath }: Props) {
  const { message } = App.useApp()
  const [purchase, setPurchase] = useState<Purchase | null>(null)
  const [logs, setLogs] = useState<PurchaseLog[]>([])
  const [loading, setLoading] = useState(true)
  const [partialOpen, setPartialOpen] = useState(false)
  const [fullOpen, setFullOpen] = useState(false)
  const [partialQtys, setPartialQtys] = useState<Record<string, number>>({})
  const [cellSelections, setCellSelections] = useState<Record<string, string>>({})
  const [cells, setCells] = useState<Cell[]>([])
  const [acting, setActing] = useState(false)

  const supabase = createClient()
  const router = useRouter()

  const loadLogs = useCallback(async () => {
    const { data: logsData } = await supabase
      .from('purchase_logs')
      .select('id, action, note, created_at, user_id')
      .eq('purchase_id', id)
      .order('created_at', { ascending: true })

    if (!logsData || logsData.length === 0) { setLogs([]); return }

    const userIds = [...new Set(logsData.map(l => l.user_id).filter(Boolean))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds)

    const profileMap: Record<string, string> = {}
    for (const p of profiles ?? []) profileMap[p.id] = p.full_name ?? 'Неизвестно'

    setLogs(logsData.map(l => ({
      id: l.id,
      action: l.action,
      note: l.note,
      created_at: l.created_at,
      user_name: l.user_id ? (profileMap[l.user_id] ?? 'Неизвестно') : 'Система',
    })))
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

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

    const { data: cellsData } = await supabase
      .from('cells')
      .select('id, code')
      .eq('warehouse_id', p.warehouse_id)
      .eq('status', 'active')
      .order('code')
    setCells(cellsData ?? [])

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

    await loadLogs()
    setLoading(false)
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const getCurrentUserId = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id ?? null
  }

  const writeLog = async (userId: string | null, action: string, note?: string) => {
    await supabase.from('purchase_logs').insert({
      purchase_id: id,
      user_id: userId,
      action,
      note: note ?? null,
    })
  }

  const addToStockCell = async (productId: string, qty: number, cellId?: string) => {
    if (!purchase || !cellId || qty <= 0) return
    const { data: existing } = await supabase
      .from('stock_cells')
      .select('id, quantity')
      .eq('cell_id', cellId)
      .eq('product_id', productId)
      .single()
    if (existing) {
      await supabase.from('stock_cells').update({
        quantity: existing.quantity + qty,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id)
    } else {
      await supabase.from('stock_cells').insert({
        cell_id: cellId,
        product_id: productId,
        warehouse_id: purchase.warehouse_id,
        quantity: qty,
      })
    }
  }

  const receiveAll = async () => {
    if (!purchase) return
    setActing(true)
    const userId = await getCurrentUserId()

    for (const item of purchase.items) {
      await supabase.from('purchase_items').update({ qty_actual: item.qty_expected }).eq('id', item.id)
      const { data: currentStock } = await supabase
        .from('stock').select('quantity')
        .eq('product_id', item.product_id).eq('warehouse_id', purchase.warehouse_id).single()
      await supabase.from('stock').update({
        quantity: (currentStock?.quantity ?? 0) + item.qty_expected,
      }).eq('product_id', item.product_id).eq('warehouse_id', purchase.warehouse_id)
      await addToStockCell(item.product_id, item.qty_expected, cellSelections[item.id])
    }

    await supabase.from('purchases').update({
      status: 'received_full',
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }).eq('id', purchase.id)

    const cellsUsed = Object.values(cellSelections).filter(Boolean).length
    await writeLog(
      userId,
      'received_full',
      cellsUsed > 0
        ? `${purchase.items.length} позиций, ячейки указаны для ${cellsUsed} из ${purchase.items.length}`
        : `${purchase.items.length} позиций`
    )

    message.success('Поставка принята полностью')
    setActing(false)
    setFullOpen(false)
    load()
  }

  const receivePartial = async () => {
    if (!purchase) return
    setActing(true)
    const userId = await getCurrentUserId()

    let acceptedCount = 0
    let totalAccepted = 0
    for (const item of purchase.items) {
      const actualQty = partialQtys[item.id] ?? 0
      await supabase.from('purchase_items').update({ qty_actual: actualQty }).eq('id', item.id)
      if (actualQty > 0) {
        acceptedCount++
        totalAccepted += actualQty
        const { data: currentStock } = await supabase
          .from('stock').select('quantity')
          .eq('product_id', item.product_id).eq('warehouse_id', purchase.warehouse_id).single()
        await supabase.from('stock').update({
          quantity: (currentStock?.quantity ?? 0) + actualQty,
        }).eq('product_id', item.product_id).eq('warehouse_id', purchase.warehouse_id)
        await addToStockCell(item.product_id, actualQty, cellSelections[item.id])
      }
    }

    await supabase.from('purchases').update({
      status: 'received_partial',
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }).eq('id', purchase.id)

    await writeLog(
      userId,
      'received_partial',
      `${acceptedCount} из ${purchase.items.length} позиций, ${totalAccepted} ед. принято`
    )

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

    await writeLog(userId, 'cancelled')

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
    { title: 'Факт. кол-во', dataIndex: 'qty_actual', width: 130, render: v => v ?? '—' },
    ...(!isWorker ? [
      { title: 'Цена', dataIndex: 'buy_price' as const, width: 110, render: (v: number) => v.toLocaleString('ru-RU') + ' ₸' },
      { title: 'Сумма', width: 120, render: (_: unknown, r: PurchaseItem) => ((r.qty_expected * r.buy_price).toLocaleString('ru-RU') + ' ₸') },
    ] : []),
  ]

  const cellOptions = cells.map(c => ({ value: c.id, label: c.code }))

  const cellSelectCol: ColumnsType<PurchaseItem>[0] = {
    title: (
      <Tooltip title="Необязательно. Если ячейки не созданы — пропустите.">
        <span><AppstoreOutlined /> Ячейка</span>
      </Tooltip>
    ),
    width: 140,
    render: (_, record) => (
      <Select
        placeholder="Выбрать"
        allowClear
        size="small"
        style={{ width: '100%' }}
        options={cellOptions}
        value={cellSelections[record.id]}
        onChange={v => setCellSelections(prev => ({ ...prev, [record.id]: v }))}
        showSearch
        filterOption={(input, opt) =>
          String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())
        }
      />
    ),
  }

  const fullReceiveColumns: ColumnsType<PurchaseItem> = [
    { title: 'Товар', dataIndex: 'product_name' },
    { title: 'Кол-во', dataIndex: 'qty_expected', width: 90 },
    { title: 'Ед.', dataIndex: 'product_unit', width: 60 },
    cellSelectCol,
  ]

  const partialColumns: ColumnsType<PurchaseItem> = [
    { title: 'Товар', dataIndex: 'product_name' },
    { title: 'Ожид.', dataIndex: 'qty_expected', width: 90 },
    {
      title: 'Факт. кол-во', width: 130,
      render: (_, record) => (
        <InputNumber
          min={0} max={record.qty_expected} defaultValue={record.qty_expected}
          onChange={v => setPartialQtys(prev => ({ ...prev, [record.id]: v ?? 0 }))}
          style={{ width: '100%' }} size="small"
        />
      ),
    },
    cellSelectCol,
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
        <Descriptions.Item label="Создал">{purchase.created_by_name}</Descriptions.Item>
        {!isWorker && (
          <Descriptions.Item label="Сумма">{purchase.total.toLocaleString('ru-RU')} ₸</Descriptions.Item>
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
        <Space style={{ marginBottom: 32 }}>
          <Button type="primary" icon={<CheckOutlined />} loading={acting}
            onClick={() => { setCellSelections({}); setFullOpen(true) }}>
            Принять полностью
          </Button>
          <Button icon={<ProfileOutlined />} loading={acting}
            onClick={() => {
              const init: Record<string, number> = {}
              purchase.items.forEach(i => { init[i.id] = i.qty_expected })
              setPartialQtys(init); setCellSelections({}); setPartialOpen(true)
            }}>
            Принять частично
          </Button>
          {!isWorker && (
            <Popconfirm title="Отменить поставку?" onConfirm={cancel} okText="Да, отменить" cancelText="Нет" okButtonProps={{ danger: true }}>
              <Button danger icon={<CloseOutlined />} loading={acting}>Отменить</Button>
            </Popconfirm>
          )}
        </Space>
      )}

      {/* История действий */}
      <Divider titlePlacement="left">
        <Space size={6}><HistoryOutlined /> История действий</Space>
      </Divider>

      {logs.length === 0 ? (
        <Text type="secondary">История пуста</Text>
      ) : (
        <Timeline
          style={{ marginTop: 16 }}
          items={logs.map(log => ({
            color: ACTION_COLORS[log.action] ?? 'gray',
            icon: log.action === 'created'
              ? <PlusCircleOutlined />
              : log.action === 'cancelled'
                ? <CloseOutlined />
                : <CheckOutlined />,
            content: (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Tag color={ACTION_COLORS[log.action] ?? 'default'} style={{ margin: 0 }}>
                    {ACTION_LABELS[log.action] ?? log.action}
                  </Tag>
                  <Text style={{ fontSize: 12, color: '#666' }}>
                    {dayjs(log.created_at).format('DD.MM.YYYY HH:mm')}
                  </Text>
                </div>
                <div style={{ marginTop: 4, fontSize: 13 }}>
                  <UserOutlined style={{ marginRight: 6, color: '#1677ff' }} />
                  <Text strong>{log.user_name}</Text>
                  {log.note && <Text type="secondary" style={{ marginLeft: 8 }}>{log.note}</Text>}
                </div>
              </div>
            ),
          }))}
        />
      )}

      {/* Full receive modal */}
      <Modal title="Принять полностью" open={fullOpen} onCancel={() => setFullOpen(false)}
        onOk={receiveAll} confirmLoading={acting} okText="Подтвердить приёмку" cancelText="Отмена" width={560}>
        <Table columns={fullReceiveColumns} dataSource={purchase.items} rowKey="id" pagination={false} size="small" style={{ marginTop: 8 }} />
        {cells.length === 0 && <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>Ячейки для этого склада не созданы. Можно принять без указания ячеек.</div>}
      </Modal>

      {/* Partial receive modal */}
      <Modal title="Принять частично" open={partialOpen} onCancel={() => setPartialOpen(false)}
        onOk={receivePartial} confirmLoading={acting} okText="Подтвердить приёмку" cancelText="Отмена" width={620}>
        <Table columns={partialColumns} dataSource={purchase.items} rowKey="id" pagination={false} size="small" style={{ marginTop: 8 }} />
        {cells.length === 0 && <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>Ячейки для этого склада не созданы. Можно принять без указания ячеек.</div>}
      </Modal>
    </div>
  )
}
