'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Table, Button, Input, Tag, Space, Modal, Form,
  Select, Typography, Tooltip, Popconfirm, App,
} from 'antd'
import {
  PlusOutlined, SearchOutlined, EditOutlined,
  StopOutlined, CheckCircleOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { createClient } from '@/lib/supabase/client'

const { Title } = Typography

interface Employee {
  id: string
  full_name: string | null
  phone: string | null
  status: 'active' | 'blocked'
  created_at: string
  warehouse_name?: string | null
  warehouse_id?: string | null
}

interface Warehouse {
  id: string
  name: string
}

interface Props {
  viewerRole: 'admin' | 'owner'
}

export default function EmployeesTable({ viewerRole }: Props) {
  const { message } = App.useApp()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const supabase = createClient()

  const load = useCallback(async () => {
    setLoading(true)

    // Load available warehouses for selection
    const { data: whData } = await supabase
      .from('warehouses')
      .select('id, name')
      .eq('status', 'active')
      .order('name')
    setWarehouses(whData ?? [])

    // Get workers with their warehouse assignment
    const { data: workers } = await supabase
      .from('profiles')
      .select('id, full_name, phone, status, created_at')
      .eq('role', 'worker')
      .order('created_at', { ascending: false })

    if (!workers) { setLoading(false); return }

    // Get warehouse assignments
    const { data: assignments } = await supabase
      .from('warehouse_workers')
      .select('worker_id, warehouse_id, warehouses(name)')

    const assignMap: Record<string, { name: string; id: string }> = {}
    if (assignments) {
      for (const a of assignments) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wh = a.warehouses as any
        assignMap[a.worker_id] = { name: wh?.name ?? '', id: (a as any).warehouse_id ?? '' }
      }
    }

    if (viewerRole === 'owner') {
      // Filter workers assigned to owner's warehouses
      const { data: myWarehouses } = await supabase
        .from('warehouses')
        .select('id')

      const myWarehouseIds = new Set((myWarehouses ?? []).map(w => w.id))

      const { data: myAssignments } = await supabase
        .from('warehouse_workers')
        .select('worker_id')
        .in('warehouse_id', [...myWarehouseIds])

      const myWorkerIds = new Set((myAssignments ?? []).map(a => a.worker_id))

      // Also include workers not yet assigned (created by this owner — we can't filter by creator, so show all unassigned + mine)
      const filtered = workers.filter(w => myWorkerIds.has(w.id))
      setEmployees(filtered.map(w => ({ ...w, warehouse_name: assignMap[w.id]?.name ?? null, warehouse_id: assignMap[w.id]?.id ?? null })))
    } else {
      setEmployees(workers.map(w => ({ ...w, warehouse_name: assignMap[w.id]?.name ?? null, warehouse_id: assignMap[w.id]?.id ?? null })))
    }

    setLoading(false)
  }, [viewerRole]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const filtered = employees.filter(e => {
    const q = search.toLowerCase()
    return (
      e.full_name?.toLowerCase().includes(q) ||
      e.phone?.toLowerCase().includes(q) ||
      e.warehouse_name?.toLowerCase().includes(q)
    )
  })

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = (record: Employee) => {
    setEditing(record)
    form.setFieldsValue({
      full_name: record.full_name,
      phone: record.phone,
      status: record.status,
      warehouse_id: record.warehouse_id ?? undefined,
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    const values = await form.validateFields()
    setSaving(true)

    if (!editing) {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, role: 'worker' }),
      })
      const json = await res.json()
      if (!res.ok) { message.error(json.error); setSaving(false); return }
      message.success('Сотрудник создан')
    } else {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing.id,
          full_name: values.full_name,
          phone: values.phone ?? null,
          status: values.status,
          ...(values.password ? { password: values.password } : {}),
        }),
      })
      const json = await res.json()
      if (!res.ok) { message.error(json.error); setSaving(false); return }

      // Update warehouse assignment
      await supabase.from('warehouse_workers').delete().eq('worker_id', editing.id)
      if (values.warehouse_id) {
        await supabase.from('warehouse_workers').insert({
          warehouse_id: values.warehouse_id,
          worker_id: editing.id,
        })
      }
      message.success('Данные обновлены')
    }

    setSaving(false)
    setModalOpen(false)
    load()
  }

  const toggleStatus = async (record: Employee) => {
    const newStatus = record.status === 'active' ? 'blocked' : 'active'
    await supabase.from('profiles').update({ status: newStatus }).eq('id', record.id)
    message.success(newStatus === 'active' ? 'Сотрудник разблокирован' : 'Сотрудник заблокирован')
    load()
  }

  const columns: ColumnsType<Employee> = [
    { title: 'ФИО', dataIndex: 'full_name', render: v => v ?? '—' },
    { title: 'Телефон', dataIndex: 'phone', render: v => v ?? '—' },
    {
      title: 'Привязанный склад',
      dataIndex: 'warehouse_name',
      render: v => v ? <Tag color="blue">{v}</Tag> : <Tag color="default">Не назначен</Tag>,
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      render: (v: 'active' | 'blocked') => (
        <Tag color={v === 'active' ? 'green' : 'red'}>
          {v === 'active' ? 'Активен' : 'Заблокирован'}
        </Tag>
      ),
    },
    {
      title: 'Действия',
      width: 120,
      render: (_, record) => (
        <Space>
          <Tooltip title="Редактировать">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          </Tooltip>
          <Tooltip title={record.status === 'active' ? 'Заблокировать' : 'Разблокировать'}>
            <Popconfirm
              title={record.status === 'active' ? 'Заблокировать сотрудника?' : 'Разблокировать?'}
              onConfirm={() => toggleStatus(record)}
              okText="Да"
              cancelText="Нет"
            >
              <Button
                size="small"
                danger={record.status === 'active'}
                icon={record.status === 'active' ? <StopOutlined /> : <CheckCircleOutlined />}
              />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Сотрудники</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Добавить сотрудника
        </Button>
      </div>

      <Input
        placeholder="Поиск по ФИО, телефону, складу..."
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
        title={editing ? 'Редактировать сотрудника' : 'Добавить сотрудника'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="Сохранить"
        cancelText="Отмена"
        width={480}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="full_name" label="ФИО" rules={[{ required: true, message: 'Введите ФИО' }]}>
            <Input placeholder="Петров Пётр Петрович" />
          </Form.Item>
          {!editing && (
            <>
              <Form.Item
                name="email"
                label="Email"
                rules={[
                  { required: true, message: 'Введите email' },
                  { type: 'email', message: 'Некорректный email' },
                ]}
              >
                <Input placeholder="worker@example.com" />
              </Form.Item>
              <Form.Item
                name="password"
                label="Пароль"
                rules={[{ required: true, message: 'Введите пароль' }]}
              >
                <Input.Password />
              </Form.Item>
            </>
          )}
          {editing && (
            <Form.Item name="password" label="Новый пароль (оставьте пустым, чтобы не менять)">
              <Input.Password />
            </Form.Item>
          )}
          <Form.Item name="phone" label="Телефон">
            <Input placeholder="+7 777 000 00 00" />
          </Form.Item>
          <Form.Item name="warehouse_id" label="Склад">
            <Select
              placeholder="Выберите склад"
              allowClear
              options={warehouses.map(w => ({ value: w.id, label: w.name }))}
              showSearch
              filterOption={(input, opt) =>
                String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
          <Form.Item name="status" label="Статус" initialValue="active">
            <Select options={[
              { value: 'active', label: 'Активен' },
              { value: 'blocked', label: 'Заблокирован' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
