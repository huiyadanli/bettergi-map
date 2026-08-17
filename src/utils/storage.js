/**
 * 编辑器本地存储读写。
 *
 * 本模块只负责带前缀的 localStorage 序列化，不拥有业务状态。
 */

/**
 * 将值写入本地存储。
 *
 * 键会自动加上 bgiMap 前缀，值为 JSON 序列化结果。
 */
export function saveLocal(k, v) {
  localStorage.setItem('bgiMap' + k, JSON.stringify(v));
}

/**
 * 从本地存储读取值。
 *
 * 找不到键时返回原始空结果，找到则按 JSON 解析。
 */
export function loadLocal(k) {
  const val = localStorage.getItem('bgiMap' + k);
  if (!val) return val;
  return JSON.parse(val);
}
