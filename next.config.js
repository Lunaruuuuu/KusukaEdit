/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // react-konva/konva rely on the `canvas` package for some optional
  // server-side code paths that we never actually hit (we render
  // client-side only). This keeps Next's server bundler from trying
  // to resolve that native dependency during build.
  webpack: (config) => {
    config.externals = [...(config.externals || []), { canvas: "canvas" }];
    return config;
  },
};

module.exports = nextConfig;
