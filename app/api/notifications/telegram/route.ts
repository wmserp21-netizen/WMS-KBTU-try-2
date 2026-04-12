import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'

interface Payload {
  product_name: string
  sku: string
  warehouse_name: string
  current_qty: number
  min_stock: number
  owner_id: string
}

async function sendTelegramMessage(token: string, chatId: string, text: string) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  }).catch(() => {}) // fire-and-forget
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload: Payload = await req.json()
  const { product_name, sku, warehouse_name, current_qty, min_stock, owner_id } = payload

  const text = `⚠️ <b>Дефицит товара</b>\n\nТовар: <b>${product_name}</b> (SKU: ${sku})\nСклад: ${warehouse_name}\nОстаток: <b>${current_qty} шт</b> (мин: ${min_stock} шт)`

  const admin = await createAdminClient()

  // Get admin settings (bot_token + chat_id)
  const { data: adminProfiles } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)

  const adminId = adminProfiles?.[0]?.id
  let botToken: string | null = null

  if (adminId) {
    const { data: adminSettings } = await admin
      .from('telegram_settings')
      .select('bot_token, chat_id')
      .eq('user_id', adminId)
      .single()

    if (adminSettings?.bot_token && adminSettings?.chat_id) {
      botToken = adminSettings.bot_token
      await sendTelegramMessage(adminSettings.bot_token, adminSettings.chat_id as string, text)
    }
  }

  // Get owner settings (chat_id) — use same bot token
  if (owner_id && botToken) {
    const { data: ownerSettings } = await admin
      .from('telegram_settings')
      .select('chat_id')
      .eq('user_id', owner_id)
      .single()

    if (ownerSettings?.chat_id) {
      await sendTelegramMessage(botToken, ownerSettings.chat_id, text)
    }
  }

  return NextResponse.json({ ok: true })
}
