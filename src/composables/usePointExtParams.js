/**
 * 点位扩展参数编辑。
 *
 * 只读写 point_ext_params，不改点位坐标或路线结构。
 */
import {defaultPointExtParams} from '../constants/editor';
import {pointExtParams, showPointExtConfig} from '../stores/editor';

// 当前正在编辑扩展参数的点位记录
let curPointRecord;

/**
 * 打开扩展参数弹窗，没有旧值时用默认结构。
 */
export function editPointExtParams(record) {
  pointExtParams.value = record.point_ext_params || Object.assign({}, JSON.parse(JSON.stringify(defaultPointExtParams)));
  showPointExtConfig.value = true;
  curPointRecord = record;
}

/**
 * 把弹窗里的扩展参数写回当前点位。
 */
export function savePointExtParams() {
  if (curPointRecord) {
    curPointRecord.point_ext_params = JSON.parse(JSON.stringify(pointExtParams.value));
  }
}

/**
 * 清除点位上的扩展参数。
 */
export function deletePointExtParams(record) {
  delete record.point_ext_params;
}
