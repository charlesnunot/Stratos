import React from "react"
import type { Metadata } from "next"
import dynamic from "next/dynamic"
import { Inter } from "next/font/google"
import "./globals.css"
import { QueryProvider } from "@/lib/providers/QueryProvider"
import { defaultLocale } from "@/i18n/config"

const Toaster = dynamic(
  () =>
    import("@/components/ui/toaster").then((mod) => ({
      default: mod.Toaster,
    })),
  { ssr: false, loading: () => null }
)

const inter = Inter({ 
  subsets: ["latin"],
  display: 'swap',
  fallback: ['system-ui', 'arial'],
})

export const metadata: Metadata = {
  title: "Stratos - Social E-commerce Platform",
  description: "An integrated platform combining social networking, e-commerce, and instant messaging",
  icons: { icon: "/icon.svg" },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Default locale, will be updated by LocaleScript component
  return (
    <html lang={defaultLocale} dir="ltr">
      <body className={inter.className}>
        <QueryProvider>
          {children}
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  )
}
