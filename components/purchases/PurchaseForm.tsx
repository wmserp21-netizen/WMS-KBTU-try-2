'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Form, Input, Select, DatePicker, Button, Table,
  InputNumber, Space, Typography, Modal, Divider, App,
} from 'antd'
import { PlusOutlined, DeleteOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'

const { Title, Text } = Typography

interface Warehouse { id: string; name: string; owner_id: string }
interface Supplier { id: string; name: string; owner_id: string }
interface Product { id: string; name: string; sku: string; buy_price: number }

interface LineItem {
  key: string
  product_id: string | null
  qty_expected: number
  buy_price: number
}

interface Props {
  backPath: string
  detailBasePath: string
}

export default function PurchaseForm({ backPath, detailBasePath }: Props) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [supplierForm] = Form.useForm()
  const router = useRouter()
  const supabase = createClient()

  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [docNumber, setDocNumber] = useState<string>('')
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null)
  const [lines, setLines] = useState<LineItem[]>([{ key: '1', product_id: null, qty_expected: 1, buy_price: 0 }])
  const [saving, setSaving] = useState(false)
  const [addSupplierOpen, setAddSupplierOpen] = useState(false)
  const [addingSupplier, setAddingSupplier] = useState(false)

  const loadWarehouses = useCallback(async () => {
    const { data } = await supabase.from('warehouses').select('id, name, owner_id').eq('status', 'active')
    setWarehouses(data ?? [])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const generateDocNumber = useCallback(async () => {
    const { data } = await supabase.rpc('generate_doc_number', {
      prefix: 'PO',
      table_name: 'purchases',
    })
    setDocNumber(data ?? `PO-${dayjs().year()}-0001`)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadWarehouses(); generateDocNumber() }, [loadWarehouses, generateDocNumber])

  const onWarehouseChange = async (warehouseId: string) => {
    const wh = warehouses.find(w => w.id === warehouseId) ?? null
    setSelectedWarehouse(wh)
    form.setFieldValue('supplier_id', undefined)
    setLines([{ key: '1', product_id: null, qty_expected: 1, buy_price: 0 }])

    if (wh) {
      const { data: sups } = await supabase
        .from('suppliers')
        .select('id, name, owner_id')
        .eq('owner_id', wh.owner_id)
      setSuppliers(sups ?? [])

      // Load products for this owner
      const { data: cats } = await supabase
        .from('categories')
        .select('id')
        .eq('owner_id', wh.owner_id)

      const catIds = (cats ?? []).map(c => c.id)
      if (catIds.length > 0) {
        const { data: prods } = await supabase
          .from('products')
          .select('id, name, sku, buy_price')
          .in('category_id', catIds)
          .order('name')
        setProducts(prods ?? [])
      } else {
        setProducts([])
      }
    }
  }

  const addLine = () => {
    setLines(prev => [...prev, { key: Date.now().toString(), product_id: null, qty_expected: 1, buy_price: 0 }])
  }

  const removeLine = (key: string) => {
    setLines(prev => prev.filter(l => l.key !== key))
  }

  const updateLine = (key: string, field: keyof LineItem, value: unknown) => {
    setLines(prev => prev.map(l => {
      if (l.key !== key) return l
      const updated = { ...l, [field]: value }
      // Auto-fill buy_price from product when product changes
      if (field === 'product_id') {
        const prod = products.find(p => p.id === value)
        if (prod) updated.buy_price = prod.buy_price
      }
      return updated
    }))
  }

  const total = lines.reduce((sum, l) => sum + l.qty_expected * l.buy_price, 0)

  const handleSave = async () => {
    const values = await form.validateFields()
    const validLines = lines.filter(l => l.product_id)
    if (validLines.length === 0) { message.error('Добавьте хотя бы одну позицию'); return }

    setSaving(true)

    const { data: purchase, error: pErr } = await supabase
      .from('purchases')
      .insert({
        number: docNumber,
        date: values.date ? values.date.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        warehouse_id: values.warehouse_id,
        supplier_id: values.supplier_id,
        status: 'pending',
        total,
      })
      .select('id')
      .single()

    if (pErr) { message.error(pErr.message); setSaving(false); return }

    const { error: iErr } = await supabase.from('purchase_items').insert(
      validLines.map(l => ({
        purchase_id: purchase.id,
        product_id: l.product_id!,
        qty_expected: l.qty_expected,
        buy_price: l.buy_price,
      }))
    )

    if (iErr) { message.error(iErr.message); setSaving(false); return }

    message.success('Поставка создана')
    router.push(`${detailBasePath}/${purchase.id}`)
  }

  const handleAddSupplier = async () => {
    const values = await supplierForm.validateFields()
    if (!selectedWarehouse) return
    setAddingSupplier(true)
    const { data, error } = await supabase
      .from('suppliers')
      .insert({ name: values.name, contact: values.contact ?? null, owner_id: selectedWarehouse.owner_id })
      .select('id, name, owner_id')
      .single()
    if (error) { message.error(error.message); setAddingSupplier(false); return }
    setSuppliers(prev => [...prev, data])
    form.setFieldValue('supplier_id', data.id)
    setAddSupplierOpen(false)
    supplierForm.resetFields()
    setAddingSupplier(false)
  }

  const lineColumns: ColumnsType<LineItem> = [
    {
      title: 'Товар',
      dataIndex: 'product_id',
      render: (v, record) => (
        <Select
          value={v}
          style={{ width: '100%', minWidth: 180 }}
          placeholder="Выберите товар"
          options={products.map(p => ({ value: p.id, label: `${p.sku} — ${p.name}` }))}
          onChange={val => updateLine(record.key, 'product_id', val)}
          showSearch
          optionFilterProp="label"
        />
      ),
    },
    {
      title: 'Кол-во',
      dataIndex: 'qty_expected',
      width: 100,
      render: (v, record) => (
        <InputNumber
          min={1}
          value={v}
          style={{ width: '100%' }}
          onChange={val => updateLine(record.key, 'qty_expected', val ?? 1)}
        />
      ),
    },
    {
      title: 'Цена закупа',
      dataIndex: 'buy_price',
      width: 130,
      render: (v, record) => (
        <InputNumber
          min={0}
          value={v}
          style={{ width: '100%' }}
          onChange={val => updateLine(record.key, 'buy_price', val ?? 0)}
        />
      ),
    },
    {
      title: 'Сумма',
      width: 120,
      render: (_, record) => (
        <Text>{(record.qty_expected * record.buy_price).toLocaleString('ru-RU')} ₸</Text>
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
        <Title level={4} style={{ margin: 0 }}>Новая поставка</Title>
      </div>

      <Form form={form} layout="vertical">
        <Space wrap style={{ width: '100%' }}>
          <Form.Item label="№ поставки" style={{ marginBottom: 0 }}>
            <Input value={docNumber} disabled style={{ width: 180 }} />
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
          <Form.Item name="supplier_id" label="Поставщик" rules={[{ required: true, message: 'Выберите поставщика' }]}>
            <Select
              style={{ width: 220 }}
              placeholder={selectedWarehouse ? 'Выберите поставщика' : 'Сначала выберите склад'}
              disabled={!selectedWarehouse}
              options={suppliers.map(s => ({ value: s.id, label: s.name }))}
              popupRender={menu => (
                <>
                  {menu}
                  <Divider style={{ margin: '4px 0' }} />
                  <Button
                    type="link"
                    icon={<PlusOutlined />}
                    onClick={() => setAddSupplierOpen(true)}
                    style={{ width: '100%', textAlign: 'left' }}
                  >
                    Добавить поставщика
                  </Button>
                </>
              )}
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
            <Table.Summary.Cell index={0} colSpan={3}>
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
        disabled={!selectedWarehouse}
      >
        Добавить позицию
      </Button>

      <Divider />

      <Space>
        <Button onClick={() => router.push(backPath)}>Отмена</Button>
        <Button type="primary" onClick={handleSave} loading={saving}>
          Создать поставку
        </Button>
      </Space>

      <Modal
        title="Добавить поставщика"
        open={addSupplierOpen}
        onCancel={() => setAddSupplierOpen(false)}
        onOk={handleAddSupplier}
        confirmLoading={addingSupplier}
        okText="Добавить"
        cancelText="Отмена"
      >
        <Form form={supplierForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Наименование" rules={[{ required: true, message: 'Введите наименование' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="contact" label="Контакт">
            <Input placeholder="+7 ..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
