'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Descriptions, Table, Tag, Button, Space, Breadcrumb,
  Typography, Popconfirm, message, Spin,
} from 'antd'
import {
  CheckOutlined, CloseOutlined, ArrowLeftOutlined, PrinterOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'

const { Title, Text } = Typography

type ReturnStatus = 'draft' | 'completed' | 'cancelled'

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

interface ReturnItem {
  id: string
  product_id: string
  product_name: string
  product_unit: string
  qty: number
  sell_price: number
}

interface ReturnDoc {
  id: string
  number: string
  date: string
  status: ReturnStatus
  total: number
  reason: string | null
  warehouse_id: string
  warehouse_name: string
  sale_id: string
  sale_number: string
  sale_path: string
  items: ReturnItem[]
}

interface Props {
  id: string
  viewerRole: 'admin' | 'owner' | 'worker'
  backPath: string
  salesBasePath: string
}

export default function ReturnDetail({ id, viewerRole, backPath, salesBasePath }: Props) {
  const [ret, setRet] = useState<ReturnDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)

  const supabase = createClient()
  const router = useRouter()

  const load = useCallback(async () => {
    setLoading(true)

    const { data: r } = await supabase.from('returns').select('*').eq('id', id).single()
    if (!r) { setLoading(false); return }

    const { data: items } = await supabase
      .from('return_items')
      .select('id, product_id, qty, sell_price, products(name, unit)')
      .eq('return_id', id)

    const { data: wh } = await supabase.from('warehouses').select('name').eq('id', r.warehouse_id).single()
    const { data: sale } = await supabase.from('sales').select('number').eq('id', r.sale_id).single()

    setRet({
      ...r,
      warehouse_name: wh?.name ?? '—',
      sale_number: sale?.number ?? '—',
      sale_path: `${salesBasePath}/${r.sale_id}`,
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
  }, [id, salesBasePath]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const getCurrentUserId = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id ?? null
  }

  const completeReturn = async () => {
    if (!ret) return
    setActing(true)
    const userId = await getCurrentUserId()

    for (const item of ret.items) {
      const { data: cur } = await supabase
        .from('stock')
        .select('quantity')
        .eq('product_id', item.product_id)
        .eq('warehouse_id', ret.warehouse_id)
        .single()

      await supabase.from('stock').update({
        quantity: (cur?.quantity ?? 0) + item.qty,
      }).eq('product_id', item.product_id).eq('warehouse_id', ret.warehouse_id)
    }

    await supabase.from('returns').update({
      status: 'completed',
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }).eq('id', ret.id)

    message.success('Возврат проведён, остатки обновлены')
    setActing(false)
    load()
  }

  const cancelReturn = async () => {
    if (!ret) return
    setActing(true)
    const userId = await getCurrentUserId()
    await supabase.from('returns').update({
      status: 'cancelled',
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }).eq('id', ret.id)
    message.success('Возврат отменён')
    setActing(false)
    load()
  }

  const printPDF = async () => {
    if (!ret) return
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const isWorker = viewerRole === 'worker'

    const doc = new jsPDF()
    doc.setFontSize(14)
    doc.text(`Акт возврата ${ret.number}`, 14, 20)
    doc.setFontSize(10)
    doc.text(`Дата: ${dayjs(ret.date).format('DD.MM.YYYY')}`, 14, 28)
    doc.text(`Склад: ${ret.warehouse_name}`, 14, 34)
    doc.text(`Исходная продажа: ${ret.sale_number}`, 14, 40)
    if (ret.reason) doc.text(`Причина: ${ret.reason}`, 14, 46)

    const head = isWorker
      ? [['Товар', 'Кол-во', 'Ед. изм.']]
      : [['Товар', 'Кол-во', 'Цена', 'Сумма']]

    const body = ret.items.map(i =>
      isWorker
        ? [i.product_name, i.qty, i.product_unit]
        : [i.product_name, i.qty, i.sell_price.toLocaleString('ru-RU'), (i.qty * i.sell_price).toLocaleString('ru-RU')]
    )

    autoTable(doc, { head, body, startY: ret.reason ? 54 : 46 })

    if (!isWorker) {
      const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
      doc.text(`Итого: ${ret.total.toLocaleString('ru-RU')} ₸`, 14, finalY + 8)
    }

    doc.save(`return-${ret.number}.pdf`)
  }

  const isWorker = viewerRole === 'worker'

  const itemColumns: ColumnsType<ReturnItem> = [
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
        render: (_: unknown, r: ReturnItem) => ((r.qty * r.sell_price).toLocaleString('ru-RU') + ' ₸'),
      },
    ] : []),
  ]

  if (loading) return <Spin style={{ marginTop: 40, display: 'block', textAlign: 'center' }} />
  if (!ret) return <Text type="danger">Возврат не найден</Text>

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} onClick={() => router.push(backPath)} style={{ marginBottom: 12 }}>
        Назад
      </Button>

      <Breadcrumb
        style={{ marginBottom: 8 }}
        items={[
          { title: 'Возвраты', onClick: () => router.push(backPath), className: 'cursor-pointer' },
          { title: ret.number },
        ]}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>{ret.number}</Title>
        <Tag color={STATUS_COLORS[ret.status]}>{STATUS_LABELS[ret.status]}</Tag>
      </div>

      <Descriptions bordered size="small" style={{ marginBottom: 20 }}>
        <Descriptions.Item label="Дата">{dayjs(ret.date).format('DD.MM.YYYY')}</Descriptions.Item>
        <Descriptions.Item label="Склад">{ret.warehouse_name}</Descriptions.Item>
        <Descriptions.Item label="Исходная продажа">
          <Button type="link" style={{ padding: 0 }} onClick={() => router.push(ret.sale_path)}>
            {ret.sale_number}
          </Button>
        </Descriptions.Item>
        <Descriptions.Item label="Причина">{ret.reason ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Статус">
          <Tag color={STATUS_COLORS[ret.status]}>{STATUS_LABELS[ret.status]}</Tag>
        </Descriptions.Item>
        {!isWorker && (
          <Descriptions.Item label="Сумма">
            {ret.total.toLocaleString('ru-RU')} ₸
          </Descriptions.Item>
        )}
      </Descriptions>

      <Table
        columns={itemColumns}
        dataSource={ret.items}
        rowKey="id"
        pagination={false}
        size="middle"
        style={{ marginBottom: 20 }}
        summary={() => !isWorker ? (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={3}><Text strong>Итого</Text></Table.Summary.Cell>
            <Table.Summary.Cell index={1} colSpan={2}>
              <Text strong>{ret.total.toLocaleString('ru-RU')} ₸</Text>
            </Table.Summary.Cell>
          </Table.Summary.Row>
        ) : null}
      />

      <Space>
        {ret.status === 'draft' && (
          <>
            <Popconfirm
              title={isWorker ? 'Принять возврат на склад?' : 'Провести возврат?'}
              description="Остатки склада будут увеличены."
              onConfirm={completeReturn}
              okText="Да"
              cancelText="Нет"
            >
              <Button type="primary" icon={<CheckOutlined />} loading={acting}>
                {isWorker ? 'Принять возврат на склад' : 'Провести возврат'}
              </Button>
            </Popconfirm>
            {!isWorker && (
              <Popconfirm
                title="Отменить возврат?"
                onConfirm={cancelReturn}
                okText="Отменить"
                cancelText="Нет"
                okButtonProps={{ danger: true }}
              >
                <Button danger icon={<CloseOutlined />} loading={acting}>Отменить</Button>
              </Popconfirm>
            )}
          </>
        )}
        {ret.status === 'completed' && (
          <Button icon={<PrinterOutlined />} onClick={printPDF}>Печать акта возврата</Button>
        )}
      </Space>
    </div>
  )
}
