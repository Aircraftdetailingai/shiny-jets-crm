import './globals.css'
import { Inter } from 'next/font/google'
import InstallPrompt from '@/components/InstallPrompt'
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar'
import Providers from '@/components/Providers'

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  display: 'swap',
})

export const viewport = {
  themeColor: '#0F1117',
}

export const metadata = {
  title: 'Vector - Aircraft Detailing Quotes',
  description: 'Professional quoting software for aircraft detailers',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Vector',
  },
  alternates: {
    languages: {
      'en': 'https://vectorav.ai',
      'es': 'https://vectorav.ai/es',
      'pt': 'https://vectorav.ai/pt',
      'fr': 'https://vectorav.ai/fr',
      'de': 'https://vectorav.ai/de',
      'it': 'https://vectorav.ai/it',
      'nl': 'https://vectorav.ai/nl',
      'ja': 'https://vectorav.ai/ja',
      'zh': 'https://vectorav.ai/zh',
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
      <body className={`${inter.className} bg-v-charcoal text-v-text-primary antialiased`}>
        <Providers>
          {children}
        </Providers>
        <InstallPrompt />
        <ServiceWorkerRegistrar />
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){var o=new MutationObserver(function(m){m.forEach(function(r){r.addedNodes.forEach(function(n){if(n.id==='__vercel-toolbar'||n.id==='vercel-live-feedback'||(n.tagName==='SCRIPT'&&n.src&&n.src.includes('vercel-toolbar'))){n.remove()}})})});o.observe(document.documentElement,{childList:true,subtree:true});setTimeout(function(){o.disconnect()},10000)})();
        `}} />
      </body>
    </html>
  )
}
