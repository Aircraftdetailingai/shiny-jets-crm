/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: { buildActivity: false },
  experimental: {
    serverComponentsExternalPackages: ['bcryptjs', 'jose', 'nanoid']
  }
}

module.exports = nextConfig
