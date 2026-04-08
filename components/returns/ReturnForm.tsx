'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Form, Select, DatePicker, Button, Table,
  InputNumber, Space, Typography, Divider, Input, App, Modal, Spin, Alert,
} from 'antd'
import { ArrowLeftOutlined, SaveOutlined, CheckOutlined, RobotOutlined, CopyOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { TextArea } = Input

interface Sale { id: string; number: string; warehouse_id: string; warehouse_name: string }

interface ReturnLine {
  key: string
  product_id: string
  product_name: string
  product_unit: string
  sale_qty: number       // qty in original sale
  return_qty: number     // qty to return
  sell_price: number
  hasError: boolean
}

interface Props {
  backPath: string
  detailBasePath: string
}

export default function ReturnForm({ backPath, detailBasePath }: Props) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [completedSales, setCompletedSales] = useState<Sale[]>([])
  const [docNumber, setDocNumber] = useState('')
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [lines, setLines] = useState<ReturnLine[]>([])
  const [saving, setSaving] = useState(false)
  const [msgLoading, setMsgLoading] = useState(false)
  const [msgOpen, setMsgOpen] = useState(false)
  const [aiMessage, setAiMessage] = useState('')
  const [aiAlternatives, setAiAlternatives] = useState<{ name: string; reason: string }[]>([])

  const generateDocNumber = useCallback(async () => {
    const { data } = await supabase.rpc('generate_doc_number', { prefix: 'RT', table_name: 'returns' })
    setDocNumber(data ?? `RT-${dayjs().year()}-0001`)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadSales = useCallback(async () => {
    const { data } = await supabase
      .from('sales')
      .select('id, number, warehouse_id, warehouses(name)')
      .eq('status', 'completed')
      .order('date', { ascending: false })

    setCompletedSales((data ?? []).map(s => ({
      id: s.id,
      number: s.number,
      warehouse_id: s.warehouse_id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      warehouse_name: (s.warehouses as any)?.name ?? '—',
    })))
    return data ?? []
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    generateDocNumber()
    loadSales().then(sales => {
      const prefillId = searchParams.get('sale_id')
      if (prefillId) {
        const sale = sales.find((s: { id: string; number: string; warehouse_id: string }) => s.id === prefillId)
        if (sale) {
          form.setFieldValue('sale_id', prefillId)
          onSaleChange(prefillId, sales as unknown as Sale[])
        }
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const onSaleChange = async (saleId: string, salesList?: Sale[]) => {
    const list = salesList ?? completedSales
    const sale = list.find(s => s.id === saleId) ?? null
    setSelectedSale(sale)
    setLines([])

    if (!sale) return

    const { data: items } = await supabase
      .from('sale_items')
      .select('id, product_id, qty, sell_price, products(name, unit)')
      .eq('sale_id', saleId)

    setLines((items ?? []).map(i => ({
      key: i.id,
      product_id: i.product_id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      product_name: (i.products as any)?.name ?? '—',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      product_unit: (i.products as any)?.unit ?? 'шт',
      sale_qty: i.qty,
      return_qty: i.qty,
      sell_price: i.sell_price,
      hasError: false,
    })))
  }

  const updateReturnQty = (key: string, val: number) => {
    setLines(prev => prev.map(l => {
      if (l.key !== key) return l
      return { ...l, return_qty: val, hasError: val > l.sale_qty || val < 0 }
    }))
  }

  const hasErrors = lines.some(l => l.hasError)
  const total = lines.reduce((sum, l) => sum + l.return_qty * l.sell_price, 0)

  const doSave = async (status: 'draft' | 'completed') => {
    const values = await form.validateFields()
    if (!selectedSale) { message.error('Выберите продажу'); return }
    if (lines.length === 0) { message.error('Нет позиций для возврата'); return }
    if (status === 'completed' && hasErrors) { message.error('Исправьте ошибки в кол-ве'); return }

    setSaving(true)

    const { data: ret, error: rErr } = await supabase
      .from('returns')
      .insert({
        number: docNumber,
        date: values.date ? values.date.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        sale_id: selectedSale.id,
        warehouse_id: selectedSale.warehouse_id,
        status,
        total,
        reason: values.reason ?? null,
      })
      .select('id')
      .single()

    if (rErr) { message.error(rErr.message); setSaving(false); return }

    const { error: iErr } = await supabase.from('return_items').insert(
      lines.map(l => ({
        return_id: ret.id,
        product_id: l.product_id,
        qty: l.return_qty,
        sell_price: l.sell_price,
      }))
    )
    if (iErr) { message.error(iErr.message); setSaving(false); return }

    if (status === 'completed') {
      for (const l of lines) {
        const { data: cur } = await supabase
          .from('stock')
          .select('quantity')
          .eq('product_id', l.product_id)
          .eq('warehouse_id', selectedSale.warehouse_id)
          .single()

        await supabase.from('stock').update({
          quantity: (cur?.quantity ?? 0) + l.return_qty,
        }).eq('product_id', l.product_id).eq('warehouse_id', selectedSale.warehouse_id)
      }
    }

    message.success(status === 'draft' ? 'Черновик сохранён' : 'Возврат проведён')
    router.push(`${detailBasePath}/${ret.id}`)
  }

  const handleGenerateMessage = async () => {
    if (!selectedSale || lines.length === 0) return
    setMsgLoading(true)
    try {
      const values = form.getFieldsValue()
      const res = await fetch('/api/ai/return-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouse_id: selectedSale.warehouse_id,
          reason: values.reason ?? null,
          returned_items: lines.map(l => ({ product_name: l.product_name, qty: l.return_qty, unit: l.product_unit })),
        }),
      })
      const json = await res.json()
      if (!res.ok) { message.error(json.error ?? 'Ошибка ИИ'); return }
      setAiMessage(json.message ?? '')
      setAiAlternatives(json.alternatives ?? [])
      setMsgOpen(true)
    } finally {
      setMsgLoading(false)
    }
  }

  const lineColumns: ColumnsType<ReturnLine> = [
    { title: 'Товар', dataIndex: 'product_name' },
    { title: 'Ед. изм.', dataIndex: 'product_unit', width: 80 },
    { title: 'Кол-во в продаже', dataIndex: 'sale_qty', width: 140 },
    {
      title: 'Кол-во к возврату',
      dataIndex: 'return_qty',
      width: 160,
      render: (v, record) => (
        <InputNumber
          min={0}
          max={record.sale_qty}
          value={v}
          style={{ width: '100%', borderColor: record.hasError ? '#ff4d4f' : undefined }}
          status={record.hasError ? 'error' : undefined}
          onChange={val => updateReturnQty(record.key, val ?? 0)}
        />
      ),
    },
    {
      title: 'Цена',
      dataIndex: 'sell_price',
      width: 110,
      render: v => v.toLocaleString('ru-RU') + ' ₸',
    },
    {
      title: 'Сумма',
      width: 120,
      render: (_, r) => (r.return_qty * r.sell_price).toLocaleString('ru-RU') + ' ₸',
    },
  ]

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push(backPath)}>Назад</Button>
        <Title level={4} style={{ margin: 0 }}>Новый возврат</Title>
      </div>

      <Form form={form} layout="vertical">
        <Space wrap>
          <Form.Item label="№ возврата">
            <Select disabled value={docNumber} style={{ width: 180 }} options={[{ value: docNumber, label: docNumber }]} />
          </Form.Item>
          <Form.Item name="date" label="Дата" initialValue={dayjs()}>
            <DatePicker format="DD.MM.YYYY" />
          </Form.Item>
          <Form.Item name="sale_id" label="Исходная продажа" rules={[{ required: true, message: 'Выберите продажу' }]}>
            <Select
              style={{ width: 240 }}
              placeholder="Выберите продажу"
              options={completedSales.map(s => ({ value: s.id, label: `${s.number} — ${s.warehouse_name}` }))}
              onChange={v => onSaleChange(v)}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          {selectedSale && (
            <Form.Item label="Склад">
              <Select disabled value={selectedSale.warehouse_id}
                options={[{ value: selectedSale.warehouse_id, label: selectedSale.warehouse_name }]}
                style={{ width: 200 }}
              />
            </Form.Item>
          )}
        </Space>
        <Form.Item name="reason" label="Причина возврата" style={{ maxWidth: 500 }}>
          <TextArea rows={2} placeholder="Необязательно" />
        </Form.Item>
        <Form.Item>
          <Button
            icon={<RobotOutlined />}
            onClick={handleGenerateMessage}
            loading={msgLoading}
            disabled={lines.length === 0}
          >
            Текст для покупателя
          </Button>
        </Form.Item>
      </Form>

      <Divider />

      {lines.length > 0 ? (
        <>
          <Table
            columns={lineColumns}
            dataSource={lines}
            rowKey="key"
            pagination={false}
            size="middle"
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={4}><Text strong>Итого:</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={1} colSpan={2}>
                  <Text strong>{total.toLocaleString('ru-RU')} ₸</Text>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
          <Divider />
        </>
      ) : selectedSale ? (
        <Text type="secondary">Загрузка позиций...</Text>
      ) : (
        <Text type="secondary">Выберите продажу для просмотра позиций</Text>
      )}

      <Space>
        <Button onClick={() => router.push(backPath)}>Отмена</Button>
        <Button icon={<SaveOutlined />} onClick={() => doSave('draft')} loading={saving} disabled={!selectedSale}>
          Сохранить черновик
        </Button>
        <Button
          type="primary"
          icon={<CheckOutlined />}
          onClick={() => doSave('completed')}
          loading={saving}
          disabled={!selectedSale || hasErrors}
        >
          Провести возврат
        </Button>
      </Space>

      <Modal
        title={<Space><RobotOutlined /> Текст для покупателя (ИИ)</Space>}
        open={msgOpen}
        onCancel={() => setMsgOpen(false)}
        footer={<Button onClick={() => setMsgOpen(false)}>Закрыть</Button>}
        width={600}
      >
        {msgLoading ? (
          <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text strong>Письмо покупателю</Text>
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => { navigator.clipboard.writeText(aiMessage); message.success('Скопировано') }}
                >
                  Копировать
                </Button>
              </div>
              <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 16, whiteSpace: 'pre-wrap', fontSize: 14 }}>
                {aiMessage || <Alert message="Текст не сгенерирован" type="warning" />}
              </div>
            </div>

            {aiAlternatives.length > 0 && (
              <>
                <Text strong>Альтернативные товары</Text>
                <Table
                  dataSource={aiAlternatives}
                  rowKey="name"
                  size="small"
                  pagination={false}
                  style={{ marginTop: 8 }}
                  columns={[
                    { title: 'Товар', dataIndex: 'name', width: 180 },
                    { title: 'Почему подходит', dataIndex: 'reason' },
                  ]}
                />
              </>
            )}
          </>
        )}
      </Modal>
    </div>
  )
}
