'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Table, Button, Input, Tag, Space, Modal, Form,
  Select, Typography, Tooltip, Popconfirm, message,
} from 'antd'
import {
  PlusOutlined, SearchOutlined, EditOutlined,
  StopOutlined, CheckCircleOutlined, UserAddOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { createClient } from '@/lib/supabase/client'
import dayjs from 'dayjs'

const { Title } = Typography

interface Client {
  id: string
  full_name: string | null
  phone: string | null
  org_name: string | null
  too_name: string | null
  bin_iin: string | null
  status: 'active' | 'blocked'
  created_at: string
  email?: string
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const supabase = createClient()

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'owner')
      .order('created_at', { ascending: false })
    setClients(data ?? [])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const filtered = clients.filter(c => {
    const q = search.toLowerCase()
    return (
      c.full_name?.toLowerCase().includes(q) ||
      c.org_name?.toLowerCase().includes(q) ||
      c.too_name?.toLowerCase().includes(q) ||
      c.bin_iin?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q)
    )
  })

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = (record: Client) => {
    setEditing(record)
    form.setFieldsValue({
      full_name: record.full_name,
      phone: record.phone,
      org_name: record.org_name,
      too_name: record.too_name,
      bin_iin: record.bin_iin,
      status: record.status,
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    const values = await form.validateFields()
    setSaving(true)

    if (!editing) {
      // Create new owner
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, role: 'owner' }),
      })
      const json = await res.json()
      if (!res.ok) { message.error(json.error); setSaving(false); return }
      message.success('Клиент создан')
    } else {
      // Update existing
      const { email: _e, created_at: _c, id: _i, ...rest } = editing
      void _e; void _c; void _i; void rest
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing.id,
          full_name: values.full_name,
          phone: values.phone ?? null,
          org_name: values.org_name ?? null,
          too_name: values.too_name ?? null,
          bin_iin: values.bin_iin ?? null,
          status: values.status,
          ...(values.password ? { password: values.password } : {}),
        }),
      })
      const json = await res.json()
      if (!res.ok) { message.error(json.error); setSaving(false); return }
      message.success('Данные обновлены')
    }

    setSaving(false)
    setModalOpen(false)
    load()
  }

  const toggleStatus = async (record: Client) => {
    const newStatus = record.status === 'active' ? 'blocked' : 'active'
    await supabase.from('profiles').update({ status: newStatus }).eq('id', record.id)
    message.success(newStatus === 'active' ? 'Клиент разблокирован' : 'Клиент заблокирован')
    load()
  }

  const columns: ColumnsType<Client> = [
    {
      title: 'ФИО',
      dataIndex: 'full_name',
      render: v => v ?? '—',
    },
    {
      title: 'Организация',
      dataIndex: 'org_name',
      render: v => v ?? '—',
    },
    {
      title: 'ТОО',
      dataIndex: 'too_name',
      render: v => v ?? '—',
    },
    {
      title: 'ИИН / БИН',
      dataIndex: 'bin_iin',
      render: v => v ?? '—',
    },
    {
      title: 'Телефон',
      dataIndex: 'phone',
      render: v => v ?? '—',
    },
    {
      title: 'Дата рег.',
      dataIndex: 'created_at',
      render: v => dayjs(v).format('DD.MM.YYYY'),
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
              title={record.status === 'active'
                ? 'Заблокировать клиента?'
                : 'Разблокировать клиента?'}
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
        <Title level={4} style={{ margin: 0 }}>Клиенты (Владельцы)</Title>
        <Button type="primary" icon={<UserAddOutlined />} onClick={openCreate}>
          Добавить клиента
        </Button>
      </div>

      <Input
        placeholder="Поиск по ФИО, организации, ИИН, телефону..."
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
        title={editing ? 'Редактировать клиента' : 'Добавить клиента'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="Сохранить"
        cancelText="Отмена"
        width={520}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="full_name" label="ФИО" rules={[{ required: true, message: 'Введите ФИО' }]}>
            <Input placeholder="Иванов Иван Иванович" />
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
                <Input placeholder="owner@example.com" />
              </Form.Item>
              <Form.Item
                name="password"
                label="Пароль"
                rules={[{ required: true, message: 'Введите пароль' }]}
              >
                <Input.Password placeholder="Минимум 6 символов" />
              </Form.Item>
            </>
          )}
          {editing && (
            <Form.Item name="password" label="Новый пароль (если нужно сменить)">
              <Input.Password placeholder="Оставьте пустым, чтобы не менять" />
            </Form.Item>
          )}
          <Form.Item name="phone" label="Телефон">
            <Input placeholder="+7 777 000 00 00" />
          </Form.Item>
          <Form.Item name="org_name" label="Наименование организации">
            <Input placeholder="ООО Ромашка" />
          </Form.Item>
          <Form.Item name="too_name" label="Название ТОО">
            <Input placeholder="ТОО Ромашка" />
          </Form.Item>
          <Form.Item name="bin_iin" label="ИИН / БИН">
            <Input placeholder="123456789012" />
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
