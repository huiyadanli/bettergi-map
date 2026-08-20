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
  // The form is edited through v-model.  Always give it its own object so a
  // cancelled dialog cannot mutate the point that opened it (a shallow copy is
  // not enough because misidentification is nested).
  const source = record?.point_ext_params || defaultPointExtParams;
  pointExtParams.value = JSON.parse(JSON.stringify(source));
  showPointExtConfig.value = true;
  curPointRecord = record;
}

/**
 * 把弹窗里的扩展参数写回当前点位。
 */
export function savePointExtParams() {
  // The modal emits cancel without calling this function, but also guard the
  // visibility state so a stale callback after cancellation cannot commit the
  // draft to the record.
  if (curPointRecord && showPointExtConfig.value) {
    curPointRecord.point_ext_params = JSON.parse(JSON.stringify(pointExtParams.value));
  }
  // Do not retain a reference to a record after the dialog is closed.  The
  // next open will always establish a fresh editing session.
  curPointRecord = undefined;
}

/**
 * 清除点位上的扩展参数。
 */
export function deletePointExtParams(record) {
  delete record.point_ext_params;
}
