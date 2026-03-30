'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Table, Button, Input, Select, Space, Drawer, Form,
  InputNumber, Tag, Tooltip, Popconfirm, Upload, App,
} from 'antd'
import {
  PlusOutlined, SearchOutlined, EditOutlined,
  DeleteOutlined, UploadOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { createClient } from '@/lib/supabase/client'

const { TextArea } = Input

interface Category { id: string; name: string }

interface StockRow {
  warehouse_id: string
  quantity: number
  warehouse_name: string
}


interface Product {
  id: string
  sku: string
  name: string
  category_id: string
  category_name?: string
  unit: string
  buy_price: number
  sell_price: number
  min_stock: number
  description: string | null
  image_url: string | null
  stock?: StockRow[]
}

interface Props {
  ownerId: string
  readOnly?: boolean
}

const UNIT_OPTIONS = [
  { value: 'шт', label: 'шт' },
  { value: 'кг', label: 'кг' },
  { value: 'л', label: 'л' },
  { value: 'м', label: 'м' },
  { value: 'уп', label: 'уп' },
]

export default function ProductsTab({ ownerId, readOnly = false }: Props) {
  const { message } = App.useApp()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [form] = Form.useForm()

  const supabase = createClient()

  const loadCategories = useCallback(async () => {
    const { data } = await supabase
      .from('categories')
      .select('id, name')
      .eq('owner_id', ownerId)
      .order('name')
    setCategories(data ?? [])
  }, [ownerId]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadProducts = useCallback(async () => {
    setLoading(true)
    const catIds = categories.map(c => c.id)
    if (catIds.length === 0) { setProducts([]); setLoading(false); return }

    const query = supabase
      .from('products')
      .select('*')
      .in('category_id', catIds)
      .order('name')

    const { data: prods } = await query

    const { data: stockData } = await supabase
      .from('stock')
      .select('product_id, warehouse_id, quantity, warehouses(name)')
      .in('product_id', (prods ?? []).map(p => p.id))

    const stockMap: Record<string, StockRow[]> = {}
    for (const s of stockData ?? []) {
      if (!stockMap[s.product_id]) stockMap[s.product_id] = []
      stockMap[s.product_id].push({
        warehouse_id: s.warehouse_id,
        quantity: s.quantity,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        warehouse_name: (s.warehouses as any)?.name ?? '—',
      })
    }

    const catMap: Record<string, string> = {}
    for (const c of categories) catMap[c.id] = c.name

    setProducts((prods ?? []).map(p => ({
      ...p,
      category_name: catMap[p.category_id] ?? '—',
      stock: stockMap[p.id] ?? [],
    })))
    setLoading(false)
  }, [categories]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadCategories() }, [loadCategories])
  useEffect(() => { if (categories.length >= 0) loadProducts() }, [categories]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = products.filter(p => {
    const q = search.toLowerCase()
    const matchSearch = p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    const matchCat = !catFilter || p.category_id === catFilter
    return matchSearch && matchCat
  })

  const openCreate = () => {
    setEditing(null)
    setImageUrl(null)
    form.resetFields()
    setDrawerOpen(true)
  }

  const openEdit = (record: Product) => {
    setEditing(record)
    setImageUrl(record.image_url)
    form.setFieldsValue({
      sku: record.sku,
      name: record.name,
      category_id: record.category_id,
      unit: record.unit,
      buy_price: record.buy_price,
      sell_price: record.sell_price,
      min_stock: record.min_stock,
      description: record.description,
    })
    setDrawerOpen(true)
  }

  const handleImageUpload = async (file: File): Promise<boolean> => {
    setUploadingImage(true)
    const ext = file.name.split('.').pop()
    const path = `products/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('products').upload(path, file)
    if (error) { message.error(error.message); setUploadingImage(false); return false }
    const { data: urlData } = supabase.storage.from('products').getPublicUrl(path)
    setImageUrl(urlData.publicUrl)
    setUploadingImage(false)
    return false // prevent default upload
  }

  const handleSave = async () => {
    const values = await form.validateFields()
    setSaving(true)

    const sku = values.sku?.trim() || `SKU-${Date.now()}`

    if (!editing) {
      const { error } = await supabase.from('products').insert({
        sku,
        name: values.name,
        category_id: values.category_id,
        unit: values.unit ?? 'шт',
        buy_price: values.buy_price ?? 0,
        sell_price: values.sell_price ?? 0,
        min_stock: values.min_stock ?? 0,
        description: values.description ?? null,
        image_url: imageUrl ?? null,
      })
      if (error) { message.error(error.message); setSaving(false); return }
      message.success('Товар создан')
    } else {
      const { error } = await supabase.from('products').update({
        sku,
        name: values.name,
        category_id: values.category_id,
        unit: values.unit,
        buy_price: values.buy_price ?? 0,
        sell_price: values.sell_price ?? 0,
        min_stock: values.min_stock ?? 0,
        description: values.description ?? null,
        image_url: imageUrl ?? null,
      }).eq('id', editing.id)
      if (error) { message.error(error.message); setSaving(false); return }
      message.success('Товар обновлён')
    }

    setSaving(false)
    setDrawerOpen(false)
    loadProducts()
  }

  const handleDelete = async (record: Product) => {
    const { error } = await supabase.from('products').delete().eq('id', record.id)
    if (error) { message.error(error.message); return }
    message.success('Товар удалён')
    loadProducts()
  }

  const [cellsByWarehouseProduct, setCellsByWarehouseProduct] = useState<Record<string, { code: string; quantity: number; cell_id: string }[]>>({})

  const loadCellsForProduct = async (productId: string, warehouseId: string) => {
    const key = `${productId}__${warehouseId}`
    if (cellsByWarehouseProduct[key]) return
    const { data } = await supabase
      .from('stock_cells')
      .select('cell_id, quantity, cells(code)')
      .eq('product_id', productId)
      .eq('warehouse_id', warehouseId)
      .gt('quantity', 0)
    const rows = (data ?? []).map((r: any) => ({
      cell_id: r.cell_id,
      code: r.cells?.code ?? '—',
      quantity: r.quantity,
    }))
    setCellsByWarehouseProduct(prev => ({ ...prev, [key]: rows }))
  }

  const expandedRowRender = (record: Product) => {
    const stockCols: ColumnsType<StockRow> = [
      { title: 'Склад', dataIndex: 'warehouse_name' },
      { title: 'Остаток', dataIndex: 'quantity' },
      {
        title: 'Статус',
        width: 110,
        render: (_, row) => (
          row.quantity < record.min_stock
            ? <Tag color="orange">Пополнить</Tag>
            : <Tag color="green">В норме</Tag>
        ),
      },
    ]
    return (
      <Table
        columns={stockCols}
        dataSource={record.stock ?? []}
        rowKey="warehouse_id"
        pagination={false}
        size="small"
        expandable={{
          expandedRowRender: (row: StockRow) => {
            const key = `${record.id}__${row.warehouse_id}`
            const cellRows = cellsByWarehouseProduct[key]
            if (!cellRows) return <span style={{ color: '#999', fontSize: 12 }}>Загрузка ячеек...</span>
            if (cellRows.length === 0) return <span style={{ color: '#999', fontSize: 12 }}>Ячейки не назначены</span>
            return (
              <Table
                dataSource={cellRows}
                rowKey="cell_id"
                size="small"
                pagination={false}
                style={{ margin: '0 48px' }}
                columns={[
                  { title: 'Ячейка', dataIndex: 'code', width: 110, render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span> },
                  { title: 'Количество', dataIndex: 'quantity', width: 110 },
                ]}
              />
            )
          },
          onExpand: (expanded, row: StockRow) => {
            if (expanded) loadCellsForProduct(record.id, row.warehouse_id)
          },
          rowExpandable: () => true,
        }}
      />
    )
  }

  const columns: ColumnsType<Product> = [
    { title: 'Артикул', dataIndex: 'sku', width: 130 },
    { title: 'Наименование', dataIndex: 'name' },
    { title: 'Категория', dataIndex: 'category_name' },
    { title: 'Ед. изм.', dataIndex: 'unit', width: 80 },
    {
      title: 'Цена закупа',
      dataIndex: 'buy_price',
      render: v => v.toLocaleString('ru-RU'),
    },
    {
      title: 'Цена продажи',
      dataIndex: 'sell_price',
      render: v => v.toLocaleString('ru-RU'),
    },
    { title: 'Мин. остаток', dataIndex: 'min_stock', width: 120 },
    ...(!readOnly ? [{
      title: 'Действия',
      width: 100,
      render: (_: unknown, record: Product) => (
        <Space>
          <Tooltip title="Редактировать">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          </Tooltip>
          <Tooltip title="Удалить">
            <Popconfirm
              title="Удалить товар?"
              onConfirm={() => handleDelete(record)}
              okText="Да"
              cancelText="Нет"
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    }] : []),
  ]

  return (
    <div>
      <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
        <Space>
          <Select
            placeholder="Все категории"
            allowClear
            style={{ width: 200 }}
            options={categories.map(c => ({ value: c.id, label: c.name }))}
            onChange={v => setCatFilter(v ?? null)}
          />
          <Input
            placeholder="Поиск по названию, артикулу..."
            prefix={<SearchOutlined />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />
        </Space>
        {!readOnly && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Добавить товар
          </Button>
        )}
      </Space>

      <Table
        columns={columns}
        dataSource={filtered}
        rowKey="id"
        loading={loading}
        expandable={{ expandedRowRender }}
        pagination={{ pageSize: 20, showTotal: total => `Всего: ${total}` }}
        size="middle"
      />

      <Drawer
        title={editing ? 'Редактировать товар' : 'Добавить товар'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        size="large"
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>Отмена</Button>
            <Button type="primary" onClick={handleSave} loading={saving}>
              Сохранить
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="sku" label="Артикул">
            <Input placeholder="Авто если пусто" />
          </Form.Item>
          <Form.Item name="name" label="Наименование" rules={[{ required: true, message: 'Введите наименование' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="category_id" label="Категория" rules={[{ required: true, message: 'Выберите категорию' }]}>
            <Select
              options={categories.map(c => ({ value: c.id, label: c.name }))}
              showSearch={{
                filterOption: (input, option) =>
                  String(option?.label ?? '').toLowerCase().includes(input.toLowerCase()),
              }}
            />
          </Form.Item>
          <Form.Item name="unit" label="Единица измерения" initialValue="шт">
            <Select options={UNIT_OPTIONS} />
          </Form.Item>
          <Form.Item name="buy_price" label="Цена закупа">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="sell_price" label="Цена продажи">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="min_stock" label="Мин. остаток">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <TextArea rows={3} />
          </Form.Item>
          <Form.Item label="Фото товара">
            <Upload
              accept="image/*"
              showUploadList={false}
              beforeUpload={file => { handleImageUpload(file); return false }}
            >
              <Button icon={<UploadOutlined />} loading={uploadingImage}>
                Загрузить фото
              </Button>
            </Upload>
            {imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="preview" style={{ marginTop: 8, maxWidth: 200, borderRadius: 4 }} />
            )}
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  )
}
