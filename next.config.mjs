/** @type {import('next').NextConfig} */
const nextConfig = {
  // Mark server-only packages as external (not bundled by webpack)
  serverExternalPackages: ['sql.js', 'pdf-parse', 'mammoth', 'postgres', '@supabase/supabase-js'],

  // Match existing URL convention (jobs/uk/, jobs/ie/)
  trailingSlash: true,

  // Rewrites for directory index files and root
  async rewrites() {
    return [
      {
        source: '/',
        destination: '/index.html',
      },
      {
        source: '/login',
        destination: '/candidate-auth.html',
      },
      {
        source: '/signup',
        destination: '/candidate-auth.html',
      },
      {
        source: '/recruiter-dashboard',
        destination: '/recruiter-dashboard.html',
      },
      {
        source: '/admin',
        destination: '/admin.html',
      },
      {
        source: '/stage2',
        destination: '/stage2.html',
      },
      {
        source: '/stage3',
        destination: '/stage3.html',
      },
      {
        source: '/jobs/uk/',
        destination: '/jobs/uk/index.html',
      },
      {
        source: '/jobs/ie/',
        destination: '/jobs/ie/index.html',
      },
    ];
  },
};

export default nextConfig;
