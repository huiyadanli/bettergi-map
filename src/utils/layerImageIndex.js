/**
 * 分层地图构建资源索引。
 *
 * build 前由 prepare-layer-cache.js 从 public/layers 建立临时输入：
 * 普通构建输出带 hash 的资源 URL，single 构建输出内联 data URL。
 */
const images = import.meta.glob('../../layer-cache/**/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

const PREFIX = '../../layer-cache/';

export function getLayerImageUrl(mapName, layerId, format = 'webp') {
  return images[`${PREFIX}${mapName}/UI_Map_LayeredMap_${layerId}.${format}`] || null;
}
