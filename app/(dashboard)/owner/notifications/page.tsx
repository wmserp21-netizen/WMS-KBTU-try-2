'use client'

import { useEffect, useState } from 'react'
import { Form, Input, Button, Card, Typography, Alert, App } from 'antd'
import { SaveOutlined, BellOutlined } from '@ant-design/icons'
import { createClient } from '@/lib/supabase/client'

const { Title, Text, Paragraph } = Typography

export default function OwnerNotificationsPage() {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('telegram_settings')
        .select('chat_id')
        .eq('user_id', user.id)
        .single()
      if (data) form.setFieldsValue({ chat_id: data.chat_id })
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    const values = await form.validateFields()
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const { error } = await supabase
      .from('telegram_settings')
      .upsert({ user_id: user.id, chat_id: values.chat_id, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })

    if (error) message.error(error.message)
    else message.success('Chat ID сохранён')
    setSaving(false)
  }

  return (
    <div style={{ maxWidth: 500 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <BellOutlined style={{ fontSize: 24, color: '#1677ff' }} />
        <Title level={4} style={{ margin: 0 }}>Уведомления</Title>
      </div>

      <Alert
        style={{ marginBottom: 20 }}
        type="info"
        title="Telegram-уведомления о дефиците товара"
        description={
          <div style={{ marginTop: 8 }}>
            Укажите ваш Telegram Chat ID — при дефиците товара на ваших складах вы получите уведомление.
            Бот настраивается администратором системы.
            <br />
            Узнайте свой Chat ID через <Text code>@userinfobot</Text> в Telegram.
          </div>
        }
      />

      <Card>
        <Form form={form} layout="vertical">
          <Form.Item name="chat_id" label="Ваш Telegram Chat ID" rules={[{ required: true, message: 'Введите Chat ID' }]}>
            <Input placeholder="123456789" />
          </Form.Item>
          <Paragraph type="secondary" style={{ fontSize: 12 }}>
            Уведомления будут приходить только о дефиците товаров на ваших складах.
          </Paragraph>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
            Сохранить
          </Button>
        </Form>
      </Card>
    </div>
  )
}
