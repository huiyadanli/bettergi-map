/**
 * 瓦片内联索引
 *
 * 通过 import.meta.glob 将 tile-cache/ 下所有 .webp 文件导入为 data URL，
 * vite-plugin-singlefile 会将它们全部内联到最终 HTML 中。
 */

const tiles = import.meta.glob('../../tile-cache/**/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

const PREFIX = '../../tile-cache/';

export function getTileUrl(key) {
  return tiles[PREFIX + key] || null;
}

export const hasTiles = Object.keys(tiles).length > 0;
