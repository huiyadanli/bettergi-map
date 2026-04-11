import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { resolve, join } from 'path'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from "vite-plugin-singlefile"

/**
 * Vite插件：将favicon.ico编码并内联到HTML中
 */
function inlineFavicon() {
  return {
    name: 'inline-favicon',
    enforce: 'post',
    closeBundle() {
      const distPath = resolve(process.cwd(), 'dist')
      const htmlPath = join(distPath, 'index.html')
      const faviconPath = join(distPath, 'favicon.ico')

      if (existsSync(htmlPath) && existsSync(faviconPath)) {
        let htmlContent = readFileSync(htmlPath, 'utf-8')
        const faviconBuffer = readFileSync(faviconPath)
        const base64Favicon = `data:image/x-icon;base64,${faviconBuffer.toString('base64')}`
        htmlContent = htmlContent.replace(
          /<link[^>]*rel=["']icon["'][^>]*>/gi,
          `<link rel="icon" type="image/x-icon" href="${base64Favicon}">`
        )
        writeFileSync(htmlPath, htmlContent, 'utf-8')
        try {
          unlinkSync(faviconPath)
        } catch (error) {
          console.warn('无法删除favicon.ico文件:', error.message)
        }
      }
    }
  }
}

// 读取构建时生成的瓦片 meta，通过 define 注入
const metaPath = resolve('tile-cache/meta.json')
const tileMeta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf-8')) : {}

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __TILE_META__: JSON.stringify(tileMeta),
  },
  build: {
    assetsInlineLimit: 100 * 1024 * 1024, // 100MB，覆盖所有瓦片
  },
  plugins: [
    vue(),
    viteSingleFile(),
    inlineFavicon()
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  base: './',
})
