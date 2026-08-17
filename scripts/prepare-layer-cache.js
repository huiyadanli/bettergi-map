import {cpSync, existsSync, readdirSync, rmSync} from 'node:fs';
import {join, resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = join(root, 'public', 'layers');
const target = join(root, 'layer-cache');
const cleanup = process.argv.includes('--cleanup');

if (cleanup) {
  if (existsSync(target)) rmSync(target, {recursive: true});
  console.log('已清理 layer-cache');
  process.exit(0);
}

if (!existsSync(source)) throw new Error(`缺少分层资源目录：${source}`);
if (existsSync(target)) rmSync(target, {recursive: true});
cpSync(source, target, {recursive: true});

const maps = readdirSync(target, {withFileTypes: true}).filter((item) => item.isDirectory());
console.log(`已准备分层构建资源：${maps.length} 个地图目录`);
