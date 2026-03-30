'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Table, Button, Input, Select, Space, Modal, Form,
  Tag, Tooltip, Popconfirm, App, Typography,
  Divider, Badge, Radio,
} from 'antd'
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  AppstoreAddOutlined, SearchOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { createClient } from '@/lib/supabase/client'

const { Text } = Typography

interface Cell {
  id: string
  warehouse_id: string
  level1: string
  level2: string
  level3: string
  level4: string | null
  code: string
  max_capacity: number | null
  status: 'active' | 'blocked'
  created_at: string
  item_count?: number
  total_qty?: number
}

interface StockCellRow {
  product_id: string
  quantity: number
  product_name: string
  product_sku: string
  product_unit: string
}

interface Props {
  warehouseId: string
  readOnly?: boolean
}

// Generate sequence of labels: numeric 001..N or alpha A,B,C,...,Z,AA,AB,...
function generateSeq(type: 'alpha' | 'numeric', count: number): string[] {
  if (type === 'numeric') {
    return Array.from({ length: count }, (_, i) => String(i + 1).padStart(3, '0'))
  }
  const result: string[] = []
  for (let i = 0; i < count; i++) {
    let n = i
    let label = ''
    do {
      label = String.fromCharCode(65 + (n % 26)) + label
      n = Math.floor(n / 26) - 1
    } while (n >= 0)
    // pad to min 1 char (level1 can be 1 char), but for levels 2-4 we pad to 3
    result.push(label)
  }
  return result
}

