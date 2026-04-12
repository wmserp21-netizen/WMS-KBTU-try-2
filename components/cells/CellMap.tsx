'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Drawer, Table, Typography, Tag, Spin, Empty, Space, Button, Tooltip, App,
} from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import {
  DndContext, useDraggable, type DragEndEvent,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { createClient } from '@/lib/supabase/client'

const { Text, Title } = Typography

const CELL_W = 84
const CELL_H = 64
const GAP = 12
const CANVAS_W = 1400
const CANVAS_H = 900

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
  pos_x: number
  pos_y: number
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

function cellColor(cell: CellData): string {
  if (cell.status === 'blocked') return '#ff4d4f'
  if (cell.item_count > 0) {
    if (cell.max_capacity && cell.total_qty >= cell.max_capacity) return '#faad14'
    return '#52c41a'
  }
  return '#e8e8e8'
}

function cellTextColor(cell: CellData): string {
  return cell.status === 'blocked' || cell.item_count > 0 ? '#fff' : '#888'
}

// ──────────────────────────────────────────────
// Individual draggable cell
// ──────────────────────────────────────────────
interface DraggableCellProps {
  cell: CellData
  onClick: (cell: CellData) => void
}

function DraggableCell({ cell, onClick }: DraggableCellProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: cell.id,
  })

  const style: React.CSSProperties = {
    position: 'absolute',
    left: cell.pos_x,
    top: cell.pos_y,
    width: CELL_W,
    height: CELL_H,
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 100 : 1,
    opacity: isDragging ? 0.85 : 1,
    touchAction: 'none',
  }

  return (
    <Tooltip
      title={
        <div>
          <div><strong>{cell.code}</strong></div>
          {cell.item_count > 0 && <div>{cell.item_count} вид(ов), {cell.total_qty} ед.</div>}
          {cell.status === 'blocked' && <div>Заблокирована</div>}
          {cell.max_capacity && <div>Вмест.: {cell.max_capacity}</div>}
          <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>Тащите чтобы переместить</div>
        </div>
      }
    >
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
      >
        {/* Drag handle — the whole cell except a tiny click zone */}
        <div
          {...listeners}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 8,
            background: cellColor(cell),
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isDragging ? 'grabbing' : 'grab',
            userSelect: 'none',
            boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.18)' : '0 1px 4px rgba(0,0,0,0.1)',
            transition: isDragging ? 'none' : 'box-shadow 0.15s',
          }}
          onClick={() => { if (!isDragging) onClick(cell) }}
        >
          <Text style={{ color: cellTextColor(cell), fontSize: 11, fontWeight: 700, fontFamily: 'monospace', lineHeight: 1.2 }}>
            {cell.code}
          </Text>
          {cell.item_count > 0 && (
            <Text style={{ color: cellTextColor(cell), fontSize: 10, opacity: 0.9, marginTop: 2 }}>
              {cell.total_qty} ед.
            </Text>
          )}
        </div>
      </div>
    </Tooltip>
  )
}

