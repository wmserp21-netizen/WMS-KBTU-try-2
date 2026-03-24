'use client'

import { useState } from 'react'
import { Tabs, Select, Typography, Space } from 'antd'
import CategoriesTab from './CategoriesTab'
import ProductsTab from './ProductsTab'

const { Title } = Typography

interface Owner { id: string; full_name: string | null }

interface Props {
  viewerRole: 'admin' | 'owner'
  currentOwnerId?: string       // for owner role
  owners?: Owner[]              // for admin role
}

export default function ProductsPage({ viewerRole, currentOwnerId, owners = [] }: Props) {
  const [selectedOwner, setSelectedOwner] = useState<string | null>(
    viewerRole === 'owner' ? (currentOwnerId ?? null) : null
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Категории и Товары</Title>
        {viewerRole === 'admin' && (
          <Space>
            <span style={{ color: '#888', fontSize: 13 }}>Владелец:</span>
            <Select
              style={{ width: 240 }}
              placeholder="Выберите владельца"
              options={owners.map(o => ({ value: o.id, label: o.full_name ?? o.id }))}
              onChange={v => setSelectedOwner(v)}
              showSearch
              optionFilterProp="label"
              allowClear
            />
          </Space>
        )}
      </div>

      {!selectedOwner ? (
        viewerRole === 'admin' ? (
          <div style={{ color: '#888', marginTop: 40, textAlign: 'center' }}>
            Выберите владельца для просмотра категорий и товаров
          </div>
        ) : null
      ) : (
        <Tabs
          defaultActiveKey="categories"
          items={[
            {
              key: 'categories',
              label: 'Категории',
              children: <CategoriesTab ownerId={selectedOwner} />,
            },
            {
              key: 'products',
              label: 'Товары',
              children: <ProductsTab ownerId={selectedOwner} />,
            },
          ]}
        />
      )}
    </div>
  )
}
