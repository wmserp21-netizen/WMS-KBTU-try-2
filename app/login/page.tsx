'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Form, Input, Button, Card, Alert, Typography } from 'antd'
import { MailOutlined, LockOutlined, DatabaseOutlined } from '@ant-design/icons'
import { createClient } from '@/lib/supabase/client'
import { getRoleDashboard, type UserRole } from '@/lib/auth'

const { Title, Text } = Typography

interface LoginForm {
  email: string
  password: string
}

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (values: LoginForm) => {
    setLoading(true)
    setError(null)

    const supabase = createClient()

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    })

    if (signInError) {
      setError('Неверный email или пароль')
      setLoading(false)
      return
    }

    // Получить роль
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Ошибка получения данных пользователя')
      setLoading(false)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, status')
      .eq('id', user.id)
      .single()

    if (!profile) {
      setError('Профиль пользователя не найден')
      setLoading(false)
      return
    }

    if (profile.status === 'blocked') {
      setError('Ваш аккаунт заблокирован. Обратитесь к администратору.')
      await supabase.auth.signOut()
      setLoading(false)
      return
    }

    router.push(getRoleDashboard(profile.role as UserRole))
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card
        style={{ width: 420, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}
        styles={{ body: { padding: '40px 40px 32px' } }}
      >
        <div className="flex flex-col items-center mb-8">
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              background: '#1677ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <DatabaseOutlined style={{ fontSize: 28, color: '#fff' }} />
          </div>
          <Title level={3} style={{ margin: 0, fontWeight: 700 }}>
            WMS ERP
          </Title>
          <Text type="secondary" style={{ marginTop: 4 }}>
            Система управления складом
          </Text>
        </div>

        {error && (
          <Alert
            title={error}
            type="error"
            showIcon
            style={{ marginBottom: 24 }}
            closable
            onClose={() => setError(null)}
          />
        )}

        <Form
          layout="vertical"
          onFinish={handleLogin}
          autoComplete="off"
          requiredMark={false}
        >
          <Form.Item
            label="Email"
            name="email"
            rules={[
              { required: true, message: 'Введите email' },
              { type: 'email', message: 'Некорректный формат email' },
            ]}
          >
            <Input
              prefix={<MailOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="admin@example.com"
              size="large"
            />
          </Form.Item>

          <Form.Item
            label="Пароль"
            name="password"
            rules={[{ required: true, message: 'Введите пароль' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="••••••••"
              size="large"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={loading}
            >
              Войти
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
