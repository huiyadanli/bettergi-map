/**
 * 文件选择列表的类型判断和图标。
 *
 * 本模块只根据条目元数据判断类型，不访问文件系统。
 */

/**
 * 判断条目是否为可导入的 JSON 文件。
 */
export function isJsonFile(item) {
  return !item.IsDirectory && item.Name.endsWith('.json');
}

/**
 * 按目录 / JSON / 其他文件返回列表图标。
 */
export function getFileIcon(item) {
  if (item.IsDirectory) {
    return '📁';
  } else if (item.Name.endsWith('.json')) {
    return '📄';
  } else {
    return '📋';
  }
}
