'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Drawer, Table, Typography, Tag, Spin, Empty, Tooltip, Select, Space,
} from 'antd'
import { createClient } from '@/lib/supabase/client'

const { Text, Title } = Typography

interface CellData {
  id: string
  level1: string
  level2: string
  level3: string
  level4: string | null
  code: string
  max_capacity: number | null
  status: 'active' | 'blocked'
  item_count: number
  total_qty: number
}

interface CellContent {
  product_id: string
  quantity: number
  product_name: string
  product_sku: string
  product_unit: string
}

interface Props {
  warehouseId: string
}

export default function CellMap({ warehouseId }: Props) {
  const [cells, setCells] = useState<CellData[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedL1, setSelectedL1] = useState<string | null>(null)

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedCell, setSelectedCell] = useState<CellData | null>(null)
  const [cellContents, setCellContents] = useState<CellContent[]>([])
  const [contentsLoading, setContentsLoading] = useState(false)

  const supabase = createClient()

  const load = useCallback(async () => {
    setLoading(true)
    const { data: cellsData } = await supabase
      .from('cells')
      .select('*')
      .eq('warehouse_id', warehouseId)
      .order('zone')
      .order('row')
      .order('shelf')

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

    const mapped = cellsData.map(c => ({
      ...c,
      item_count: countMap[c.id]?.count ?? 0,
      total_qty: countMap[c.id]?.qty ?? 0,
    }))

    setCells(mapped)
    if (!selectedL1 && mapped.length > 0) {
      setSelectedL1(mapped[0].level1)
    }
    setLoading(false)
  }, [warehouseId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const openCell = async (cell: CellData) => {
    setSelectedCell(cell)
    setDrawerOpen(true)
    setContentsLoading(true)
    const { data } = await supabase
      .from('stock_cells')
      .select('product_id, quantity, products(name, sku, unit)')
      .eq('cell_id', cell.id)
      .gt('quantity', 0)

    setCellContents((data ?? []).map((r: any) => ({
      product_id: r.product_id,
      quantity: r.quantity,
      product_name: r.products?.name ?? '—',
      product_sku: r.products?.sku ?? '—',
      product_unit: r.products?.unit ?? 'шт',
    })))
    setContentsLoading(false)
  }

  const zones = [...new Set(cells.map(c => c.level1))].sort()
  const zoneCells = cells.filter(c => c.level1 === selectedL1)

  // Group by level2 (rows)
  const rows = [...new Set(zoneCells.map(c => c.level2))].sort()

  function cellColor(cell: CellData): string {
    if (cell.status === 'blocked') return '#ff4d4f'
    if (cell.item_count > 0) {
      if (cell.max_capacity && cell.total_qty >= cell.max_capacity) return '#faad14' // full
      return '#52c41a' // has goods
    }
    return '#e8e8e8' // empty
  }

  function cellTextColor(cell: CellData): string {
    if (cell.status === 'blocked') return '#fff'
    if (cell.item_count > 0) return '#fff'
    return '#999'
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (cells.length === 0) {
    return (
      <Empty
        description="Ячейки не созданы. Перейдите во вкладку «Ячейки» и добавьте их."
        style={{ padding: 60 }}
      />
    )
  }

  return (
    <div>
      {/* Legend + zone selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Space wrap>
          {zones.map(z => (
            <Tag
              key={z}
              color={selectedL1 === z ? 'blue' : 'default'}
              style={{ cursor: 'pointer', padding: '4px 12px', fontSize: 14 }}
              onClick={() => setSelectedL1(z)}
            >
              {z}
            </Tag>
          ))}
        </Space>

        <Space size={16} style={{ fontSize: 12 }}>
          <Space size={4}><span style={{ display:'inline-block', width:14, height:14, borderRadius:3, background:'#52c41a' }} /> Есть товар</Space>
          <Space size={4}><span style={{ display:'inline-block', width:14, height:14, borderRadius:3, background:'#faad14' }} /> Заполнена</Space>
          <Space size={4}><span style={{ display:'inline-block', width:14, height:14, borderRadius:3, background:'#e8e8e8', border:'1px solid #d9d9d9' }} /> Пуста</Space>
          <Space size={4}><span style={{ display:'inline-block', width:14, height:14, borderRadius:3, background:'#ff4d4f' }} /> Заблокирована</Space>
        </Space>
      </div>

      {/* Grid */}
      <div style={{ overflowX: 'auto' }}>
        {rows.length === 0 ? (
          <Empty description={`В уровне ${selectedL1} нет ячеек`} />
        ) : (
          <table style={{ borderCollapse: 'separate', borderSpacing: 4 }}>
            <thead>
              <tr>
                <th style={{ padding: '4px 8px', textAlign: 'left', color: '#999', fontSize: 12, fontWeight: 400 }}>
                  Ур.2 ↓ / Ур.3 →
                </th>
                {(() => {
                  const shelves = [...new Set(zoneCells.map(c => c.level3))].sort()
                  return shelves.map(s => (
                    <th key={s} style={{ padding: '4px 8px', textAlign: 'center', color: '#999', fontSize: 12, fontWeight: 400 }}>
                      {s}
                    </th>
                  ))
                })()}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const rowCells = zoneCells.filter(c => c.level2 === row)
                const shelves = [...new Set(zoneCells.map(c => c.level3))].sort()
                return (
                  <tr key={row}>
                    <td style={{ padding: '4px 8px', color: '#666', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {row}
                    </td>
                    {shelves.map(shelf => {
                      const cell = rowCells.find(c => c.level3 === shelf)
                      if (!cell) return <td key={shelf} />
                      return (
                        <td key={shelf} style={{ padding: 2 }}>
                          <Tooltip
                            title={
                              <div>
                                <div><strong>{cell.code}</strong></div>
                                {cell.item_count > 0 && (
                                  <div>{cell.item_count} вид(ов), {cell.total_qty} ед.</div>
                                )}
                                {cell.status === 'blocked' && <div>Заблокирована</div>}
                                {cell.max_capacity && <div>Вмест.: {cell.max_capacity}</div>}
                                <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>Нажмите для деталей</div>
                              </div>
                            }
                          >
                            <div
                              onClick={() => openCell(cell)}
                              style={{
                                width: 72,
                                height: 56,
                                borderRadius: 6,
                                background: cellColor(cell),
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                transition: 'opacity 0.15s',
                                userSelect: 'none',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                            >
                              <Text style={{ color: cellTextColor(cell), fontSize: 11, fontWeight: 600, fontFamily: 'monospace' }}>
                                {cell.code}
                              </Text>
                              {cell.item_count > 0 && (
                                <Text style={{ color: cellTextColor(cell), fontSize: 10, opacity: 0.9 }}>
                                  {cell.total_qty} ед.
                                </Text>
                              )}
                            </div>
                          </Tooltip>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Cell detail drawer */}
      <Drawer
        title={
          <Space>
            <Text strong style={{ fontFamily: 'monospace', fontSize: 16 }}>{selectedCell?.code}</Text>
            {selectedCell && (
              <Tag color={selectedCell.status === 'active' ? 'green' : 'red'}>
                {selectedCell.status === 'active' ? 'Активна' : 'Заблокирована'}
              </Tag>
            )}
          </Space>
        }
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        size="default"
      >
        {selectedCell && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Space size={16} wrap>
                <div><Text type="secondary">Ур. 1</Text><br /><Text strong>{selectedCell.level1}</Text></div>
                <div><Text type="secondary">Ур. 2</Text><br /><Text strong>{selectedCell.level2}</Text></div>
                <div><Text type="secondary">Ур. 3</Text><br /><Text strong>{selectedCell.level3}</Text></div>
                {selectedCell.level4 && (
                  <div><Text type="secondary">Ур. 4</Text><br /><Text strong>{selectedCell.level4}</Text></div>
                )}
                {selectedCell.max_capacity && (
                  <div><Text type="secondary">Вместимость</Text><br /><Text strong>{selectedCell.max_capacity}</Text></div>
                )}
              </Space>
            </div>

            <Title level={5} style={{ marginBottom: 8 }}>Содержимое ячейки</Title>

            {contentsLoading ? (
              <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
            ) : cellContents.length === 0 ? (
              <Empty description="Ячейка пуста" />
            ) : (
              <Table
                dataSource={cellContents}
                rowKey="product_id"
                size="small"
                pagination={false}
                columns={[
                  { title: 'SKU', dataIndex: 'product_sku', width: 90 },
                  { title: 'Товар', dataIndex: 'product_name' },
                  {
                    title: 'Кол-во', dataIndex: 'quantity', width: 90,
                    render: (q: number, r: CellContent) => `${q} ${r.product_unit}`,
                  },
                ]}
              />
            )}
          </div>
        )}
      </Drawer>
    </div>
  )
}
