import './globals.css'
import { Inter, Poppins } from 'next/font/google'
import InstallPrompt from '@/components/InstallPrompt'
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar'
import BrandedHomescreen from '@/components/BrandedHomescreen'
import Providers from '@/components/Providers'

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  display: 'swap',
  variable: '--font-inter',
})

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-poppins',
})

export const viewport = {
  themeColor: '#007CB1',
}

export const metadata = {
  title: 'Shiny Jets CRM - Aircraft Detailing Quotes',
  description: 'Professional quoting software for aircraft detailers',
  applicationName: 'Shiny Jets CRM',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Shiny Jets CRM',
  },
  alternates: {
    languages: {
      'en': 'https://crm.shinyjets.com',
      'es': 'https://crm.shinyjets.com/es',
      'pt': 'https://crm.shinyjets.com/pt',
      'fr': 'https://crm.shinyjets.com/fr',
      'de': 'https://crm.shinyjets.com/de',
      'it': 'https://crm.shinyjets.com/it',
      'nl': 'https://crm.shinyjets.com/nl',
      'ja': 'https://crm.shinyjets.com/ja',
      'zh': 'https://crm.shinyjets.com/zh',
    },
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
      <body className={`${inter.variable} ${poppins.variable} ${inter.className} bg-v-charcoal text-v-text-primary antialiased`}>
        <Providers>
          {children}
        </Providers>
        <InstallPrompt />
        <ServiceWorkerRegistrar />
        <BrandedHomescreen />
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){var o=new MutationObserver(function(m){m.forEach(function(r){r.addedNodes.forEach(function(n){if(n.id==='__vercel-toolbar'||n.id==='vercel-live-feedback'||(n.tagName==='SCRIPT'&&n.src&&n.src.includes('vercel-toolbar'))){n.remove()}})})});o.observe(document.documentElement,{childList:true,subtree:true});setTimeout(function(){o.disconnect()},10000)})();
        `}} />
      </body>
    </html>
  )
}
