import type { Metadata } from 'next'
import { AntdRegistry } from '@ant-design/nextjs-registry'
import AntdProvider from '@/components/AntdProvider'
import './globals.css'

export const metadata: Metadata = {
  title: 'WMS ERP — Система управления складом',
  description: 'Система управления продажами и складским учётом',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ru" className="h-full">
      <body className="h-full">
        <AntdRegistry>
          <AntdProvider>{children}</AntdProvider>
        </AntdRegistry>
      </body>
    </html>
  )
}
