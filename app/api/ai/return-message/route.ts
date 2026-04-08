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

  const { warehouse_id, reason, returned_items } = await req.json() as {
    warehouse_id: string
    reason: string | null
    returned_items: { product_name: string; qty: number; unit: string }[]
  }

  if (!warehouse_id || !returned_items?.length) {
    return NextResponse.json({ error: 'warehouse_id и returned_items обязательны' }, { status: 400 })
  }

  const admin = await createAdminClient()

  // Available stock at this warehouse
  const { data: stockData } = await admin
    .from('stock')
    .select('quantity, products(name, sku)')
    .eq('warehouse_id', warehouse_id)
    .gt('quantity', 0)
    .order('quantity', { ascending: false })
    .limit(20)

  const availableLines = (stockData ?? []).map(s => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = s.products as any
    return `- ${p?.name ?? '—'} (${s.quantity} шт)`
  }).join('\n')

  const returnedLines = returned_items.map(i => `- ${i.product_name}: ${i.qty} ${i.unit}`).join('\n')

  const prompt = `Ты вежливый менеджер по работе с клиентами в магазине. Покупатель оформляет возврат товара.

Причина возврата: ${reason || 'не указана'}

Возвращаемые товары:
${returnedLines}

Доступные товары в наличии на складе:
${availableLines || '(нет данных)'}

Задача:
1. Напиши вежливое письмо-извинение покупателю (3–5 предложений, на русском языке, без обращения по имени)
2. Предложи 1–3 подходящих альтернативных товара из списка наличия с кратким объяснением почему они могут подойти

Ответь ТОЛЬКО JSON без дополнительного текста:
{"message":"...","alternatives":[{"name":"...","reason":"..."}]}`

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  })

  const text = response.text ?? ''

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const result = JSON.parse(jsonMatch?.[0] ?? '{}')
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Не удалось распарсить ответ ИИ', raw: text }, { status: 500 })
  }
}
