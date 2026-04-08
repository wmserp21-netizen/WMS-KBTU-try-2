'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Table, Button, Space, Modal, Form, Input,
  Typography, Tooltip, Popconfirm, App,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { createClient } from '@/lib/supabase/client'

interface Category {
  id: string
  name: string
  product_count?: number
}

interface Props {
  ownerId: string
}

export default function CategoriesTab({ ownerId }: Props) {
  const { message } = App.useApp()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const supabase = createClient()

  const load = useCallback(async () => {
    setLoading(true)
    const { data: cats } = await supabase
      .from('categories')
      .select('id, name')
      .eq('owner_id', ownerId)
      .order('name')

    // Count products per category
    const catIds = (cats ?? []).map(c => c.id)
    const { data: products } = catIds.length > 0
      ? await supabase.from('products').select('category_id').in('category_id', catIds)
      : { data: [] }

    const countMap: Record<string, number> = {}
    for (const p of products ?? []) {
      countMap[p.category_id] = (countMap[p.category_id] ?? 0) + 1
    }

    setCategories((cats ?? []).map(c => ({ ...c, product_count: countMap[c.id] ?? 0 })))
    setLoading(false)
  }, [ownerId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = (record: Category) => {
    setEditing(record)
    form.setFieldsValue({ name: record.name })
    setModalOpen(true)
  }

  const handleSave = async () => {
    const values = await form.validateFields()
    setSaving(true)

    if (!editing) {
      const { error } = await supabase.from('categories').insert({ name: values.name, owner_id: ownerId })
      if (error) { message.error(error.message); setSaving(false); return }
      message.success('Категория создана')
    } else {
      const { error } = await supabase.from('categories').update({ name: values.name }).eq('id', editing.id)
      if (error) { message.error(error.message); setSaving(false); return }
      message.success('Категория обновлена')
    }

    setSaving(false)
    setModalOpen(false)
    load()
  }

  const handleDelete = async (record: Category) => {
    if ((record.product_count ?? 0) > 0) {
      Modal.warning({
        title: 'Нельзя удалить',
        content: `В категории "${record.name}" есть товары (${record.product_count} шт.). Сначала удалите или перенесите товары.`,
      })
      return
    }
    const { error } = await supabase.from('categories').delete().eq('id', record.id)
    if (error) { message.error(error.message); return }
    message.success('Категория удалена')
    load()
  }

  const columns: ColumnsType<Category> = [
    { title: 'Название', dataIndex: 'name' },
    {
      title: 'Кол-во товаров',
      dataIndex: 'product_count',
      width: 150,
      render: v => v ?? 0,
    },
    {
      title: 'Действия',
      width: 100,
      render: (_, record) => (
        <Space>
          <Tooltip title="Редактировать">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          </Tooltip>
          <Tooltip title="Удалить">
            <Popconfirm
              title="Удалить категорию?"
              onConfirm={() => handleDelete(record)}
              okText="Да"
              cancelText="Нет"
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Добавить категорию
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={categories}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
        size="middle"
      />

      <Modal
        title={editing ? 'Редактировать категорию' : 'Добавить категорию'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="Сохранить"
        cancelText="Отмена"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Название" rules={[{ required: true, message: 'Введите название' }]}>
            <Input placeholder="Электроника, Одежда, ..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
