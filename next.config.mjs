import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root: ~/work holds other lockfiles that Turbopack would
  // otherwise walk up to.
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },
};

export default nextConfig;
