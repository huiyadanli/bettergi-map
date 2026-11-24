/**
 * 点位扩展参数编辑。
 *
 * 只读写 point_ext_params，不改点位坐标或路线结构。
 */
import {defaultPointExtParams} from '../constants/editor';
import {
  pointExtParams,
  polylines,
  selectedPolylineIndex,
  showPointExtConfig,
} from '../stores/editor';
import {snapshotPolyline} from './useHistory';

// 当前正在编辑扩展参数的点位记录
let editingSession;

function openPointExtParams(records, source) {
  editingSession = {route: polylines.value[selectedPolylineIndex.value], records};
  pointExtParams.value = JSON.parse(JSON.stringify(source));
  showPointExtConfig.value = true;
}

/**
 * 打开扩展参数弹窗，没有旧值时用默认结构。
 */
export function editPointExtParams(record) {
  const source = record?.point_ext_params || defaultPointExtParams;
  openPointExtParams([record], {
    ...defaultPointExtParams,
    ...source,
    misidentification: {...defaultPointExtParams.misidentification, ...source.misidentification},
  });
}

/**
 * 批量表单从空值开始，确认后完整替换每个目标的扩展参数。
 */
export function editBatchPointExtParams(records) {
  if (!records.length) return;
  openPointExtParams(records, {
    misidentification: {type: [], handling_mode: '', arrival_time: null},
    description: '',
    monster_tag: '',
  });
}

/**
 * 把弹窗里的扩展参数写回当前点位。
 */
export function savePointExtParams() {
  const session = editingSession;
  editingSession = undefined;
  const route = polylines.value[selectedPolylineIndex.value];
  if (!session || !route || !showPointExtConfig.value || session.route !== route) return;

  const targets = session.records.filter((record) => session.route.positions.includes(record));
  if (!targets.length) return;

  const {misidentification, ...fields} = pointExtParams.value;
  const draft = JSON.stringify({
    ...fields,
    misidentification: {
      ...misidentification,
      // 宿主用整数读取该字段，空值用 0 表示，不能导出 null。
      arrival_time: misidentification.arrival_time ?? 0,
    },
  });
  snapshotPolyline();
  for (const record of targets) {
    record.point_ext_params = JSON.parse(draft);
  }
  snapshotPolyline();
}

export function cancelPointExtParams() {
  editingSession = undefined;
  showPointExtConfig.value = false;
}

/**
 * 清除点位上的扩展参数。
 */
export function deletePointExtParams(record) {
  delete record.point_ext_params;
}
