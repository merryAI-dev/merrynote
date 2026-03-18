import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // 오디오 파일 업로드를 위해 body size 확장
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
}

export default nextConfig
