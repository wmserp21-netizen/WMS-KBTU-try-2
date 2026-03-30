'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Form, Select, DatePicker, Button, Table,
  InputNumber, Space, Typography, Divider, App,
} from 'antd'
import { PlusOutlined, DeleteOutlined, ArrowLeftOutlined, SaveOutlined, CheckOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'

const { Title, Text } = Typography

interface Warehouse { id: string; name: string }

interface StockProduct {
  id: string
  name: string
  sku: string
  sell_price: number
  available: number  // stock quantity in selected warehouse
}

interface LineItem {
  key: string
  product_id: string | null
  qty: number
  sell_price: number
  available: number
  hasError: boolean
}

interface Props {
  backPath: string
  detailBasePath: string
}

export default function SaleForm({ backPath, detailBasePath }: Props) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const router = useRouter()
  const supabase = createClient()

  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [products, setProducts] = useState<StockProduct[]>([])
  const [docNumber, setDocNumber] = useState('')
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null)
  const [lines, setLines] = useState<LineItem[]>([
    { key: '1', product_id: null, qty: 1, sell_price: 0, available: 0, hasError: false },
  ])
  const [saving, setSaving] = useState(false)

  const loadWarehouses = useCallback(async () => {
    const { data } = await supabase.from('warehouses').select('id, name').eq('status', 'active')
    setWarehouses(data ?? [])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const generateDocNumber = useCallback(async () => {
    const { data } = await supabase.rpc('generate_doc_number', { prefix: 'SO', table_name: 'sales' })
    setDocNumber(data ?? `SO-${dayjs().year()}-0001`)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadWarehouses(); generateDocNumber() }, [loadWarehouses, generateDocNumber])

  const onWarehouseChange = async (warehouseId: string) => {
    setSelectedWarehouseId(warehouseId)
    setLines([{ key: '1', product_id: null, qty: 1, sell_price: 0, available: 0, hasError: false }])

    // Load products with stock for this warehouse
    const { data: stockRows } = await supabase
      .from('stock')
      .select('product_id, quantity, products(id, name, sku, sell_price)')
      .eq('warehouse_id', warehouseId)
      .gt('quantity', -1)  // include all, even 0

    setProducts((stockRows ?? []).map(s => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      id: (s.products as any).id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      name: (s.products as any).name,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sku: (s.products as any).sku,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sell_price: (s.products as any).sell_price,
      available: s.quantity,
    })))
  }

  const addLine = () => {
    setLines(prev => [
      ...prev,
      { key: Date.now().toString(), product_id: null, qty: 1, sell_price: 0, available: 0, hasError: false },
    ])
  }

  const removeLine = (key: string) => setLines(prev => prev.filter(l => l.key !== key))

  const updateLine = (key: string, field: keyof LineItem, value: unknown) => {
    setLines(prev => prev.map(l => {
      if (l.key !== key) return l
      const updated = { ...l, [field]: value }

      if (field === 'product_id') {
        const prod = products.find(p => p.id === value)
        if (prod) {
          updated.sell_price = prod.sell_price
          updated.available = prod.available
        }
      }

      // Validate qty vs available
      const qty = field === 'qty' ? (value as number) : updated.qty
      updated.hasError = updated.product_id !== null && qty > updated.available

      return updated
    }))
  }

  const hasErrors = lines.some(l => l.hasError)
  const total = lines.reduce((sum, l) => sum + l.qty * l.sell_price, 0)

  const doSave = async (status: 'draft' | 'completed') => {
    const values = await form.validateFields()
    const validLines = lines.filter(l => l.product_id)
    if (validLines.length === 0) { message.error('Добавьте хотя бы одну позицию'); return }
    if (status === 'completed' && hasErrors) { message.error('Исправьте ошибки в позициях'); return }

    setSaving(true)

    const { data: sale, error: sErr } = await supabase
      .from('sales')
      .insert({
        number: docNumber,
        date: values.date ? values.date.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        warehouse_id: values.warehouse_id,
        status,
        total,
      })
      .select('id')
      .single()

    if (sErr) { message.error(sErr.message); setSaving(false); return }

    const { error: iErr } = await supabase.from('sale_items').insert(
      validLines.map(l => ({
        sale_id: sale.id,
        product_id: l.product_id!,
        qty: l.qty,
        sell_price: l.sell_price,
      }))
    )
    if (iErr) { message.error(iErr.message); setSaving(false); return }

    // Deduct stock only when completed
    if (status === 'completed') {
      for (const l of validLines) {
        const { data: cur } = await supabase
          .from('stock')
          .select('quantity')
          .eq('product_id', l.product_id!)
          .eq('warehouse_id', values.warehouse_id)
          .single()

        await supabase.from('stock').update({
          quantity: (cur?.quantity ?? 0) - l.qty,
        }).eq('product_id', l.product_id!).eq('warehouse_id', values.warehouse_id)
      }
    }

    message.success(status === 'draft' ? 'Черновик сохранён' : 'Продажа проведена')
    router.push(`${detailBasePath}/${sale.id}`)
  }

  const lineColumns: ColumnsType<LineItem> = [
    {
      title: 'Товар',
      dataIndex: 'product_id',
      render: (v, record) => (
        <Select
          value={v}
          style={{ width: '100%', minWidth: 200 }}
          placeholder="Выберите товар"
          disabled={!selectedWarehouseId}
          options={products.map(p => ({
            value: p.id,
            label: `${p.sku} — ${p.name}`,
            disabled: p.available <= 0,
          }))}
          onChange={val => updateLine(record.key, 'product_id', val)}
          showSearch
          optionFilterProp="label"
        />
      ),
    },
    {
      title: 'Доступно',
      width: 90,
      render: (_, record) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {record.product_id ? `${record.available} шт` : '—'}
        </Text>
      ),
    },
    {
      title: 'Кол-во',
      dataIndex: 'qty',
      width: 110,
      render: (v, record) => (
        <InputNumber
          min={1}
          value={v}
          style={{ width: '100%', borderColor: record.hasError ? '#ff4d4f' : undefined }}
          status={record.hasError ? 'error' : undefined}
          onChange={val => updateLine(record.key, 'qty', val ?? 1)}
        />
      ),
    },
    {
      title: 'Цена продажи',
      dataIndex: 'sell_price',
      width: 140,
      render: (v, record) => (
        <InputNumber
          min={0}
          value={v}
          style={{ width: '100%' }}
          onChange={val => updateLine(record.key, 'sell_price', val ?? 0)}
        />
      ),
    },
    {
      title: 'Сумма',
      width: 120,
      render: (_, record) => (
        <Text>{(record.qty * record.sell_price).toLocaleString('ru-RU')} ₸</Text>
      ),
    },
    {
      title: '',
      width: 40,
      render: (_, record) => (
        <Button
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={() => removeLine(record.key)}
          disabled={lines.length === 1}
        />
      ),
    },
  ]

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push(backPath)}>Назад</Button>
        <Title level={4} style={{ margin: 0 }}>Новая продажа</Title>
      </div>

      <Form form={form} layout="vertical">
        <Space wrap>
          <Form.Item label="№ продажи">
            <Select
              disabled
              value={docNumber}
              style={{ width: 180 }}
              options={[{ value: docNumber, label: docNumber }]}
            />
          </Form.Item>
          <Form.Item name="date" label="Дата" initialValue={dayjs()}>
            <DatePicker format="DD.MM.YYYY" />
          </Form.Item>
          <Form.Item name="warehouse_id" label="Склад" rules={[{ required: true, message: 'Выберите склад' }]}>
            <Select
              style={{ width: 220 }}
              placeholder="Выберите склад"
              options={warehouses.map(w => ({ value: w.id, label: w.name }))}
              onChange={onWarehouseChange}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
        </Space>
      </Form>

      <Divider />

      <Table
        columns={lineColumns}
        dataSource={lines}
        rowKey="key"
        pagination={false}
        size="middle"
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={4}>
              <Text strong>Итого:</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={1}>
              <Text strong>{total.toLocaleString('ru-RU')} ₸</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={2} />
          </Table.Summary.Row>
        )}
      />

      <Button
        type="dashed"
        icon={<PlusOutlined />}
        onClick={addLine}
        style={{ marginTop: 12, width: '100%' }}
        disabled={!selectedWarehouseId}
      >
        Добавить позицию
      </Button>

      <Divider />

      <Space>
        <Button onClick={() => router.push(backPath)}>Отмена</Button>
        <Button icon={<SaveOutlined />} onClick={() => doSave('draft')} loading={saving}>
          Сохранить черновик
        </Button>
        <Button
          type="primary"
          icon={<CheckOutlined />}
          onClick={() => doSave('completed')}
          loading={saving}
          disabled={hasErrors}
        >
          Провести
        </Button>
      </Space>
    </div>
  )
}
