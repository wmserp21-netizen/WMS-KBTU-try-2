'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Descriptions, Table, Tag, Button, Space, Breadcrumb,
  Typography, Popconfirm, Spin, App,
} from 'antd'
import {
  CheckOutlined, CloseOutlined, ArrowLeftOutlined,
  RollbackOutlined, PrinterOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'

const { Title, Text } = Typography

type SaleStatus = 'draft' | 'completed' | 'cancelled'

const STATUS_LABELS: Record<SaleStatus, string> = {
  draft: 'Черновик',
  completed: 'Проведён',
  cancelled: 'Отменён',
}
const STATUS_COLORS: Record<SaleStatus, string> = {
  draft: 'blue',
  completed: 'green',
  cancelled: 'red',
}

interface SaleItem {
  id: string
  product_id: string
  product_name: string
  product_unit: string
  qty: number
  sell_price: number
}

interface Sale {
  id: string
  number: string
  date: string
  status: SaleStatus
  total: number
  warehouse_id: string
  warehouse_name: string
  created_by_name: string
  updated_by_name: string
  items: SaleItem[]
}

interface Props {
  id: string
  viewerRole: 'admin' | 'owner' | 'worker'
  backPath: string
  returnsNewPath: string
}

export default function SaleDetail({ id, viewerRole, backPath, returnsNewPath }: Props) {
  const { message } = App.useApp()
  const [sale, setSale] = useState<Sale | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)

  const supabase = createClient()
  const router = useRouter()

  const load = useCallback(async () => {
    setLoading(true)

    const { data: s } = await supabase.from('sales').select('*').eq('id', id).single()
    if (!s) { setLoading(false); return }

    const { data: items } = await supabase
      .from('sale_items')
      .select('id, product_id, qty, sell_price, products(name, unit)')
      .eq('sale_id', id)

    const { data: wh } = await supabase.from('warehouses').select('name').eq('id', s.warehouse_id).single()

    const profileIds = [s.created_by, s.updated_by].filter(Boolean)
    const { data: profiles } = profileIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', profileIds)
      : { data: [] }
    const pm: Record<string, string> = {}
    for (const p of profiles ?? []) pm[p.id] = p.full_name ?? p.id

    setSale({
      ...s,
      warehouse_name: wh?.name ?? '—',
      created_by_name: pm[s.created_by] ?? '—',
      updated_by_name: pm[s.updated_by] ?? '—',
      items: (items ?? []).map(i => ({
        id: i.id,
        product_id: i.product_id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        product_name: (i.products as any)?.name ?? '—',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        product_unit: (i.products as any)?.unit ?? 'шт',
        qty: i.qty,
        sell_price: i.sell_price,
      })),
    })
    setLoading(false)
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const getCurrentUserId = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id ?? null
  }

  const completeDraft = async () => {
    if (!sale) return
    setActing(true)
    const userId = await getCurrentUserId()

    // Load product details and warehouse owner for deficit notifications
    const productIds = sale.items.map(i => i.product_id)
    const { data: productsData } = productIds.length > 0
      ? await supabase.from('products').select('id, sku, min_stock').in('id', productIds)
      : { data: [] }
    const productMeta: Record<string, { sku: string; min_stock: number }> = {}
    for (const p of productsData ?? []) productMeta[p.id] = { sku: p.sku ?? '', min_stock: p.min_stock ?? 0 }

    const { data: whData } = await supabase.from('warehouses').select('owner_id').eq('id', sale.warehouse_id).single()
    const ownerId = whData?.owner_id ?? null

    for (const item of sale.items) {
      const { data: cur } = await supabase
        .from('stock')
        .select('quantity')
        .eq('product_id', item.product_id)
        .eq('warehouse_id', sale.warehouse_id)
        .single()

      const newQty = (cur?.quantity ?? 0) - item.qty
      await supabase.from('stock').update({
        quantity: newQty,
      }).eq('product_id', item.product_id).eq('warehouse_id', sale.warehouse_id)

      // Fire Telegram notification if stock falls below min_stock
      const meta = productMeta[item.product_id]
      if (meta && newQty < meta.min_stock && ownerId) {
        fetch('/api/notifications/telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_name: item.product_name,
            sku: meta.sku,
            warehouse_name: sale.warehouse_name,
            current_qty: newQty,
            min_stock: meta.min_stock,
            owner_id: ownerId,
          }),
        }).catch(() => {})
      }
    }

    await supabase.from('sales').update({
      status: 'completed',
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }).eq('id', sale.id)

    message.success('Продажа проведена')
    setActing(false)
    load()
  }

  const cancelSale = async () => {
    if (!sale) return
    setActing(true)
    const userId = await getCurrentUserId()
    await supabase.from('sales').update({
      status: 'cancelled',
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }).eq('id', sale.id)
    message.success('Продажа отменена')
    setActing(false)
    load()
  }

  const printPDF = async () => {
    if (!sale) return
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const isWorker = viewerRole === 'worker'

    const doc = new jsPDF()
    doc.setFontSize(14)
    doc.text(`Накладная ${sale.number}`, 14, 20)
    doc.setFontSize(10)
    doc.text(`Дата: ${dayjs(sale.date).format('DD.MM.YYYY')}`, 14, 28)
    doc.text(`Склад: ${sale.warehouse_name}`, 14, 34)

    const head = isWorker
      ? [['Товар', 'Кол-во', 'Ед. изм.']]
      : [['Товар', 'Кол-во', 'Цена', 'Сумма']]

    const body = sale.items.map(i =>
      isWorker
        ? [i.product_name, i.qty, i.product_unit]
        : [i.product_name, i.qty, i.sell_price.toLocaleString('ru-RU'), (i.qty * i.sell_price).toLocaleString('ru-RU')]
    )

    autoTable(doc, { head, body, startY: 42 })

    if (!isWorker) {
      const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
      doc.text(`Итого: ${sale.total.toLocaleString('ru-RU')} ₸`, 14, finalY + 8)
    }

    doc.save(`sale-${sale.number}.pdf`)
  }

  const isWorker = viewerRole === 'worker'

  const itemColumns: ColumnsType<SaleItem> = [
    { title: 'Товар', dataIndex: 'product_name' },
    { title: 'Кол-во', dataIndex: 'qty', width: 80 },
    { title: 'Ед. изм.', dataIndex: 'product_unit', width: 80 },
    ...(!isWorker ? [
      {
        title: 'Цена',
        dataIndex: 'sell_price' as const,
        width: 110,
        render: (v: number) => v.toLocaleString('ru-RU') + ' ₸',
      },
      {
        title: 'Сумма',
        width: 120,
        render: (_: unknown, r: SaleItem) => ((r.qty * r.sell_price).toLocaleString('ru-RU') + ' ₸'),
      },
    ] : []),
  ]

  if (loading) return <Spin style={{ marginTop: 40, display: 'block', textAlign: 'center' }} />
  if (!sale) return <Text type="danger">Продажа не найдена</Text>

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} onClick={() => router.push(backPath)} style={{ marginBottom: 12 }}>
        Назад
      </Button>

      <Breadcrumb
        style={{ marginBottom: 8 }}
        items={[
          { title: 'Продажи', onClick: () => router.push(backPath), className: 'cursor-pointer' },
          { title: sale.number },
        ]}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>{sale.number}</Title>
        <Tag color={STATUS_COLORS[sale.status]}>{STATUS_LABELS[sale.status]}</Tag>
      </div>

      <Descriptions bordered size="small" style={{ marginBottom: 20 }}>
        <Descriptions.Item label="Дата">{dayjs(sale.date).format('DD.MM.YYYY')}</Descriptions.Item>
        <Descriptions.Item label="Склад">{sale.warehouse_name}</Descriptions.Item>
        <Descriptions.Item label="Статус">
          <Tag color={STATUS_COLORS[sale.status]}>{STATUS_LABELS[sale.status]}</Tag>
        </Descriptions.Item>
        {!isWorker && (
          <Descriptions.Item label="Сумма">
            {sale.total.toLocaleString('ru-RU')} ₸
          </Descriptions.Item>
        )}
      </Descriptions>

      <Table
        columns={itemColumns}
        dataSource={sale.items}
        rowKey="id"
        pagination={false}
        size="middle"
        style={{ marginBottom: 20 }}
        summary={() => !isWorker ? (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={3}><Text strong>Итого</Text></Table.Summary.Cell>
            <Table.Summary.Cell index={1} colSpan={2}>
              <Text strong>{sale.total.toLocaleString('ru-RU')} ₸</Text>
            </Table.Summary.Cell>
          </Table.Summary.Row>
        ) : null}
      />

      <Space>
        {sale.status === 'draft' && (
          <>
            <Popconfirm
              title="Провести продажу?"
              description="Остатки склада будут уменьшены."
              onConfirm={completeDraft}
              okText="Провести"
              cancelText="Отмена"
            >
              <Button type="primary" icon={<CheckOutlined />} loading={acting}>Провести</Button>
            </Popconfirm>
            <Popconfirm
              title="Отменить продажу?"
              onConfirm={cancelSale}
              okText="Отменить"
              cancelText="Нет"
              okButtonProps={{ danger: true }}
            >
              <Button danger icon={<CloseOutlined />} loading={acting}>Отменить</Button>
            </Popconfirm>
          </>
        )}

        {sale.status === 'completed' && (
          <>
            {!isWorker && (
              <Button
                icon={<RollbackOutlined />}
                onClick={() => router.push(`${returnsNewPath}?sale_id=${sale.id}`)}
              >
                Создать возврат
              </Button>
            )}
            <Button icon={<PrinterOutlined />} onClick={printPDF}>
              Печать накладной
            </Button>
          </>
        )}
      </Space>
    </div>
  )
}
