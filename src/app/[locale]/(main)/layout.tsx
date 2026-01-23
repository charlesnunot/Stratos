import React from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen overflow-x-hidden max-w-full">
      <Sidebar />
      <div className="flex-1 md:ml-64 min-w-0 max-w-full overflow-x-hidden">
        <TopBar />
        <main className="p-4 md:p-6 max-w-full overflow-x-hidden">{children}</main>
      </div>
    </div>
  )
}
