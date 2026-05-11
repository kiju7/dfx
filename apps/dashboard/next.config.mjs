/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@agent-forge/db', '@agent-forge/shared'],
  serverExternalPackages: [],
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
