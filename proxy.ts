import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

const PUBLIC_PATHS = ['/login', '/_next', '/api', '/favicon.ico']

const ROLE_PATHS: Record<string, string> = {
  '/admin': 'admin',
  '/owner': 'owner',
  '/worker': 'worker',
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Пропустить публичные пути
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  if (isPublic) {
    return NextResponse.next({ request })
  }

  const { supabaseResponse, user, supabase } = await updateSession(request)

  // Нет сессии → /login
  if (!user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  // Получить роль
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = profile?.role as string | undefined

  if (!role) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  // Проверить доступ к маршруту
  for (const [prefix, requiredRole] of Object.entries(ROLE_PATHS)) {
    if (pathname.startsWith(prefix) && role !== requiredRole) {
      const dashUrl = request.nextUrl.clone()
      dashUrl.pathname = `/${role}`
      return NextResponse.redirect(dashUrl)
    }
  }

  // Редирект с / на нужный дашборд
  if (pathname === '/') {
    const dashUrl = request.nextUrl.clone()
    dashUrl.pathname = `/${role}`
    return NextResponse.redirect(dashUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
