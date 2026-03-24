/**
 * WMS ERP — Реалистичные данные
 * Запуск: npx tsx scripts/seed-realistic.ts
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// ── Env ──────────────────────────────────────────────────────
const envPath = path.resolve(__dirname, '../.env.local')
const envLines = fs.readFileSync(envPath, 'utf-8').split('\n')
const env: Record<string, string> = {}
for (const line of envLines) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
}

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL']!
const SVC_KEY     = env['SUPABASE_SERVICE_ROLE_KEY']!
const svc: SupabaseClient = createClient(SUPABASE_URL, SVC_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const PASS = 'Wms2026#Seed'

// ── Helpers ───────────────────────────────────────────────────
const log  = (m: string) => process.stdout.write(m + '\n')
const step = (m: string) => process.stdout.write(`\n\x1b[36m▶ ${m}\x1b[0m\n`)
const ok   = (m: string) => process.stdout.write(`  \x1b[32m✓\x1b[0m ${m}\n`)
const fail = (m: string) => process.stdout.write(`  \x1b[31m✗\x1b[0m ${m}\n`)

async function ins<T>(label: string, promise: Promise<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await promise
  if (error || !data) { fail(label + ' — ' + JSON.stringify(error)); process.exit(1) }
  ok(label)
  return data as T
}

async function soft<T>(label: string, promise: Promise<{ data: T | null; error: unknown }>): Promise<T | null> {
  const { data, error } = await promise
  if (error) { fail(label + ' — ' + JSON.stringify(error)); return null }
  ok(label)
  return data
}

function feb(d: number) { return `2026-02-${String(d).padStart(2, '0')}` }

async function main() {

// ─────────────────────────────────────────────────────────────
// 1. USERS
// ─────────────────────────────────────────────────────────────
step('1. Пользователи')

const DEFS = [
  { email: 'ashat.beisenov@wms-erp.kz',   name: 'Асхат Бейсенов',     role: 'owner'  },
  { email: 'madina.seitkali@wms-erp.kz',  name: 'Мадина Сейткали',    role: 'owner'  },
  { email: 'damir.akhmetov@wms-erp.kz',   name: 'Дамир Ахметов',      role: 'worker' },
  { email: 'aigerim.tulegenova@wms-erp.kz', name: 'Айгерим Тулегенова', role: 'worker' },
  { email: 'nurlan.kasymov@wms-erp.kz',   name: 'Нурлан Касымов',     role: 'worker' },
]

const uids: Record<string, string> = {}
for (const u of DEFS) {
  const { data, error } = await svc.auth.admin.createUser({ email: u.email, password: PASS, email_confirm: true })
  if (error) {
    const { data: list } = await svc.auth.admin.listUsers()
    const found = list?.users?.find(x => x.email === u.email)
    if (!found) { fail(u.name); process.exit(1) }
    uids[u.email] = found.id
    ok(`${u.name} (уже есть)`)
  } else {
    uids[u.email] = data.user.id
    ok(`${u.name} создан`)
  }
  await svc.from('profiles').upsert({ id: uids[u.email], full_name: u.name, role: u.role, status: 'active' }, { onConflict: 'id' })
}

const OWNER1 = uids['ashat.beisenov@wms-erp.kz']
const OWNER2 = uids['madina.seitkali@wms-erp.kz']
const WRK1   = uids['damir.akhmetov@wms-erp.kz']
const WRK2   = uids['aigerim.tulegenova@wms-erp.kz']
const WRK3   = uids['nurlan.kasymov@wms-erp.kz']

// ─────────────────────────────────────────────────────────────
// 2. WAREHOUSES
// ─────────────────────────────────────────────────────────────
step('2. Склады')

const wh1 = await ins('Алматы Центральный', svc.from('warehouses').insert({ name: 'Алматы Центральный', address: 'ул. Абая 150, Алматы', owner_id: OWNER1, status: 'active' }).select('id').single())
const wh2 = await ins('Алматы Южный',       svc.from('warehouses').insert({ name: 'Алматы Южный',       address: 'пр. Райымбека 320, Алматы', owner_id: OWNER1, status: 'active' }).select('id').single())
const wh3 = await ins('Астана Главный',      svc.from('warehouses').insert({ name: 'Астана Главный',      address: 'ул. Туркестан 14, Астана', owner_id: OWNER2, status: 'active' }).select('id').single())

const WH1 = wh1.id, WH2 = wh2.id, WH3 = wh3.id

await soft('Дамир → WH1',   svc.from('warehouse_workers').insert({ warehouse_id: WH1, worker_id: WRK1 }))
await soft('Айгерим → WH2', svc.from('warehouse_workers').insert({ warehouse_id: WH2, worker_id: WRK2 }))
await soft('Нурлан → WH3',  svc.from('warehouse_workers').insert({ warehouse_id: WH3, worker_id: WRK3 }))

// ─────────────────────────────────────────────────────────────
// 3. CATEGORIES
// ─────────────────────────────────────────────────────────────
step('3. Категории')

async function mkCat(name: string, owner_id: string): Promise<string> {
  const { data } = await svc.from('categories').insert({ name, owner_id }).select('id').single()
  ok(`${name} (${owner_id === OWNER1 ? 'Асхат' : 'Мадина'})`)
  return data!.id
}

const C = {
  elec1: await mkCat('Электроника',                OWNER1),
  appl1: await mkCat('Бытовая техника',            OWNER1),
  clth1: await mkCat('Одежда и обувь',             OWNER1),
  tool1: await mkCat('Строительные инструменты',   OWNER1),
  food1: await mkCat('Продукты питания (опт)',     OWNER1),
  cosm1: await mkCat('Косметика и уход',           OWNER1),
  offc1: await mkCat('Канцелярия и офис',          OWNER1),
  elec2: await mkCat('Электроника',                OWNER2),
  clth2: await mkCat('Одежда и обувь',             OWNER2),
  food2: await mkCat('Продукты питания (опт)',     OWNER2),
}

// ─────────────────────────────────────────────────────────────
// 4. PRODUCTS (no owner_id — linked via category)
// ─────────────────────────────────────────────────────────────
step('4. Товары')

async function mkProd(sku: string, name: string, cat: string, buy: number, sell: number, unit: string, min: number): Promise<string> {
  const { data } = await svc.from('products').insert({ sku, name, category_id: cat, buy_price: buy, sell_price: sell, unit, min_stock: min }).select('id').single()
  if (!data) { fail(`${sku} — ${JSON.stringify(error)}`); process.exit(1) }
  ok(`${sku} — ${name}`)
  return data.id
}

const P: Record<string, string> = {}

// Электроника
P['EL-001'] = await mkProd('EL-001', 'Ноутбук Acer Aspire 5 A515',         C.elec1, 118000, 152000, 'шт',   5)
P['EL-002'] = await mkProd('EL-002', 'Планшет Samsung Galaxy Tab A8',       C.elec1,  63000,  82000, 'шт',   8)
P['EL-003'] = await mkProd('EL-003', 'Наушники Sony WH-1000XM5',            C.elec1,  44000,  58000, 'шт',  10)
P['EL-004'] = await mkProd('EL-004', 'TWS наушники JBL Tune 510BT',         C.elec1,   7500,  12000, 'шт',  20)
P['EL-005'] = await mkProd('EL-005', 'Внешний аккумулятор Xiaomi 20000mAh', C.elec1,   5200,   8500, 'шт',  15)
P['EL-006'] = await mkProd('EL-006', 'Кабель USB-C 1.8м Baseus',            C.elec1,    700,   1500, 'шт',  50)
// Бытовая техника
P['BT-001'] = await mkProd('BT-001', 'Чайник Bosch TWK3A014',               C.appl1,   7200,  11000, 'шт',  15)
P['BT-002'] = await mkProd('BT-002', 'Утюг Philips DST7030/20',             C.appl1,  13500,  19500, 'шт',  10)
P['BT-003'] = await mkProd('BT-003', 'Блендер Tefal BL811138',              C.appl1,  17000,  26000, 'шт',   8)
P['BT-004'] = await mkProd('BT-004', 'Микроволновка Samsung ME83XR',        C.appl1,  33000,  48000, 'шт',   5)
// Одежда
P['OD-001'] = await mkProd('OD-001', 'Куртка зимняя Columbia Puffer',       C.clth1,  17500,  28000, 'шт',  30)
P['OD-002'] = await mkProd('OD-002', 'Джинсы Levi\'s 501 Straight',         C.clth1,  11500,  18500, 'шт',  40)
P['OD-003'] = await mkProd('OD-003', 'Кроссовки Nike Air Max 90',           C.clth1,  21000,  34000, 'шт',  20)
P['OD-004'] = await mkProd('OD-004', 'Футболка базовая хлопок 100%',        C.clth1,   1200,   3200, 'шт', 100)
P['OD-005'] = await mkProd('OD-005', 'Носки мужские упак. 5 пар',           C.clth1,    600,   1600, 'уп', 100)
// Инструменты
P['IN-001'] = await mkProd('IN-001', 'Дрель-шуруповёрт Bosch GSR 12V',     C.tool1,  27000,  40000, 'шт',  10)
P['IN-002'] = await mkProd('IN-002', 'Набор отвёрток Kraftool 12 шт',       C.tool1,   2600,   5200, 'шт',  25)
P['IN-003'] = await mkProd('IN-003', 'Рулетка Stanley 5м FatMax',           C.tool1,   1100,   2400, 'шт',  30)
P['IN-004'] = await mkProd('IN-004', 'Перфоратор Makita HR2630',            C.tool1,  43000,  62000, 'шт',   5)
P['IN-005'] = await mkProd('IN-005', 'Уровень строительный 120 см',         C.tool1,   1800,   3600, 'шт',  20)
// Продукты
P['PP-001'] = await mkProd('PP-001', 'Масло подсолнечное 5л ящик 4шт',     C.food1,   3100,   4800, 'уп',  50)
P['PP-002'] = await mkProd('PP-002', 'Мука пшеничная высш.сорт 50кг',      C.food1,   8000,  11000, 'уп', 30)
P['PP-003'] = await mkProd('PP-003', 'Сахар-песок 50кг мешок',             C.food1,   8500,  12500, 'уп', 30)
P['PP-004'] = await mkProd('PP-004', 'Рис длиннозернистый 25кг',           C.food1,   6000,   9000, 'уп', 25)
P['PP-005'] = await mkProd('PP-005', 'Макароны Pasta Zara 5кг ящик',       C.food1,   1700,   2700, 'уп',  50)
// Косметика
P['KO-001'] = await mkProd('KO-001', 'Крем Nivea Soft 200ml',              C.cosm1,    820,   1500, 'шт',  50)
P['KO-002'] = await mkProd('KO-002', 'Шампунь Head&Shoulders 400ml',       C.cosm1,   1050,   2000, 'шт',  50)
P['KO-003'] = await mkProd('KO-003', 'Духи Chanel Coco Mademoiselle 50ml', C.cosm1,  32000,  52000, 'шт',   5)
P['KO-004'] = await mkProd('KO-004', 'Зубная паста Colgate Max 3шт',       C.cosm1,    750,   1500, 'уп', 100)
P['KO-005'] = await mkProd('KO-005', 'Гель для душа Dove 250ml',           C.cosm1,    520,   1050, 'шт', 100)
// Канцелярия
P['KA-001'] = await mkProd('KA-001', 'Тетрадь 96л клетка уп. 10шт',       C.offc1,   1200,   2200, 'уп',  50)
P['KA-002'] = await mkProd('KA-002', 'Ручки шариковые BIC уп. 50шт',      C.offc1,   1400,   2700, 'уп',  30)
P['KA-003'] = await mkProd('KA-003', 'Папка-регистратор Esselte A4',       C.offc1,    550,   1050, 'шт',  50)
P['KA-004'] = await mkProd('KA-004', 'Степлер Maped Pulse 30л',            C.offc1,   1600,   3000, 'шт',  20)
P['KA-005'] = await mkProd('KA-005', 'Бумага А4 500л Svetocopy',           C.offc1,   1500,   2700, 'уп', 100)
// Owner2
P['EL2-001'] = await mkProd('EL2-001', 'Ноутбук HP 250 G9',               C.elec2, 105000, 138000, 'шт',   5)
P['OD2-001'] = await mkProd('OD2-001', 'Куртка ветровка Adidas',           C.clth2,  12000,  19500, 'шт',  20)
P['PP2-001'] = await mkProd('PP2-001', 'Масло оливковое 1л ящик 12шт',    C.food2,   4200,   6500, 'уп',  30)

// ─────────────────────────────────────────────────────────────
// 5. SUPPLIERS  (column = 'contact', not contact_name/phone)
// ─────────────────────────────────────────────────────────────
step('5. Поставщики')

async function mkSup(name: string, contact: string, owner_id: string): Promise<string> {
  const { data } = await svc.from('suppliers').insert({ name, contact, owner_id }).select('id').single()
  ok(name)
  return data!.id
}

const SUP_TECH = await mkSup('ТОО «TechDistribution KZ»',  'Серік Нұрланов, +7 727 255-10-20',    OWNER1)
const SUP_TEXT = await mkSup('ИП «АлматыТекстиль»',        'Гүлнар Исабекова, +7 701 388-44-55',  OWNER1)
const SUP_TOOL = await mkSup('ТОО «СтройТрейд»',           'Руслан Жақсыбеков, +7 747 211-77-88', OWNER1)
const SUP_FOOD = await mkSup('ТОО «Продторг Алматы»',      'Айнұр Сыздықова, +7 705 366-90-01',   OWNER1)
const SUP_BEST = await mkSup('ТОО «BestTrade Astana»',     'Бауыржан Əбенов, +7 717 244-55-66',   OWNER2)

// ─────────────────────────────────────────────────────────────
// 6. STOCK helper  (no 'id' col — key is product_id+warehouse_id)
// ─────────────────────────────────────────────────────────────
const stockCache: Record<string, number> = {} // `${whId}:${prodId}` → qty

async function addStock(wh: string, sku: string, qty: number) {
  const pid = P[sku]
  const key = `${wh}:${pid}`
  const cur = stockCache[key] ?? 0
  const next = cur + qty
  await svc.from('stock').upsert({ warehouse_id: wh, product_id: pid, quantity: next }, { onConflict: 'product_id,warehouse_id' })
  stockCache[key] = next
}

async function deductStock(wh: string, sku: string, qty: number): Promise<boolean> {
  const pid = P[sku]
  const key = `${wh}:${pid}`
  // refresh from DB if not cached
  if (stockCache[key] === undefined) {
    const { data } = await svc.from('stock').select('quantity').eq('warehouse_id', wh).eq('product_id', pid).single()
    stockCache[key] = data?.quantity ?? 0
  }
  const avail = stockCache[key]
  if (avail < qty) return false
  const next = avail - qty
  await svc.from('stock').update({ quantity: next }).eq('warehouse_id', wh).eq('product_id', pid)
  stockCache[key] = next
  return true
}

// ─────────────────────────────────────────────────────────────
// 7. PURCHASES  (field: 'number' not doc_number, qty_actual not qty_received)
// ─────────────────────────────────────────────────────────────
step('6. Закупки')

let purTotal = 0
async function mkPurchase(num: string, date: string, wh: string, sup: string, items: {sku: string; qty: number; price: number}[]) {
  const total = items.reduce((s, i) => s + i.qty * i.price, 0)
  const { data: pur } = await svc.from('purchases').insert({ number: num, date, warehouse_id: wh, supplier_id: sup, status: 'received_full', total }).select('id').single()
  if (!pur) { fail(num); return }
  for (const item of items) {
    await svc.from('purchase_items').insert({ purchase_id: pur.id, product_id: P[item.sku], qty_expected: item.qty, qty_actual: item.qty, buy_price: item.price })
    await addStock(wh, item.sku, item.qty)
  }
  purTotal += total
  ok(`${num}  ${date}  ${total.toLocaleString('ru-RU')} ₸`)
}

// WH1 — Алматы Центральный
await mkPurchase('PO-WH1-0001', '2026-01-28', WH1, SUP_TECH, [
  {sku:'EL-001',qty:25,price:118000},{sku:'EL-002',qty:40,price:63000},{sku:'EL-003',qty:30,price:44000},
  {sku:'EL-004',qty:120,price:7500},{sku:'EL-005',qty:150,price:5200},{sku:'EL-006',qty:500,price:700},
])
await mkPurchase('PO-WH1-0002', '2026-01-30', WH1, SUP_TEXT, [
  {sku:'OD-001',qty:200,price:17500},{sku:'OD-002',qty:250,price:11500},{sku:'OD-003',qty:100,price:21000},
  {sku:'OD-004',qty:600,price:1200},{sku:'OD-005',qty:800,price:600},
])
await mkPurchase('PO-WH1-0003', '2026-02-03', WH1, SUP_TOOL, [
  {sku:'IN-001',qty:50,price:27000},{sku:'IN-002',qty:150,price:2600},{sku:'IN-003',qty:200,price:1100},
  {sku:'IN-004',qty:30,price:43000},{sku:'IN-005',qty:200,price:1800},
])
await mkPurchase('PO-WH1-0004', '2026-02-05', WH1, SUP_FOOD, [
  {sku:'PP-001',qty:300,price:3100},{sku:'PP-002',qty:150,price:8000},{sku:'PP-003',qty:120,price:8500},
  {sku:'PP-004',qty:180,price:6000},{sku:'PP-005',qty:400,price:1700},
])
await mkPurchase('PO-WH1-0005', '2026-02-05', WH1, SUP_TECH, [
  {sku:'KO-001',qty:500,price:820},{sku:'KO-002',qty:500,price:1050},{sku:'KO-003',qty:25,price:32000},
  {sku:'KO-004',qty:600,price:750},{sku:'KO-005',qty:800,price:520},
  {sku:'KA-001',qty:200,price:1200},{sku:'KA-002',qty:150,price:1400},{sku:'KA-003',qty:300,price:550},
  {sku:'KA-004',qty:100,price:1600},{sku:'KA-005',qty:500,price:1500},
])
await mkPurchase('PO-WH1-0006', '2026-02-06', WH1, SUP_TEXT, [
  {sku:'BT-001',qty:80,price:7200},{sku:'BT-002',qty:60,price:13500},
  {sku:'BT-003',qty:50,price:17000},{sku:'BT-004',qty:30,price:33000},
])
await mkPurchase('PO-WH1-0007', '2026-02-14', WH1, SUP_TECH, [
  {sku:'EL-001',qty:15,price:118000},{sku:'EL-002',qty:20,price:63000},
  {sku:'OD-001',qty:100,price:17500},{sku:'OD-002',qty:100,price:11500},{sku:'OD-003',qty:50,price:21000},
])

// WH2 — Алматы Южный
await mkPurchase('PO-WH2-0001', '2026-01-29', WH2, SUP_TECH, [
  {sku:'EL-001',qty:20,price:118000},{sku:'EL-003',qty:25,price:44000},
  {sku:'EL-004',qty:100,price:7500},{sku:'EL-005',qty:120,price:5200},{sku:'EL-006',qty:400,price:700},
])
await mkPurchase('PO-WH2-0002', '2026-02-01', WH2, SUP_TEXT, [
  {sku:'OD-001',qty:150,price:17500},{sku:'OD-002',qty:200,price:11500},
  {sku:'OD-004',qty:500,price:1200},{sku:'OD-005',qty:600,price:600},
])
await mkPurchase('PO-WH2-0003', '2026-02-04', WH2, SUP_FOOD, [
  {sku:'PP-001',qty:200,price:3100},{sku:'PP-002',qty:100,price:8000},{sku:'PP-003',qty:80,price:8500},
  {sku:'PP-004',qty:120,price:6000},{sku:'PP-005',qty:300,price:1700},
  {sku:'KO-001',qty:300,price:820},{sku:'KO-002',qty:300,price:1050},
  {sku:'KO-004',qty:400,price:750},{sku:'KO-005',qty:500,price:520},
])
await mkPurchase('PO-WH2-0004', '2026-02-10', WH2, SUP_TOOL, [
  {sku:'IN-001',qty:30,price:27000},{sku:'IN-002',qty:100,price:2600},{sku:'IN-003',qty:150,price:1100},
  {sku:'BT-001',qty:50,price:7200},{sku:'BT-002',qty:40,price:13500},{sku:'BT-003',qty:30,price:17000},
  {sku:'KA-001',qty:150,price:1200},{sku:'KA-002',qty:100,price:1400},{sku:'KA-005',qty:300,price:1500},
])

// WH3 — Астана Главный (owner2)
await mkPurchase('PO-WH3-0001', '2026-01-27', WH3, SUP_BEST, [
  {sku:'EL2-001',qty:30,price:105000},{sku:'OD2-001',qty:200,price:12000},{sku:'PP2-001',qty:300,price:4200},
])
await mkPurchase('PO-WH3-0002', '2026-02-07', WH3, SUP_BEST, [
  {sku:'EL2-001',qty:20,price:105000},{sku:'OD2-001',qty:150,price:12000},{sku:'PP2-001',qty:200,price:4200},
])

// ─────────────────────────────────────────────────────────────
// 8. SALES  (field: 'number')
// ─────────────────────────────────────────────────────────────
step('7. Продажи')

let saleSeq = 1
let totalRevenue = 0
const saleIds: string[] = []  // for returns

async function mkSale(date: string, wh: string, items: {sku: string; qty: number; price: number}[]) {
  // verify stock
  for (const item of items) {
    const pid = P[item.sku]
    const key = `${wh}:${pid}`
    if ((stockCache[key] ?? 0) < item.qty) return  // skip if insufficient
  }
  const total = items.reduce((s, i) => s + i.qty * i.price, 0)
  const whTag = wh === WH1 ? 'WH1' : wh === WH2 ? 'WH2' : 'WH3'
  const num = `SO-${whTag}-${String(saleSeq++).padStart(4, '0')}`

  const { data: sale } = await svc.from('sales').insert({ number: num, date, warehouse_id: wh, status: 'completed', total }).select('id').single()
  if (!sale) { fail(num); return }

  for (const item of items) {
    await svc.from('sale_items').insert({ sale_id: sale.id, product_id: P[item.sku], qty: item.qty, sell_price: item.price })
    await deductStock(wh, item.sku, item.qty)
  }
  totalRevenue += total
  saleIds.push(sale.id)
  ok(`${num}  ${date}  ${total.toLocaleString('ru-RU')} ₸`)
}

// ── WH1 Feb 2026 ──────────────────────────────────────────────
await mkSale(feb(1),WH1,[{sku:'EL-001',qty:2,price:152000},{sku:'EL-002',qty:3,price:82000},{sku:'EL-003',qty:4,price:58000}])
await mkSale(feb(1),WH1,[{sku:'OD-001',qty:8,price:28000},{sku:'OD-002',qty:10,price:18500},{sku:'OD-003',qty:5,price:34000}])
await mkSale(feb(2),WH1,[{sku:'PP-002',qty:10,price:11000},{sku:'PP-003',qty:8,price:12500},{sku:'PP-004',qty:12,price:9000},{sku:'PP-001',qty:20,price:4800}])
await mkSale(feb(2),WH1,[{sku:'KO-003',qty:2,price:52000},{sku:'KO-002',qty:30,price:2000},{sku:'KO-001',qty:25,price:1500},{sku:'KO-004',qty:40,price:1500}])
await mkSale(feb(3),WH1,[{sku:'IN-001',qty:3,price:40000},{sku:'IN-004',qty:2,price:62000},{sku:'IN-002',qty:10,price:5200}])
await mkSale(feb(3),WH1,[{sku:'BT-004',qty:3,price:48000},{sku:'BT-003',qty:4,price:26000},{sku:'BT-001',qty:8,price:11000},{sku:'BT-002',qty:5,price:19500}])
await mkSale(feb(4),WH1,[{sku:'EL-001',qty:3,price:152000},{sku:'EL-002',qty:4,price:82000},{sku:'EL-004',qty:15,price:12000},{sku:'EL-005',qty:20,price:8500}])
await mkSale(feb(4),WH1,[{sku:'OD-004',qty:50,price:3200},{sku:'OD-005',qty:60,price:1600},{sku:'OD-002',qty:15,price:18500}])
await mkSale(feb(5),WH1,[{sku:'KA-005',qty:50,price:2700},{sku:'KA-002',qty:20,price:2700},{sku:'KA-001',qty:20,price:2200},{sku:'KA-003',qty:30,price:1050}])
await mkSale(feb(5),WH1,[{sku:'PP-005',qty:40,price:2700},{sku:'PP-001',qty:30,price:4800},{sku:'PP-004',qty:15,price:9000}])
await mkSale(feb(6),WH1,[{sku:'EL-001',qty:2,price:152000},{sku:'EL-003',qty:3,price:58000},{sku:'KO-003',qty:2,price:52000}])
await mkSale(feb(6),WH1,[{sku:'IN-003',qty:20,price:2400},{sku:'IN-005',qty:25,price:3600},{sku:'IN-002',qty:15,price:5200},{sku:'IN-001',qty:2,price:40000}])
await mkSale(feb(7),WH1,[{sku:'OD-001',qty:12,price:28000},{sku:'OD-003',qty:6,price:34000},{sku:'OD-002',qty:12,price:18500}])
await mkSale(feb(7),WH1,[{sku:'BT-001',qty:10,price:11000},{sku:'BT-002',qty:6,price:19500},{sku:'BT-004',qty:2,price:48000}])
await mkSale(feb(8),WH1,[{sku:'EL-002',qty:5,price:82000},{sku:'EL-004',qty:20,price:12000},{sku:'EL-005',qty:25,price:8500},{sku:'EL-006',qty:50,price:1500}])
await mkSale(feb(8),WH1,[{sku:'KO-001',qty:40,price:1500},{sku:'KO-002',qty:35,price:2000},{sku:'KO-004',qty:50,price:1500},{sku:'KO-005',qty:60,price:1050}])
await mkSale(feb(10),WH1,[{sku:'PP-002',qty:8,price:11000},{sku:'PP-003',qty:10,price:12500},{sku:'PP-001',qty:25,price:4800},{sku:'PP-005',qty:30,price:2700}])
await mkSale(feb(10),WH1,[{sku:'EL-001',qty:3,price:152000},{sku:'IN-004',qty:2,price:62000},{sku:'BT-003',qty:3,price:26000}])
await mkSale(feb(11),WH1,[{sku:'OD-001',qty:15,price:28000},{sku:'OD-002',qty:20,price:18500},{sku:'OD-003',qty:8,price:34000}])
await mkSale(feb(11),WH1,[{sku:'KA-005',qty:60,price:2700},{sku:'KA-001',qty:25,price:2200},{sku:'KA-004',qty:10,price:3000}])
await mkSale(feb(12),WH1,[{sku:'IN-001',qty:4,price:40000},{sku:'IN-004',qty:2,price:62000},{sku:'IN-002',qty:12,price:5200},{sku:'IN-003',qty:15,price:2400}])
await mkSale(feb(12),WH1,[{sku:'KO-003',qty:2,price:52000},{sku:'EL-003',qty:3,price:58000},{sku:'BT-004',qty:2,price:48000}])
await mkSale(feb(13),WH1,[{sku:'OD-004',qty:60,price:3200},{sku:'OD-005',qty:80,price:1600},{sku:'OD-001',qty:10,price:28000}])
await mkSale(feb(14),WH1,[{sku:'EL-001',qty:4,price:152000},{sku:'EL-002',qty:5,price:82000},{sku:'KO-003',qty:2,price:52000}])
await mkSale(feb(14),WH1,[{sku:'PP-004',qty:15,price:9000},{sku:'PP-002',qty:10,price:11000},{sku:'PP-003',qty:8,price:12500}])
await mkSale(feb(15),WH1,[{sku:'BT-001',qty:10,price:11000},{sku:'BT-002',qty:8,price:19500},{sku:'BT-003',qty:5,price:26000},{sku:'BT-004',qty:3,price:48000}])
await mkSale(feb(15),WH1,[{sku:'OD-003',qty:8,price:34000},{sku:'OD-002',qty:15,price:18500},{sku:'EL-003',qty:3,price:58000}])
await mkSale(feb(17),WH1,[{sku:'EL-001',qty:3,price:152000},{sku:'EL-004',qty:20,price:12000},{sku:'EL-005',qty:25,price:8500},{sku:'EL-006',qty:60,price:1500}])
await mkSale(feb(17),WH1,[{sku:'IN-001',qty:3,price:40000},{sku:'IN-002',qty:12,price:5200},{sku:'IN-003',qty:18,price:2400},{sku:'IN-005',qty:20,price:3600}])
await mkSale(feb(18),WH1,[{sku:'KO-001',qty:50,price:1500},{sku:'KO-002',qty:40,price:2000},{sku:'KO-004',qty:60,price:1500},{sku:'KO-005',qty:70,price:1050}])
await mkSale(feb(18),WH1,[{sku:'PP-001',qty:30,price:4800},{sku:'PP-005',qty:35,price:2700},{sku:'PP-004',qty:12,price:9000}])
await mkSale(feb(19),WH1,[{sku:'OD-001',qty:12,price:28000},{sku:'OD-002',qty:18,price:18500},{sku:'OD-003',qty:6,price:34000}])
await mkSale(feb(20),WH1,[{sku:'EL-002',qty:5,price:82000},{sku:'KO-003',qty:2,price:52000},{sku:'EL-001',qty:2,price:152000}])
await mkSale(feb(20),WH1,[{sku:'KA-005',qty:50,price:2700},{sku:'KA-002',qty:20,price:2700},{sku:'KA-003',qty:30,price:1050},{sku:'KA-004',qty:12,price:3000}])
await mkSale(feb(21),WH1,[{sku:'BT-001',qty:8,price:11000},{sku:'BT-003',qty:4,price:26000},{sku:'IN-004',qty:2,price:62000},{sku:'BT-002',qty:6,price:19500}])
await mkSale(feb(22),WH1,[{sku:'EL-001',qty:3,price:152000},{sku:'EL-003',qty:4,price:58000},{sku:'OD-003',qty:5,price:34000}])
await mkSale(feb(22),WH1,[{sku:'PP-002',qty:8,price:11000},{sku:'PP-003',qty:6,price:12500},{sku:'PP-001',qty:20,price:4800},{sku:'PP-005',qty:25,price:2700}])
await mkSale(feb(24),WH1,[{sku:'OD-001',qty:12,price:28000},{sku:'OD-002',qty:15,price:18500},{sku:'OD-004',qty:40,price:3200},{sku:'OD-005',qty:50,price:1600}])
await mkSale(feb(24),WH1,[{sku:'KO-002',qty:35,price:2000},{sku:'KO-001',qty:40,price:1500},{sku:'KO-004',qty:50,price:1500},{sku:'KO-005',qty:60,price:1050}])
await mkSale(feb(25),WH1,[{sku:'EL-001',qty:2,price:152000},{sku:'EL-002',qty:4,price:82000},{sku:'EL-004',qty:15,price:12000},{sku:'EL-005',qty:20,price:8500}])
await mkSale(feb(25),WH1,[{sku:'IN-001',qty:3,price:40000},{sku:'IN-002',qty:10,price:5200},{sku:'IN-005',qty:15,price:3600},{sku:'BT-001',qty:8,price:11000}])
await mkSale(feb(26),WH1,[{sku:'KA-005',qty:40,price:2700},{sku:'KA-001',qty:20,price:2200},{sku:'KA-002',qty:15,price:2700}])
await mkSale(feb(27),WH1,[{sku:'EL-001',qty:3,price:152000},{sku:'EL-003',qty:3,price:58000},{sku:'KO-003',qty:2,price:52000},{sku:'BT-004',qty:2,price:48000}])
await mkSale(feb(28),WH1,[{sku:'OD-001',qty:10,price:28000},{sku:'OD-002',qty:12,price:18500},{sku:'OD-003',qty:5,price:34000},{sku:'PP-004',qty:10,price:9000}])

// ── WH2 Feb 2026 ──────────────────────────────────────────────
await mkSale(feb(1),WH2,[{sku:'EL-001',qty:2,price:152000},{sku:'EL-004',qty:15,price:12000},{sku:'EL-005',qty:20,price:8500}])
await mkSale(feb(2),WH2,[{sku:'OD-001',qty:10,price:28000},{sku:'OD-002',qty:12,price:18500},{sku:'OD-004',qty:40,price:3200}])
await mkSale(feb(3),WH2,[{sku:'PP-001',qty:20,price:4800},{sku:'PP-002',qty:8,price:11000},{sku:'PP-004',qty:10,price:9000}])
await mkSale(feb(4),WH2,[{sku:'KO-001',qty:30,price:1500},{sku:'KO-002',qty:25,price:2000},{sku:'KO-004',qty:35,price:1500},{sku:'KO-005',qty:40,price:1050}])
await mkSale(feb(5),WH2,[{sku:'EL-003',qty:3,price:58000},{sku:'EL-001',qty:2,price:152000},{sku:'BT-001',qty:6,price:11000}])
await mkSale(feb(6),WH2,[{sku:'PP-003',qty:6,price:12500},{sku:'PP-005',qty:25,price:2700},{sku:'PP-004',qty:8,price:9000}])
await mkSale(feb(7),WH2,[{sku:'OD-002',qty:15,price:18500},{sku:'OD-004',qty:50,price:3200},{sku:'OD-005',qty:50,price:1600}])
await mkSale(feb(8),WH2,[{sku:'BT-002',qty:5,price:19500},{sku:'BT-003',qty:3,price:26000},{sku:'IN-001',qty:2,price:40000},{sku:'IN-002',qty:8,price:5200}])
await mkSale(feb(10),WH2,[{sku:'EL-001',qty:3,price:152000},{sku:'EL-003',qty:3,price:58000},{sku:'EL-004',qty:20,price:12000},{sku:'EL-006',qty:40,price:1500}])
await mkSale(feb(11),WH2,[{sku:'KA-001',qty:15,price:2200},{sku:'KA-002',qty:12,price:2700},{sku:'KA-005',qty:30,price:2700}])
await mkSale(feb(12),WH2,[{sku:'OD-001',qty:12,price:28000},{sku:'OD-002',qty:15,price:18500},{sku:'OD-005',qty:40,price:1600}])
await mkSale(feb(13),WH2,[{sku:'KO-001',qty:30,price:1500},{sku:'KO-002',qty:25,price:2000},{sku:'KO-005',qty:40,price:1050},{sku:'PP-001',qty:15,price:4800}])
await mkSale(feb(14),WH2,[{sku:'EL-005',qty:20,price:8500},{sku:'EL-004',qty:15,price:12000},{sku:'BT-001',qty:6,price:11000},{sku:'BT-003',qty:3,price:26000}])
await mkSale(feb(17),WH2,[{sku:'EL-001',qty:2,price:152000},{sku:'OD-001',qty:10,price:28000},{sku:'OD-002',qty:8,price:18500}])
await mkSale(feb(18),WH2,[{sku:'PP-002',qty:6,price:11000},{sku:'PP-003',qty:5,price:12500},{sku:'PP-005',qty:20,price:2700}])
await mkSale(feb(19),WH2,[{sku:'IN-003',qty:12,price:2400},{sku:'IN-002',qty:8,price:5200},{sku:'KO-004',qty:30,price:1500}])
await mkSale(feb(20),WH2,[{sku:'EL-003',qty:3,price:58000},{sku:'EL-004',qty:15,price:12000},{sku:'OD-002',qty:12,price:18500}])
await mkSale(feb(21),WH2,[{sku:'OD-004',qty:40,price:3200},{sku:'OD-005',qty:50,price:1600},{sku:'KO-001',qty:30,price:1500},{sku:'KO-002',qty:25,price:2000}])
await mkSale(feb(24),WH2,[{sku:'EL-001',qty:3,price:152000},{sku:'EL-005',qty:20,price:8500},{sku:'BT-002',qty:4,price:19500},{sku:'BT-001',qty:6,price:11000}])
await mkSale(feb(25),WH2,[{sku:'PP-004',qty:8,price:9000},{sku:'PP-001',qty:15,price:4800},{sku:'KA-005',qty:25,price:2700},{sku:'KA-001',qty:12,price:2200}])
await mkSale(feb(26),WH2,[{sku:'OD-001',qty:10,price:28000},{sku:'IN-001',qty:2,price:40000},{sku:'IN-002',qty:8,price:5200}])
await mkSale(feb(27),WH2,[{sku:'EL-003',qty:2,price:58000},{sku:'BT-003',qty:3,price:26000},{sku:'BT-004',qty:2,price:48000}])
await mkSale(feb(28),WH2,[{sku:'EL-001',qty:2,price:152000},{sku:'EL-002',qty:3,price:82000},{sku:'OD-002',qty:10,price:18500}])

// ── WH3 Feb 2026 ──────────────────────────────────────────────
await mkSale(feb(1),WH3,[{sku:'EL2-001',qty:3,price:138000},{sku:'OD2-001',qty:10,price:19500},{sku:'PP2-001',qty:20,price:6500}])
await mkSale(feb(3),WH3,[{sku:'EL2-001',qty:2,price:138000},{sku:'PP2-001',qty:25,price:6500},{sku:'OD2-001',qty:15,price:19500}])
await mkSale(feb(5),WH3,[{sku:'EL2-001',qty:3,price:138000},{sku:'OD2-001',qty:20,price:19500}])
await mkSale(feb(7),WH3,[{sku:'PP2-001',qty:30,price:6500},{sku:'OD2-001',qty:12,price:19500}])
await mkSale(feb(10),WH3,[{sku:'EL2-001',qty:4,price:138000},{sku:'PP2-001',qty:20,price:6500},{sku:'OD2-001',qty:15,price:19500}])
await mkSale(feb(12),WH3,[{sku:'EL2-001',qty:2,price:138000},{sku:'OD2-001',qty:18,price:19500},{sku:'PP2-001',qty:25,price:6500}])
await mkSale(feb(14),WH3,[{sku:'EL2-001',qty:3,price:138000},{sku:'OD2-001',qty:12,price:19500}])
await mkSale(feb(17),WH3,[{sku:'PP2-001',qty:30,price:6500},{sku:'OD2-001',qty:15,price:19500},{sku:'EL2-001',qty:2,price:138000}])
await mkSale(feb(19),WH3,[{sku:'EL2-001',qty:3,price:138000},{sku:'PP2-001',qty:20,price:6500}])
await mkSale(feb(21),WH3,[{sku:'OD2-001',qty:20,price:19500},{sku:'PP2-001',qty:25,price:6500},{sku:'EL2-001',qty:2,price:138000}])
await mkSale(feb(24),WH3,[{sku:'EL2-001',qty:3,price:138000},{sku:'OD2-001',qty:15,price:19500},{sku:'PP2-001',qty:20,price:6500}])
await mkSale(feb(26),WH3,[{sku:'EL2-001',qty:2,price:138000},{sku:'OD2-001',qty:12,price:19500},{sku:'PP2-001',qty:15,price:6500}])
await mkSale(feb(28),WH3,[{sku:'EL2-001',qty:3,price:138000},{sku:'PP2-001',qty:20,price:6500},{sku:'OD2-001',qty:10,price:19500}])

// ─────────────────────────────────────────────────────────────
// 9. RETURNS  (field: 'number', 'reason'; return_items.sell_price)
// ─────────────────────────────────────────────────────────────
step('8. Возвраты')

// Get a few completed sales for returns
const { data: wh1Sales } = await svc.from('sales').select('id,warehouse_id').eq('warehouse_id', WH1).eq('status','completed').limit(3)
const { data: wh2Sales } = await svc.from('sales').select('id,warehouse_id').eq('warehouse_id', WH2).eq('status','completed').limit(2)

async function mkReturn(num: string, date: string, saleId: string, wh: string, reason: string, items: {sku: string; qty: number; price: number}[]) {
  const total = items.reduce((s,i) => s + i.qty * i.price, 0)
  const { data: ret } = await svc.from('returns').insert({ number: num, date, sale_id: saleId, warehouse_id: wh, status: 'completed', total, reason }).select('id').single()
  if (!ret) { fail(num); return }
  for (const item of items) {
    await svc.from('return_items').insert({ return_id: ret.id, product_id: P[item.sku], qty: item.qty, sell_price: item.price })
    await addStock(wh, item.sku, item.qty)
  }
  ok(`${num}  ${date}  ${total.toLocaleString('ru-RU')} ₸  — ${reason}`)
}

if (wh1Sales && wh1Sales.length >= 2) {
  await mkReturn('RT-WH1-0001', feb(5),  wh1Sales[0].id, WH1, 'Брак упаковки',        [{sku:'OD-001',qty:1,price:28000}])
  await mkReturn('RT-WH1-0002', feb(12), wh1Sales[1].id, WH1, 'Не подошёл размер',    [{sku:'OD-002',qty:2,price:18500}])
  await mkReturn('RT-WH1-0003', feb(20), wh1Sales[2].id, WH1, 'Механическое повреждение', [{sku:'EL-004',qty:1,price:12000}])
}
if (wh2Sales && wh2Sales.length >= 2) {
  await mkReturn('RT-WH2-0001', feb(8),  wh2Sales[0].id, WH2, 'Дефект товара',        [{sku:'EL-005',qty:2,price:8500}])
  await mkReturn('RT-WH2-0002', feb(19), wh2Sales[1].id, WH2, 'Ошибка в заказе',      [{sku:'OD-004',qty:5,price:3200}])
}

// ─────────────────────────────────────────────────────────────
// ИТОГ
// ─────────────────────────────────────────────────────────────
step('9. Готово')
log('')
log('\x1b[1m\x1b[37m═══════════════════════════════════════════════════\x1b[0m')
log('\x1b[1m  ДАННЫЕ ЗАГРУЖЕНЫ  \x1b[0m')
log('\x1b[1m\x1b[37m═══════════════════════════════════════════════════\x1b[0m')
log('')
log(`  Выручка за февраль 2026: \x1b[33m~${Math.round(totalRevenue/1_000_000*10)/10} млн ₸\x1b[0m`)
log(`  Закуплено на: ~${Math.round(purTotal/1_000_000*10)/10} млн ₸`)
log('')
log('\x1b[1m  УЧЁТНЫЕ ДАННЫЕ\x1b[0m')
log(`  Пароль (все): \x1b[32m${PASS}\x1b[0m`)
log('')
log('  \x1b[34m[АДМИНИСТРАТОР]\x1b[0m')
log('  Email : admin@wms.kz')
log(`  Пароль: ${PASS}`)
log('')
log('  \x1b[34m[ВЛАДЕЛЬЦЫ]\x1b[0m')
for (const u of DEFS.filter(x => x.role === 'owner')) {
  log(`  ${u.name}`)
  log(`    Email : ${u.email}`)
  log(`    Пароль: ${PASS}`)
}
log('')
log('  \x1b[34m[РАБОТНИКИ]\x1b[0m')
const wrkMeta = [{...DEFS[2], wh:'Алматы Центральный'},{...DEFS[3],wh:'Алматы Южный'},{...DEFS[4],wh:'Астана Главный'}]
for (const u of wrkMeta) {
  log(`  ${u.name}`)
  log(`    Email : ${u.email}`)
  log(`    Пароль: ${PASS}`)
  log(`    Склад : ${u.wh}`)
}
log('')
log('\x1b[1m\x1b[37m═══════════════════════════════════════════════════\x1b[0m')

}

main().catch(console.error)
