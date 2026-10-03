/**
 * 点位数据覆盖。
 *
 * 负责打开弹窗，并把所选源点位字段覆盖到目标点位。
 */
import {Message} from '@arco-design/web-vue';
import {
  dataOverrideTarget,
  polylines,
  selectedPointIndex,
  selectedPolylineIndex,
  showDataOverrideModal,
} from '../stores/editor';
import {selectPoint, updateMapFromPolyLine} from './useRoutes';

export function openDataOverrideModal(record) {
  dataOverrideTarget.value = record;
  showDataOverrideModal.value = true;
}

export function closeDataOverrideModal() {
  showDataOverrideModal.value = false;
  dataOverrideTarget.value = null;
}

export function applyDataOverride(sourceId, fields) {
  const polyline = polylines.value[selectedPolylineIndex.value];
  const target = dataOverrideTarget.value;
  const source = polyline?.positions?.find((position) => position.id === sourceId);
  if (!target || !polyline?.positions?.includes(target) || !source || source === target) {
    Message.warning('请选择有效的数据源');
    return false;
  }
  if (!Object.values(fields).some(Boolean)) {
    Message.warning('请至少勾选一项需要覆盖的数据');
    return false;
  }

  if (fields.coordinate) {
    target.x = source.x;
    target.y = source.y;
  }
  if (fields.type) target.type = source.type;
  if (fields.moveMode) target.move_mode = source.move_mode;
  if (fields.action) {
    target.action = source.action;
    target.action_params = source.action_params;
  }

  updateMapFromPolyLine(polyline);
  if (selectedPointIndex.value === polyline.positions.indexOf(target)) selectPoint(target);
  Message.success('数据覆盖完成');
  closeDataOverrideModal();
  return true;
}
