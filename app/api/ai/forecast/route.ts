import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY не настроен' }, { status: 500 })
  }

  const { warehouse_id, products } = await req.json() as {
    warehouse_id: string
    products: { id: string; name: string; sku: string }[]
  }

  if (!warehouse_id || !products?.length) {
    return NextResponse.json({ error: 'warehouse_id и products обязательны' }, { status: 400 })
  }

  const admin = await createAdminClient()

  // Sales history for the last 12 weeks
  const twelveWeeksAgo = new Date()
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84)

  const { data: salesData } = await admin
    .from('sale_items')
    .select('product_id, qty, sales!inner(warehouse_id, status, date)')
    .eq('sales.warehouse_id', warehouse_id)
    .eq('sales.status', 'completed')
    .gte('sales.date', twelveWeeksAgo.toISOString().slice(0, 10))

  // Aggregate by product
  const statsMap: Record<string, { total_qty: number; order_ids: Set<string> }> = {}
  for (const row of salesData ?? []) {
    const pid = row.product_id
    if (!statsMap[pid]) statsMap[pid] = { total_qty: 0, order_ids: new Set() }
    statsMap[pid].total_qty += Number(row.qty)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const saleId = (row as any).sales?.id
    if (saleId) statsMap[pid].order_ids.add(saleId)
  }

  const productLines = products.map(p => {
    const stats = statsMap[p.id]
    const total = stats?.total_qty ?? 0
    const orders = stats?.order_ids.size ?? 0
    const avg = (total / 12).toFixed(1)
    return `- ${p.name} (SKU: ${p.sku}, id: ${p.id}): продано ${total} шт за 12 нед, ${orders} заказов, среднее ${avg} шт/нед`
  }).join('\n')

  const prompt = `Ты аналитик закупок WMS системы. Проанализируй историю продаж и предложи количество для заказа на следующие 4 недели.

Товары и их история продаж:
${productLines}

Правила:
- Если товар не продавался — предложи минимальное количество (1–5 шт)
- Учитывай среднее в неделю × 4 с небольшим запасом (10–20%)
- Обоснование — кратко, на русском языке

Ответь ТОЛЬКО JSON массивом без дополнительного текста:
[{"product_id":"...","suggested_qty":N,"note":"обоснование"}]`

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  })

  const text = response.text ?? ''

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    const forecasts = JSON.parse(jsonMatch?.[0] ?? '[]')
    return NextResponse.json({ forecasts })
  } catch {
    return NextResponse.json({ error: 'Не удалось распарсить ответ ИИ', raw: text }, { status: 500 })
  }
}
