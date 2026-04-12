'use client'

import { useEffect, useState } from 'react'
import { Form, Input, Button, Card, Typography, Alert, App, Space } from 'antd'
import { SaveOutlined, BellOutlined } from '@ant-design/icons'
import { createClient } from '@/lib/supabase/client'

const { Title, Text, Paragraph } = Typography

export default function AdminNotificationsPage() {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('telegram_settings')
        .select('bot_token, chat_id')
        .eq('user_id', user.id)
        .single()
      if (data) form.setFieldsValue({ bot_token: data.bot_token ?? '', chat_id: data.chat_id })
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
      .upsert({ user_id: user.id, bot_token: values.bot_token, chat_id: values.chat_id, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })

    if (error) message.error(error.message)
    else message.success('Настройки сохранены')
    setSaving(false)
  }

  const handleTest = async () => {
    const values = form.getFieldsValue()
    if (!values.bot_token || !values.chat_id) { message.warning('Заполните токен и Chat ID'); return }
    setTesting(true)
    const url = `https://api.telegram.org/bot${values.bot_token}/sendMessage`
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: values.chat_id, text: '✅ Тестовое уведомление из WMS ERP. Бот настроен корректно!', parse_mode: 'HTML' }),
      })
      const json = await res.json()
      if (json.ok) message.success('Тестовое сообщение отправлено!')
      else message.error(`Ошибка Telegram: ${json.description}`)
    } catch {
      message.error('Не удалось подключиться к Telegram')
    }
    setTesting(false)
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <BellOutlined style={{ fontSize: 24, color: '#1677ff' }} />
        <Title level={4} style={{ margin: 0 }}>Уведомления</Title>
      </div>

      <Alert
        style={{ marginBottom: 20 }}
        type="info"
        title="Как настроить Telegram-бот"
        description={
          <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            <li>Напишите <Text code>@BotFather</Text> в Telegram</li>
            <li>Отправьте команду <Text code>/newbot</Text> и следуйте инструкциям</li>
            <li>Скопируйте выданный токен в поле ниже</li>
            <li>Узнайте ваш Chat ID через <Text code>@userinfobot</Text></li>
          </ol>
        }
      />

      <Card>
        <Form form={form} layout="vertical">
          <Form.Item name="bot_token" label="Telegram Bot Token" rules={[{ required: true, message: 'Введите токен бота' }]}>
            <Input.Password placeholder="110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw" />
          </Form.Item>
          <Form.Item name="chat_id" label="Ваш Chat ID (администратор)" rules={[{ required: true, message: 'Введите Chat ID' }]}>
            <Input placeholder="123456789" />
          </Form.Item>
          <Paragraph type="secondary" style={{ fontSize: 12 }}>
            Уведомления о дефиците товара будут приходить администратору и владельцу склада, где произошла продажа.
          </Paragraph>
          <Space>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
              Сохранить
            </Button>
            <Button onClick={handleTest} loading={testing}>
              Отправить тест
            </Button>
          </Space>
        </Form>
      </Card>
    </div>
  )
}