// ──────────────────────────────────────────────
// Main CellMap component
// ──────────────────────────────────────────────
export default function CellMap({ warehouseId }: Props) {
  const { message } = App.useApp()
  const [cells, setCells] = useState<CellData[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedL1, setSelectedL1] = useState<string | null>(null)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedCell, setSelectedCell] = useState<CellData | null>(null)
  const [cellContents, setCellContents] = useState<CellContent[]>([])
  const [contentsLoading, setContentsLoading] = useState(false)

  const supabase = createClient()
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const load = useCallback(async () => {
    setLoading(true)
    const { data: cellsData } = await supabase
      .from('cells')
      .select('*')
      .eq('warehouse_id', warehouseId)
      .order('level1')
      .order('level2')
      .order('level3')

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

    // Auto-assign grid positions for cells that have default pos (0,0)
    // only if ALL cells are at origin (fresh from DB)
    const allAtOrigin = cellsData.every(c => c.pos_x === 0 && c.pos_y === 0)

    const mapped: CellData[] = cellsData.map((c, idx) => {
      let pos_x = c.pos_x
      let pos_y = c.pos_y
      if (allAtOrigin) {
        const col = idx % 10
        const row = Math.floor(idx / 10)
        pos_x = col * (CELL_W + GAP)
        pos_y = row * (CELL_H + GAP)
      }
      return {
        ...c,
        pos_x,
        pos_y,
        item_count: countMap[c.id]?.count ?? 0,
        total_qty: countMap[c.id]?.qty ?? 0,
      }
    })

    setCells(mapped)
    if (!selectedL1 && mapped.length > 0) setSelectedL1(mapped[0].level1)
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

    setCellContents((data ?? []).map((r) => ({
      product_id: r.product_id,
      quantity: r.quantity,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      product_name: (r.products as any)?.name ?? '—',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      product_sku: (r.products as any)?.sku ?? '—',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      product_unit: (r.products as any)?.unit ?? 'шт',
    })))
    setContentsLoading(false)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, delta } = event
    if (!delta.x && !delta.y) return

    setCells(prev => prev.map(c => {
      if (c.id !== active.id) return c
      const newX = Math.max(0, Math.min(CANVAS_W - CELL_W, c.pos_x + delta.x))
      const newY = Math.max(0, Math.min(CANVAS_H - CELL_H, c.pos_y + delta.y))
      return { ...c, pos_x: Math.round(newX), pos_y: Math.round(newY) }
    }))

    // Debounce DB save
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(async () => {
      setCells(prev => {
        const cell = prev.find(c => c.id === active.id)
        if (cell) {
          supabase.from('cells')
            .update({ pos_x: cell.pos_x, pos_y: cell.pos_y })
            .eq('id', cell.id)
            .then(({ error }) => { if (error) message.error('Не удалось сохранить позицию') })
        }
        return prev
      })
    }, 600)
  }

  const resetPositions = async () => {
    const filtered = selectedL1 ? cells.filter(c => c.level1 === selectedL1) : cells
    const updates = filtered.map((c, idx) => ({
      ...c,
      pos_x: (idx % 10) * (CELL_W + GAP),
      pos_y: Math.floor(idx / 10) * (CELL_H + GAP),
    }))

    setCells(prev => prev.map(c => updates.find(u => u.id === c.id) ?? c))

    for (const u of updates) {
      await supabase.from('cells').update({ pos_x: u.pos_x, pos_y: u.pos_y }).eq('id', u.id)
    }
    message.success('Позиции сброшены')
  }

  const zones = [...new Set(cells.map(c => c.level1))].sort()
  const visibleCells = selectedL1 ? cells.filter(c => c.level1 === selectedL1) : cells

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spin size="large" /></div>
  }

  if (cells.length === 0) {
    return <Empty description="Ячейки не созданы. Перейдите во вкладку «Ячейки» и добавьте их." style={{ padding: 60 }} />
  }

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Space wrap>
          <Tag
            color={selectedL1 === null ? 'blue' : 'default'}
            style={{ cursor: 'pointer', padding: '4px 12px', fontSize: 13 }}
            onClick={() => setSelectedL1(null)}
          >
            Все
          </Tag>
          {zones.map(z => (
            <Tag
              key={z}
              color={selectedL1 === z ? 'blue' : 'default'}
              style={{ cursor: 'pointer', padding: '4px 12px', fontSize: 13 }}
              onClick={() => setSelectedL1(z)}
            >
              {z}
            </Tag>
          ))}
        </Space>

        <Space>
          <Space size={12} style={{ fontSize: 12 }}>
            <Space size={4}><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: '#52c41a' }} /> Товар</Space>
            <Space size={4}><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: '#faad14' }} /> Полная</Space>
            <Space size={4}><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: '#e8e8e8', border: '1px solid #d9d9d9' }} /> Пуста</Space>
            <Space size={4}><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: '#ff4d4f' }} /> Заблок.</Space>
          </Space>
          <Button size="small" icon={<ReloadOutlined />} onClick={resetPositions}>
            Сбросить позиции
          </Button>
        </Space>
      </div>

      {/* Canvas */}
      <div style={{ overflowX: 'auto', overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 8, background: '#fafafa' }}>
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div
            style={{
              position: 'relative',
              width: CANVAS_W,
              height: CANVAS_H,
              minHeight: 400,
            }}
          >
            {visibleCells.map(cell => (
              <DraggableCell key={cell.id} cell={cell} onClick={openCell} />
            ))}
          </div>
        </DndContext>
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
                {selectedCell.level4 && <div><Text type="secondary">Ур. 4</Text><br /><Text strong>{selectedCell.level4}</Text></div>}
                {selectedCell.max_capacity && <div><Text type="secondary">Вместимость</Text><br /><Text strong>{selectedCell.max_capacity}</Text></div>}
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
                  { title: 'Кол-во', dataIndex: 'quantity', width: 90, render: (q: number, r: CellContent) => `${q} ${r.product_unit}` },
                ]}
              />
            )}
          </div>
        )}
      </Drawer>
    </div>
  )
}
