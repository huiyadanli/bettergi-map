# bettergi-map

BetterGI·更好的原神 地图路径点位编辑器

包管理器使用 npm。复制 `.env.example` 为 `.env` 后即可本地开发，不必填写生产凭据。

| 变量 | 用途 |
|---|---|
| `VITE_BGI_VERSION` | 导出路线时写入的 BGI 版本 |
| `VITE_MODE` | `single` 为 BGI 内嵌模式，开发可留空 |

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

内嵌模式：

```sh
npm run dev:single
```

### Compile and Minify for Production

```sh
npm run build
```

