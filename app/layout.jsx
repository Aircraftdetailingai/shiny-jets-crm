import './globals.css'
import InstallPrompt from '@/components/InstallPrompt'
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar'
import Providers from '@/components/Providers'

export const metadata = {
  title: 'Vector - Aircraft Detailing Quotes',
  description: 'Professional quoting software for aircraft detailers',
  manifest: '/manifest.json',
  themeColor: '#1e3a5f',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Vector',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body>
        <Providers>
          {children}
        </Providers>
        <InstallPrompt />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  )
}
