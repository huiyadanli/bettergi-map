import { fileURLToPath, URL } from 'node:url'
import { existsSync, statSync, createReadStream } from 'node:fs'
import { join, resolve, extname, posix } from 'node:path'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // dev 时将 /tiles 请求代理到 dist/tiles/，让瓦片在开发模式可用
    {
      name: 'serve-dist-tiles',
      configureServer(server) {
        const base = resolve('dist/tiles');
        server.middlewares.use('/tiles', (req, res, next) => {
          // 去掉 query string
          const urlPath = decodeURIComponent(req.url.split('?')[0]);
          const filePath = join(base, urlPath);
          if (!filePath.startsWith(base) || !existsSync(filePath) || !statSync(filePath).isFile()) {
            return next();
          }
          const types = { '.webp': 'image/webp', '.js': 'text/javascript' };
          res.setHeader('Content-Type', types[extname(filePath)] || 'application/octet-stream');
          createReadStream(filePath).pipe(res);
        });
      }
    }
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  base: './',
})
