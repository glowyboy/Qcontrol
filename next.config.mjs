/** @type {import('next').NextConfig} */
const nextConfig = {
  // 'export' only used in CI build — dev mode runs normally
  ...(process.env.NODE_ENV === 'production' ? { output: 'export' } : {}),
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