export default function CellsTab({ warehouseId, readOnly = false }: Props) {
  const { message } = App.useApp()
  const [cells, setCells] = useState<Cell[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [l1Filter, setL1Filter] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Cell | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkForm] = Form.useForm()

  const [expandedContents, setExpandedContents] = useState<Record<string, StockCellRow[]>>({})

  const supabase = createClient()

  const load = useCallback(async () => {
    setLoading(true)
    const { data: cellsData } = await supabase
      .from('cells')
      .select('*')
      .eq('warehouse_id', warehouseId)
      .order('level1').order('level2').order('level3').order('level4')

    if (!cellsData) { setLoading(false); return }

    const { data: scData } = await supabase
      .from('stock_cells')
      .select('cell_id, quantity')
      .eq('warehouse_id', warehouseId)
      .gt('quantity', 0)

    const countMap: Record<string, { count: number; qty: number }> = {}
    for (const sc of scData ?? []) {
      if (!countMap[sc.cell_id]) countMap[sc.cell_id] = { count: 0, qty: 0 }
      countMap[sc.cell_id].count++
      countMap[sc.cell_id].qty += Number(sc.quantity)
    }

    setCells(cellsData.map(c => ({
      ...c,
      item_count: countMap[c.id]?.count ?? 0,
      total_qty: countMap[c.id]?.qty ?? 0,
    })))
    setLoading(false)
  }, [warehouseId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const loadCellContents = async (cellId: string) => {
    if (expandedContents[cellId]) return
    const { data } = await supabase
      .from('stock_cells')
      .select('product_id, quantity, products(name, sku, unit)')
      .eq('cell_id', cellId)
      .gt('quantity', 0)

    const rows: StockCellRow[] = (data ?? []).map((r: any) => ({
      product_id: r.product_id,
      quantity: r.quantity,
      product_name: r.products?.name ?? '—',
      product_sku: r.products?.sku ?? '—',
      product_unit: r.products?.unit ?? 'шт',
    }))
    setExpandedContents(prev => ({ ...prev, [cellId]: rows }))
  }

  const level1Values = [...new Set(cells.map(c => c.level1))].sort()

  const filtered = cells.filter(c => {
    const matchSearch = !search || c.code.toLowerCase().includes(search.toLowerCase())
    const matchL1 = !l1Filter || c.level1 === l1Filter
    return matchSearch && matchL1
  })

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ status: 'active' })
    setModalOpen(true)
  }

  const openEdit = (record: Cell) => {
    setEditing(record)
    form.setFieldsValue({
      level1: record.level1,
      level2: record.level2,
      level3: record.level3,
      level4: record.level4 ?? '',
      max_capacity: record.max_capacity,
      status: record.status,
    })
    setModalOpen(true)
  }

  const padLevel = (v: string, isFirst: boolean) => {
    const t = v.trim()
    if (isFirst) return t.toUpperCase()
    // numeric → pad to 3, alpha → pad to 3 with leading char repeat or just return as is
    return /^\d+$/.test(t) ? t.padStart(3, '0') : t.toUpperCase().padStart(3, 'A').slice(-3)
  }

  const handleSave = async () => {
    const values = await form.validateFields()
    setSaving(true)

    const payload = {
      warehouse_id: warehouseId,
      level1: padLevel(values.level1, true),
      level2: padLevel(values.level2, false),
      level3: padLevel(values.level3, false),
      level4: values.level4?.trim() ? padLevel(values.level4, false) : null,
      max_capacity: values.max_capacity ?? null,
      status: values.status,
    }

    if (!editing) {
      const { error } = await supabase.from('cells').insert(payload)
      if (error) {
        message.error(error.message.includes('unique') ? 'Ячейка с таким адресом уже существует' : error.message)
        setSaving(false); return
      }
      message.success('Ячейка создана')
    } else {
      const { error } = await supabase.from('cells').update(payload).eq('id', editing.id)
      if (error) { message.error(error.message); setSaving(false); return }
      message.success('Ячейка обновлена')
    }

    setSaving(false); setModalOpen(false); load()
  }

  const handleDelete = async (record: Cell) => {
    if ((record.item_count ?? 0) > 0) {
      message.error('Нельзя удалить ячейку с товаром.')
      return
    }
    const { error } = await supabase.from('cells').delete().eq('id', record.id)
    if (error) { message.error(error.message); return }
    message.success('Ячейка удалена')
    load()
  }

  const handleBulk = async () => {
    const v = await bulkForm.validateFields()
    setBulkSaving(true)

    const l1Type: 'alpha' | 'numeric' = v.l1_type
    const l2Type: 'alpha' | 'numeric' = v.l2_type
    const l3Type: 'alpha' | 'numeric' = v.l3_type
    const l4Type: 'alpha' | 'numeric' | null = v.use_level4 ? v.l4_type : null

    const l1List = generateSeq(l1Type, Number(v.l1_count))
    const l2List = generateSeq(l2Type, Number(v.l2_count)).map(s => s.padStart(3, '0').slice(-3))
    const l3List = generateSeq(l3Type, Number(v.l3_count)).map(s => s.padStart(3, '0').slice(-3))
    const l4List = l4Type ? generateSeq(l4Type, Number(v.l4_count)).map(s => s.padStart(3, '0').slice(-3)) : [null]

    const rows: object[] = []
    for (const l1 of l1List) {
      for (const l2 of l2List) {
        for (const l3 of l3List) {
          for (const l4 of l4List) {
            rows.push({ warehouse_id: warehouseId, level1: l1, level2: l2, level3: l3, level4: l4, status: 'active' })
          }
        }
      }
    }

    const CHUNK = 500
    let errorOccurred = false
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase.from('cells').insert(rows.slice(i, i + CHUNK))
      if (error) {
        message.error(error.message.includes('unique') ? 'Часть ячеек уже существует — пропущены дубликаты' : error.message)
        errorOccurred = true; break
      }
    }

    if (!errorOccurred) message.success(`Создано ${rows.length} ячеек`)
    setBulkSaving(false)
    setBulkOpen(false)
    bulkForm.resetFields()
    load()
  }

  const columns: ColumnsType<Cell> = [
    {
      title: 'Адрес',
      dataIndex: 'code',
      width: 150,
      render: (code: string) => (
        <Text strong style={{ fontFamily: 'monospace', fontSize: 13 }}>{code}</Text>
      ),
    },
    { title: 'Уровень 1', dataIndex: 'level1', width: 90, render: v => <Tag color="blue">{v}</Tag> },
    { title: 'Уровень 2', dataIndex: 'level2', width: 90 },
    { title: 'Уровень 3', dataIndex: 'level3', width: 90 },
    {
      title: 'Уровень 4',
      dataIndex: 'level4',
      width: 90,
      render: v => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: 'Товаров',
      width: 120,
      render: (_: unknown, r: Cell) => (
        <Space size={4}>
          <Badge count={r.item_count} showZero color={r.item_count ? '#52c41a' : '#d9d9d9'} />
          {r.item_count ? <Text type="secondary" style={{ fontSize: 12 }}>({r.total_qty} ед.)</Text> : null}
        </Space>
      ),
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      width: 120,
      render: (s: string) => (
        <Tag color={s === 'active' ? 'green' : 'red'}>{s === 'active' ? 'Активна' : 'Заблокирована'}</Tag>
      ),
    },
    ...(!readOnly ? [{
      title: '',
      width: 90,
      render: (_: unknown, record: Cell) => (
        <Space>
          <Tooltip title="Редактировать">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          </Tooltip>
          <Tooltip title={(record.item_count ?? 0) > 0 ? 'Есть товар' : 'Удалить'}>
            <Popconfirm title="Удалить ячейку?" onConfirm={() => handleDelete(record)} okText="Да" cancelText="Нет" disabled={(record.item_count ?? 0) > 0}>
              <Button size="small" danger icon={<DeleteOutlined />} disabled={(record.item_count ?? 0) > 0} />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    }] : []),
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Space wrap>
          <Input
            placeholder="Поиск по адресу..."
            prefix={<SearchOutlined />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            allowClear
            style={{ width: 200 }}
          />
          <Select
            placeholder="Уровень 1"
            allowClear
            value={l1Filter}
            onChange={setL1Filter}
            style={{ width: 120 }}
            options={level1Values.map(v => ({ value: v, label: v }))}
          />
        </Space>
        {!readOnly && (
          <Space>
            <Button icon={<AppstoreAddOutlined />} onClick={() => { bulkForm.resetFields(); setBulkOpen(true) }}>
              Создать группу
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Добавить ячейку
            </Button>
          </Space>
        )}
      </div>

      <Table
        columns={columns}
        dataSource={filtered}
        rowKey="id"
        loading={loading}
        size="middle"
        pagination={{ pageSize: 50, showTotal: total => `Всего: ${total} ячеек` }}
        expandable={{
          expandedRowRender: (record) => {
            const items = expandedContents[record.id]
            if (!items) return <Text type="secondary">Загрузка...</Text>
            if (items.length === 0) return <Text type="secondary">Ячейка пуста</Text>
            return (
              <Table
                dataSource={items}
                rowKey="product_id"
                size="small"
                pagination={false}
                style={{ margin: '0 48px' }}
                columns={[
                  { title: 'SKU', dataIndex: 'product_sku', width: 100 },
                  { title: 'Товар', dataIndex: 'product_name' },
                  { title: 'Количество', dataIndex: 'quantity', width: 120, render: (q: number, r: StockCellRow) => `${q} ${r.product_unit}` },
                ]}
              />
            )
          },
          onExpand: (expanded, record) => { if (expanded) loadCellContents(record.id) },
          rowExpandable: (record) => (record.item_count ?? 0) > 0,
        }}
      />

      {/* Single cell modal */}
      <Modal
        title={editing ? 'Редактировать ячейку' : 'Добавить ячейку'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="Сохранить"
        cancelText="Отмена"
        width={460}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <div style={{ background: '#f5f5f5', padding: '8px 12px', borderRadius: 6, marginBottom: 16, fontSize: 12, color: '#666' }}>
            Формат адреса: <strong>A-001-001</strong> или <strong>A-001-001-001</strong> — уровень 1 свободный, уровни 2–4 минимум 3 символа.
          </div>
          <Space style={{ width: '100%' }} size={8} align="start">
            <Form.Item name="level1" label="Ур. 1" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Input placeholder="A" maxLength={10} style={{ textTransform: 'uppercase', width: 70 }} />
            </Form.Item>
            <Form.Item name="level2" label="Ур. 2" rules={[{ required: true }, { min: 1 }]} style={{ flex: 1 }}>
              <Input placeholder="001" maxLength={3} style={{ width: 70 }} />
            </Form.Item>
            <Form.Item name="level3" label="Ур. 3" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Input placeholder="001" maxLength={3} style={{ width: 70 }} />
            </Form.Item>
            <Form.Item name="level4" label="Ур. 4 (необяз.)" style={{ flex: 1 }}>
              <Input placeholder="001" maxLength={3} style={{ width: 90 }} />
            </Form.Item>
          </Space>
          <Form.Item name="status" label="Статус" initialValue="active">
            <Select options={[{ value: 'active', label: 'Активна' }, { value: 'blocked', label: 'Заблокирована' }]} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Bulk create modal */}
      <Modal
        title="Массовое создание ячеек"
        open={bulkOpen}
        onCancel={() => setBulkOpen(false)}
        onOk={handleBulk}
        confirmLoading={bulkSaving}
        okText="Создать"
        cancelText="Отмена"
        width={500}
      >
        <Form form={bulkForm} layout="vertical" style={{ marginTop: 16 }}>
          <BulkLevelRow form={bulkForm} level={1} label="Уровень 1" defaultType="alpha" defaultCount={3} />
          <BulkLevelRow form={bulkForm} level={2} label="Уровень 2" defaultType="numeric" defaultCount={5} />
          <BulkLevelRow form={bulkForm} level={3} label="Уровень 3" defaultType="numeric" defaultCount={4} />

          <Divider style={{ margin: '8px 0' }} />
          <Form.Item name="use_level4" label="Добавить 4-й уровень?" initialValue={false}>
            <Radio.Group>
              <Radio value={false}>Нет (3 уровня)</Radio>
              <Radio value={true}>Да (4 уровня)</Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(p, c) => p.use_level4 !== c.use_level4}>
            {({ getFieldValue }) => getFieldValue('use_level4') ? (
              <BulkLevelRow form={bulkForm} level={4} label="Уровень 4" defaultType="numeric" defaultCount={3} />
            ) : null}
          </Form.Item>

          <Divider style={{ margin: '8px 0' }} />
          <Form.Item noStyle shouldUpdate>
            {({ getFieldsValue }) => {
              const v = getFieldsValue()
              const total = (v.l1_count || 1) * (v.l2_count || 1) * (v.l3_count || 1) * (v.use_level4 ? (v.l4_count || 1) : 1)
              return <Text type="secondary">Будет создано: <strong>{total}</strong> ячеек</Text>
            }}
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

function BulkLevelRow({ form: _form, level, label, defaultType, defaultCount }: {
  form: ReturnType<typeof Form.useForm>[0]
  level: number
  label: string
  defaultType: 'alpha' | 'numeric'
  defaultCount: number
}) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 8 }}>
      <Form.Item label={label} name={`l${level}_count`} initialValue={defaultCount} style={{ marginBottom: 0, flex: 1 }}>
        <Input type="number" min={1} max={999} placeholder="Кол-во" />
      </Form.Item>
      <Form.Item label="Тип" name={`l${level}_type`} initialValue={defaultType} style={{ marginBottom: 0, flex: 1 }}>
        <Select options={[{ value: 'alpha', label: 'Буквенный (A, B, C...)' }, { value: 'numeric', label: 'Числовой (001, 002...)' }]} />
      </Form.Item>
    </div>
  )
}
