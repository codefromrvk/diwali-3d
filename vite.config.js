import { defineConfig, loadEnv } from 'vite';

/**
 * X, WhatsApp and LinkedIn only read og:/twitter: tags from static HTML, and need
 * absolute URLs for og:image / og:url. index.html uses a __SITE_URL__ placeholder,
 * filled at build time from SITE_URL (env or .env.production), else Vercel's
 * production domain. Empty in dev, which leaves root-relative paths.
 */
function socialMeta(env) {
  const raw = env.SITE_URL || env.VERCEL_PROJECT_PRODUCTION_URL || '';
  const site = raw ? (/^https?:\/\//.test(raw) ? raw : `https://${raw}`).replace(/\/+$/, '') : '';
  return {
    name: 'social-meta',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (!site) {
          if (!ctx.server) console.warn('\n(!) SITE_URL is not set: og:image will be relative and link previews on X, WhatsApp and LinkedIn will have no image.\n    Build with SITE_URL=https://your-domain npm run build\n');
          // a relative canonical / og:url is meaningless, and Vite tries to bundle <link href="/"> as an asset
          html = html.replace(/^[ \t]*<(?:link|meta)\b[^>]*"__SITE_URL__\/"[^>]*>\r?\n?/gm, '');
        }
        return html.replaceAll('__SITE_URL__', site);
      },
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [socialMeta(loadEnv(mode, process.cwd(), ''))],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    minify: 'esbuild'
  },
  server: {
    port: 3000,
    open: true
  }
}));
