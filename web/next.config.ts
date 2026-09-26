import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
