import sharp from 'sharp';
import { writeFileSync, existsSync, rmSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { MAPS } from '../src/config/mapConfig.js';

const BATCH_SIZE = 30;
const ROOT = resolve(import.meta.dirname, '..');
const TILES_DIR = join(ROOT, 'dist', 'tiles');

async function generateTilesForMap(map) {
  const TILE_SIZE = map.tileSize;
  const srcPath = join(ROOT, map.source);
  const outDir = join(TILES_DIR, map.name);

  if (!existsSync(srcPath)) {
    console.warn(`  [SKIP] 源图片不存在: ${srcPath}`);
    return null;
  }

  console.log(`  读取图片: ${map.source}`);
  const metadata = await sharp(srcPath, { limitInputPixels: false }).metadata();
  const W = metadata.width;
  const H = metadata.height;
  const maxDim = Math.max(W, H);
  console.log(`  尺寸: ${W} × ${H}`);

  const maxTileZoom = Math.max(0, Math.floor(Math.log2(maxDim / TILE_SIZE)));
  console.log(`  maxTileZoom: ${maxTileZoom}`);

  // 一次性解码为 raw buffer
  console.log(`  解码中...`);
  const { data: rawBuffer, info } = await sharp(srcPath, { limitInputPixels: false })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  console.log(`  解码完成, ${(rawBuffer.length / 1024 / 1024).toFixed(1)} MB (channels=${channels})`);

  const rawOpts = { raw: { width: W, height: H, channels }, limitInputPixels: false };

  let totalTiles = 0;

  for (let z = 0; z <= maxTileZoom; z++) {
    const gridSize = Math.pow(2, z);
    const imgPixelsPerTile = maxDim / gridSize;
    const cols = Math.min(gridSize, Math.ceil(W / imgPixelsPerTile));
    const rows = Math.min(gridSize, Math.ceil(H / imgPixelsPerTile));

    // 预创建目录
    for (let tx = 0; tx < cols; tx++) {
      mkdirSync(join(TILES_DIR, `${map.name}/${z}/${tx}`), { recursive: true });
    }

    console.log(`  zoom ${z}: ${cols}×${rows} = ${cols * rows} 瓦片 (${imgPixelsPerTile.toFixed(0)}px/tile)`);

    const tasks = [];
    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < cols; tx++) {
        const left = Math.round(tx * imgPixelsPerTile);
        const top = Math.round(ty * imgPixelsPerTile);
        const right = Math.min(Math.round((tx + 1) * imgPixelsPerTile), W);
        const bottom = Math.min(Math.round((ty + 1) * imgPixelsPerTile), H);
        if (left >= W || top >= H) continue;

        const tw = right - left;
        const th = bottom - top;
        const outFile = join(TILES_DIR, `${map.name}/${z}/${tx}/${ty}.webp`);
        tasks.push({ left, top, width: tw, height: th, outFile });
      }
    }

    for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
      const batch = tasks.slice(i, i + BATCH_SIZE);
      const posKey = W >= H ? 'top' : 'left';
      await Promise.all(batch.map(t => {
        return sharp(rawBuffer, rawOpts)
          .extract({ left: t.left, top: t.top, width: t.width, height: t.height })
          .resize(TILE_SIZE, TILE_SIZE, { fit: 'contain', position: posKey, background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .webp({ quality: map.quality || 80 })
          .toFile(t.outFile);
      }));
    }

    totalTiles += tasks.length;
  }

  console.log(`  总计 ${totalTiles} 个瓦片`);

  return {
    imageWidth: W,
    imageHeight: H,
    maxDim,
    maxTileZoom,
    tileSize: TILE_SIZE,
  };
}

async function main() {
  // 清空瓦片输出目录
  if (existsSync(TILES_DIR)) {
    rmSync(TILES_DIR, { recursive: true });
    console.log('已清空 dist/tiles/\n');
  }

  console.log('开始生成瓦片\n');
  const tileMaps = Object.values(MAPS).filter(m => m.enableTiles);
  const allMeta = {};
  for (const map of tileMaps) {
    console.log(`[${map.name}]`);
    const meta = await generateTilesForMap(map);
    if (meta) allMeta[map.name] = meta;
    console.log('');
  }

  // meta 写入 dist/tiles/meta.js，供运行时动态加载
  const metaJs = `// 由 generate-tiles 脚本自动生成，勿手动修改\nwindow.__TILE_META__=${JSON.stringify(allMeta)};\n`;
  writeFileSync(join(TILES_DIR, 'meta.js'), metaJs);
  console.log('生成 dist/tiles/meta.js');

  // 删除 dist 中已切瓦片的原图
  const resolutions = [512, 1024, 2048, 4096, 8192];
  for (const map of tileMaps) {
    const filename = map.source.split('/').pop();
    const match = filename.match(/(\d+)(?:_map)?\.\w+$/);
    if (!match) continue;
    const prefix = filename.slice(0, match.index);
    const suffix = filename.slice(match.index + match[1].length);
    for (const r of resolutions) {
      const variant = prefix + r + suffix;
      const distPath = join(ROOT, 'dist', variant);
      if (existsSync(distPath)) {
        rmSync(distPath);
        console.log(`已删除 dist/${variant}`);
      }
    }
  }

  console.log('全部完成');
}

main().catch(err => {
  console.error('生成失败:', err);
  process.exit(1);
});
