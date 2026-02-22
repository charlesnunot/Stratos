import React from "react"
import type { Metadata } from "next"
import dynamic from "next/dynamic"
import { Inter } from "next/font/google"
import "./globals.css"
import { QueryProvider, AuthProvider, SubscriptionProvider } from "@/lib/providers"
import { defaultLocale } from "@/i18n/config"
import { ErrorSuppressor } from "@/components/ErrorSuppressor"

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
  // 使用与侧边栏一致的 logo；若需标签页仅显示猫形（无 Stratos 文字），可放 logo-icon.png 并改为 icon: "/logo-icon.png"
  icons: { icon: "/logo.png" },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Default locale, will be updated by LocaleScript component
  const abortErrorSuppressScript = `
(function(){
  function isAbort(e){
    if(!e) return false;
    var n=(e&&e.name)||'', m=String((e&&e.message)||'');
    if(n==='AbortError') return true;
    return /aborted|cancelled|signal is aborted/i.test(m);
  }
  window.addEventListener('unhandledrejection',function(ev){
    if(isAbort(ev.reason)){
      ev.preventDefault();
      ev.stopImmediatePropagation();
    }
  },true);
})();
`.replace(/\n\s*/g, ' ')

  return (
    <html lang={defaultLocale} dir="ltr">
      <body className={inter.className}>
        <script dangerouslySetInnerHTML={{ __html: abortErrorSuppressScript }} />
        <ErrorSuppressor />
        <QueryProvider>
          <AuthProvider>
            <SubscriptionProvider>
              {children}
              <Toaster />
            </SubscriptionProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
