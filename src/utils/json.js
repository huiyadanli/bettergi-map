/**
 * JSON 序列化与对象合并。
 *
 * 本模块只处理纯数据变换，不读写文件或界面状态。
 */

/**
 * 按键名排序后序列化对象。
 *
 * 导出路线时用来保持字段顺序稳定，便于和旧文件对比。
 */
export function JSONStringifyOrdered(obj, space) {
  const allKeys = new Set();
  JSON.stringify(obj, (key, value) => (allKeys.add(key), value));
  return JSON.stringify(obj, Array.from(allKeys).sort(), space);
}

/**
 * 深度合并 source 到 target。
 *
 * 数组直接覆盖，纯对象递归合并，其余值覆盖。用于导出时保留旧文件自定义字段。
 */
export function deepMerge(target, source) {
  // 判断是否为通过 {} 或 new Object 创建的纯对象
  const isPlainObject = (obj) => {
    return Object.prototype.toString.call(obj) === '[object Object]';
  };

  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (Array.isArray(sourceValue)) {
        target[key] = sourceValue.slice();
      } else if (isPlainObject(sourceValue)) {
        if (!isPlainObject(targetValue)) {
          target[key] = {};
        }
        deepMerge(target[key], sourceValue);
      } else {
        target[key] = sourceValue;
      }
    }
  }
  return target;
}
