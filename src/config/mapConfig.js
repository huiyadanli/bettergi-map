/**
 * 地图统一配置
 *
 * quality 为 WebP 压缩质量（0-100），用于 generate-tiles 切瓦片时
 */

/**
 * 从地图文件名自动提取 resolution 并计算 pixelScale（兜底值，运行时会被实际图片尺寸覆盖）
 */
function getPixelScale(source) {
  const filename = source.split('/').pop();
  const match = filename.match(/(\d+)(?:_map)?\.\w+$/);
  if (!match) return 1;
  const resolution = parseInt(match[1]);
  if ([512, 1024, 2048, 4096, 8192].includes(resolution)) {
    return resolution / 1024;
  }
  return 1;
}

const MAPS = {
  Teyvat: {
    gameMapRows: 15,
    gameMapCols: 22,
    gameMapUpRows: 7,
    gameMapLeftCols: 15,
    displayName: '提瓦特大陆',
    source: 'public/1024_map.jpg',
    enableTiles: true,
    tileSize: 512,
    quality: 80,
  },
  TheChasm: {
    gameMapRows: 2,
    gameMapCols: 2,
    gameMapUpRows: 1,
    gameMapLeftCols: 1,
    displayName: '层岩巨渊',
    source: 'public/thechasm_1024_map.jpg',
    enableTiles: true,
    tileSize: 512,
    quality: 80,
  },
  Enkanomiya: {
    gameMapRows: 3,
    gameMapCols: 3,
    gameMapUpRows: 1,
    gameMapLeftCols: 1,
    displayName: '渊下宫',
    source: 'public/enkanomiya_1024_map.jpg',
    enableTiles: true,
    tileSize: 512,
    quality: 80,
  },
  SeaOfBygoneEras: {
    gameMapRows: 3,
    gameMapCols: 4,
    gameMapUpRows: 2,
    gameMapLeftCols: 5,
    displayName: '旧日之海',
    source: 'public/seaofbygoneeras_1024_map.jpg',
    enableTiles: true,
    tileSize: 512,
    quality: 80,
  },
  AncientSacredMountain: {
    gameMapRows: 4,
    gameMapCols: 4,
    gameMapUpRows: 1,
    gameMapLeftCols: 1,
    displayName: '远古圣山',
    source: 'public/ancientsacredmountain_1024.jpg',
    enableTiles: true,
    tileSize: 512,
    quality: 80,
  },
};

const runtimeMeta = typeof window !== 'undefined' ? window.__TILE_META__ : null;

// 自动计算派生字段
for (const [name, map] of Object.entries(MAPS)) {
  map.name = name;
  map.pixelScale = getPixelScale(map.source);
  map.meta = runtimeMeta?.[name] || null;
  map.tileDir = `./tiles/${name}`;
  map.mapImage = map.source.replace(/^public\//, './');
}

export { MAPS };
export { getPixelScale };
