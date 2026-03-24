'use client'

import { ConfigProvider } from 'antd'
import ruRU from 'antd/locale/ru_RU'
import dayjs from 'dayjs'
import 'dayjs/locale/ru'

dayjs.locale('ru')

export default function AntdProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      locale={ruRU}
      theme={{
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 6,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        },
        components: {
          Layout: {
            siderBg: '#001529',
            headerBg: '#fff',
          },
        },
      }}
    >
      {children}
    </ConfigProvider>
  )
}
