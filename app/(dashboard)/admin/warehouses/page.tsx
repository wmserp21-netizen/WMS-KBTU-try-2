'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Table, Button, Input, Tag, Space, Modal, Form,
  Select, Typography, Tooltip, message, Badge,
} from 'antd'
import {
  PlusOutlined, SearchOutlined, EditOutlined, BankOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { createClient } from '@/lib/supabase/client'

const { Title } = Typography

interface Warehouse {
  id: string
  name: string
  address: string | null
  status: 'active' | 'closed'
  owner_id: string
  owner_name?: string
  worker_count?: number
}

interface Owner { id: string; full_name: string | null }
interface Worker { id: string; full_name: string | null; warehouse_id?: string | null }

export default function AdminWarehousesPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [owners, setOwners] = useState<Owner[]>([])
  const [freeWorkers, setFreeWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Warehouse | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()
  const [selectedOwner, setSelectedOwner] = useState<string | null>(null)

  const supabase = createClient()

  const load = useCallback(async () => {
    setLoading(true)

    const { data: whs } = await supabase
      .from('warehouses')
      .select('*')
      .order('created_at', { ascending: false })

    const { data: ownerProfiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'owner')

    const { data: assignments } = await supabase
      .from('warehouse_workers')
      .select('warehouse_id, worker_id')

    const workerCountMap: Record<string, number> = {}
    const workerWarehouseMap: Record<string, string> = {}
    for (const a of assignments ?? []) {
      workerCountMap[a.warehouse_id] = (workerCountMap[a.warehouse_id] ?? 0) + 1
      workerWarehouseMap[a.worker_id] = a.warehouse_id
    }

    const ownerMap: Record<string, string> = {}
    for (const o of ownerProfiles ?? []) {
      ownerMap[o.id] = o.full_name ?? o.id
    }

    setWarehouses((whs ?? []).map(w => ({
      ...w,
      owner_name: ownerMap[w.owner_id] ?? '—',
      worker_count: workerCountMap[w.id] ?? 0,
    })))

    setOwners(ownerProfiles ?? [])

    // All workers
    const { data: allWorkers } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'worker')

    setFreeWorkers((allWorkers ?? []).map(w => ({
      ...w,
      warehouse_id: workerWarehouseMap[w.id] ?? null,
    })))

    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const filtered = warehouses.filter(w => {
    const q = search.toLowerCase()
    return (
      w.name.toLowerCase().includes(q) ||
      w.address?.toLowerCase().includes(q) ||
      w.owner_name?.toLowerCase().includes(q)
    )
  })

  const openCreate = () => {
    setEditing(null)
    setSelectedOwner(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = async (record: Warehouse) => {
    setEditing(record)
    setSelectedOwner(record.owner_id)

    // Get current workers for this warehouse
    const { data: currentWorkers } = await supabase
      .from('warehouse_workers')
      .select('worker_id')
      .eq('warehouse_id', record.id)

    form.setFieldsValue({
      name: record.name,
      address: record.address,
      owner_id: record.owner_id,
      status: record.status,
      worker_ids: (currentWorkers ?? []).map(w => w.worker_id),
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    const values = await form.validateFields()
    setSaving(true)

    let warehouseId = editing?.id

    if (!editing) {
      const { data, error } = await supabase
        .from('warehouses')
        .insert({
          name: values.name,
          address: values.address ?? null,
          owner_id: values.owner_id,
          status: values.status ?? 'active',
        })
        .select('id')
        .single()

      if (error) { message.error(error.message); setSaving(false); return }
      warehouseId = data.id
    } else {
      const { error } = await supabase
        .from('warehouses')
        .update({
          name: values.name,
          address: values.address ?? null,
          owner_id: values.owner_id,
          status: values.status,
        })
        .eq('id', editing.id)
      if (error) { message.error(error.message); setSaving(false); return }
    }

    // Update worker assignments
    await supabase.from('warehouse_workers').delete().eq('warehouse_id', warehouseId!)

    const workerIds: string[] = values.worker_ids ?? []
    if (workerIds.length > 0) {
      await supabase.from('warehouse_workers').insert(
        workerIds.map(wid => ({ warehouse_id: warehouseId!, worker_id: wid }))
      )
    }

    message.success(editing ? 'Склад обновлён' : 'Склад создан')
    setSaving(false)
    setModalOpen(false)
    load()
  }

  // Workers available for selection: free workers + current warehouse workers
  const availableWorkers = freeWorkers.filter(w =>
    w.warehouse_id === null ||
    w.warehouse_id === editing?.id
  )

  const columns: ColumnsType<Warehouse> = [
    { title: 'Наименование', dataIndex: 'name' },
    { title: 'Адрес', dataIndex: 'address', render: v => v ?? '—' },
    { title: 'Владелец', dataIndex: 'owner_name' },
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
    {
      title: 'Действия',
      width: 80,
      render: (_, record) => (
        <Space>
          <Tooltip title="Редактировать">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          </Tooltip>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Склады</Title>
        <Button type="primary" icon={<BankOutlined />} onClick={openCreate}>
          Добавить склад
        </Button>
      </div>

      <Input
        placeholder="Поиск по наименованию, адресу, владельцу..."
        prefix={<SearchOutlined />}
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ marginBottom: 16, maxWidth: 400 }}
        allowClear
      />

      <Table
        columns={columns}
        dataSource={filtered}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20, showTotal: total => `Всего: ${total}` }}
        size="middle"
      />

      <Modal
        title={editing ? 'Редактировать склад' : 'Добавить склад'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="Сохранить"
        cancelText="Отмена"
        width={520}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Наименование" rules={[{ required: true, message: 'Введите наименование' }]}>
            <Input placeholder="Склад №1" />
          </Form.Item>
          <Form.Item name="address" label="Адрес">
            <Input placeholder="г. Алматы, ул. Примерная 1" />
          </Form.Item>
          <Form.Item name="owner_id" label="Владелец" rules={[{ required: true, message: 'Выберите владельца' }]}>
            <Select
              placeholder="Выберите владельца"
              options={owners.map(o => ({ value: o.id, label: o.full_name ?? o.id }))}
              onChange={v => { setSelectedOwner(v); form.setFieldValue('worker_ids', []) }}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item name="worker_ids" label="Рабочие">
            <Select
              mode="multiple"
              placeholder="Выберите рабочих"
              disabled={!selectedOwner}
              options={availableWorkers.map(w => ({ value: w.id, label: w.full_name ?? w.id }))}
              optionFilterProp="label"
              showSearch
            />
          </Form.Item>
          <Form.Item name="status" label="Статус" initialValue="active">
            <Select options={[
              { value: 'active', label: 'Активен' },
              { value: 'closed', label: 'Закрыт' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
