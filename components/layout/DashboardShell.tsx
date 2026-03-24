'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  Layout,
  Menu,
  Button,
  Avatar,
  Dropdown,
  Typography,
  Space,
  theme,
} from 'antd'
import {
  DashboardOutlined,
  TeamOutlined,
  UserOutlined,
  HomeOutlined,
  ShoppingOutlined,
  ImportOutlined,
  ExportOutlined,
  RollbackOutlined,
  DollarOutlined,
  BarChartOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LogoutOutlined,
  DatabaseOutlined,
} from '@ant-design/icons'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/lib/auth'

const { Sider, Header, Content } = Layout
const { Text } = Typography

interface MenuItem {
  key: string
  icon: React.ReactNode
  label: string
}

function getMenuItems(role: UserRole): MenuItem[] {
  if (role === 'admin') {
    return [
      { key: '/admin', icon: <DashboardOutlined />, label: 'Дашборд' },
      { key: '/admin/clients', icon: <TeamOutlined />, label: 'Клиенты' },
      { key: '/admin/employees', icon: <UserOutlined />, label: 'Сотрудники' },
      { key: '/admin/warehouses', icon: <HomeOutlined />, label: 'Склады' },
      { key: '/admin/products', icon: <ShoppingOutlined />, label: 'Товары' },
      { key: '/admin/purchases', icon: <ImportOutlined />, label: 'Закуп' },
      { key: '/admin/sales', icon: <ExportOutlined />, label: 'Продажи' },
      { key: '/admin/returns', icon: <RollbackOutlined />, label: 'Возвраты' },
      { key: '/admin/finance', icon: <DollarOutlined />, label: 'Финансы' },
      { key: '/admin/reports', icon: <BarChartOutlined />, label: 'Отчёты' },
    ]
  }

  if (role === 'owner') {
    return [
      { key: '/owner', icon: <DashboardOutlined />, label: 'Дашборд' },
      { key: '/owner/warehouses', icon: <HomeOutlined />, label: 'Мои склады' },
      { key: '/owner/employees', icon: <UserOutlined />, label: 'Сотрудники' },
      { key: '/owner/products', icon: <ShoppingOutlined />, label: 'Товары' },
      { key: '/owner/purchases', icon: <ImportOutlined />, label: 'Закуп' },
      { key: '/owner/sales', icon: <ExportOutlined />, label: 'Продажи' },
      { key: '/owner/returns', icon: <RollbackOutlined />, label: 'Возвраты' },
      { key: '/owner/finance', icon: <DollarOutlined />, label: 'Финансы' },
      { key: '/owner/reports', icon: <BarChartOutlined />, label: 'Отчёты' },
    ]
  }

  // worker
  return [
    { key: '/worker', icon: <DashboardOutlined />, label: 'Дашборд' },
    { key: '/worker/products', icon: <ShoppingOutlined />, label: 'Товары' },
    { key: '/worker/purchases', icon: <ImportOutlined />, label: 'Приёмка' },
    { key: '/worker/sales', icon: <ExportOutlined />, label: 'Отгрузка' },
    { key: '/worker/returns', icon: <RollbackOutlined />, label: 'Возвраты' },
  ]
}

function getRoleLabel(role: UserRole): string {
  switch (role) {
    case 'admin': return 'Администратор'
    case 'owner': return 'Владелец'
    case 'worker': return 'Сотрудник'
  }
}

interface Props {
  role: UserRole
  fullName: string | null
  children: React.ReactNode
}

export default function DashboardShell({ role, fullName, children }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const { token } = theme.useToken()

  const menuItems = getMenuItems(role)

  // Определяем активный пункт меню
  const selectedKey =
    menuItems.find((item) => {
      if (item.key === pathname) return true
      if (item.key !== `/${role}` && pathname.startsWith(item.key)) return true
      return false
    })?.key ?? `/${role}`

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const userMenu = {
    items: [
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: 'Выйти',
        danger: true,
        onClick: handleLogout,
      },
    ],
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        width={240}
        style={{
          background: token.colorBgContainer,
          borderRight: `1px solid ${token.colorBorderSecondary}`,
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 100,
          overflow: 'auto',
        }}
      >
        {/* Логотип */}
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            padding: collapsed ? '0 24px' : '0 20px',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            gap: 10,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              minWidth: 32,
              width: 32,
              height: 32,
              borderRadius: 8,
              background: '#1677ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <DatabaseOutlined style={{ color: '#fff', fontSize: 16 }} />
          </div>
          {!collapsed && (
            <div style={{ overflow: 'hidden' }}>
              <Text strong style={{ fontSize: 15, display: 'block', lineHeight: 1.2 }}>
                WMS ERP
              </Text>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {getRoleLabel(role)}
              </Text>
            </div>
          )}
        </div>

        {/* Меню */}
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems.map((item) => ({
            key: item.key,
            icon: item.icon,
            label: item.label,
            onClick: () => router.push(item.key),
          }))}
          style={{ border: 'none', marginTop: 8 }}
        />
      </Sider>

      <Layout style={{ marginLeft: collapsed ? 80 : 240, transition: 'margin-left 0.2s' }}>
        {/* Header */}
        <Header
          style={{
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 99,
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{ fontSize: 16, width: 40, height: 40 }}
          />

          <Dropdown menu={userMenu} placement="bottomRight" trigger={['click']}>
            <Space style={{ cursor: 'pointer' }}>
              <Avatar
                size={34}
                style={{ background: '#1677ff' }}
                icon={<UserOutlined />}
              />
              <div style={{ lineHeight: 1.3 }}>
                <Text strong style={{ display: 'block', fontSize: 13 }}>
                  {fullName ?? 'Пользователь'}
                </Text>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {getRoleLabel(role)}
                </Text>
              </div>
            </Space>
          </Dropdown>
        </Header>

        {/* Content */}
        <Content
          style={{
            padding: 24,
            background: token.colorBgLayout,
            minHeight: 'calc(100vh - 64px)',
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  )
}
