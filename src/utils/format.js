/**
 * 点位坐标显示格式化。
 *
 * 本模块只做数字展示变换，不修改点位数据本身。
 */

/**
 * 将坐标格式化为最多两位小数。
 *
 * 去掉末尾多余的 0，避免表格里出现 1.00 这类冗余显示。
 */
export function formatNumber(num) {
  let str = num.toFixed(2);
  if (str.endsWith('.00')) {
    return str.slice(0, -3);
  } else if (str.endsWith('0')) {
    return str.slice(0, -1);
  } else {
    return str;
  }
}
