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

/**
 * singlefile 会把整份 CSS 放进一个 HTML <style> 标签。Geoman 的文字工具
 * 图标是内联 SVG，其中又包含一个真正的 </style>；HTML 解析器会把它误认
 * 为外层样式的结束标签，导致其后的 CSS 直接显示成页面文本。
 */
function protectInlineSvgStyleTags() {
  return {
    name: 'protect-inline-svg-style-tags',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== 'asset' || !output.fileName.endsWith('.html')) continue
        const html = String(output.source)
        output.source = html
          .replaceAll('<defs><style>', '<defs>%3Cstyle%3E')
          .replaceAll('</style></defs>', '%3C/style%3E</defs>')
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
    protectInlineSvgStyleTags(),
    inlineFavicon()
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  base: './',
})
