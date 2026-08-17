/**
 * 当前路线的撤销重做。
 *
 * 只快照选中路线的点位和元信息，不处理地图实例生命周期。
 */
import {watch, nextTick} from 'vue';
import L from 'leaflet';
import {Message} from '@arco-design/web-vue';
import {MAX_HISTORY} from '../constants/editor';
import {
  polylines,
  selectedPolylineIndex,
  historyStack,
  historyPointer,
  canUndo,
  canRedo,
  selectedPointIndex,
  coordinateConverter,
} from '../stores/editor';

// 正在从历史恢复，避免 watch 再写入一条快照
let isRestoring = false;

/**
 * 为当前选中路线压入一条历史快照。
 */
export function snapshotPolyline() {
  const polyline = polylines.value[selectedPolylineIndex.value];
  if (!polyline) return;
  const snapshot = JSON.stringify({
    positions: polyline.positions,
    info: polyline.info,
    name: polyline.name,
    tags: polyline.tags,
    enable_monster_loot_split: polyline.enable_monster_loot_split,
    map_match_method: polyline.map_match_method
  });
  if (historyStack.value[historyPointer.value] === snapshot) return;
  historyStack.value = historyStack.value.slice(0, historyPointer.value + 1);
  historyStack.value.push(snapshot);
  if (historyStack.value.length > MAX_HISTORY) {
    historyStack.value.shift();
  }
  historyPointer.value = historyStack.value.length - 1;
}

/**
 * 把指定历史指针的快照写回当前路线和地图折线。
 */
export function restoreFromHistory(pointer) {
  isRestoring = true;
  const snapshot = JSON.parse(historyStack.value[pointer]);
  const polyline = polylines.value[selectedPolylineIndex.value];
  if (!polyline) {
    isRestoring = false;
    return;
  }
  polyline.positions = snapshot.positions;
  polyline.info = snapshot.info;
  polyline.name = snapshot.name;
  polyline.tags = snapshot.tags;
  polyline.enable_monster_loot_split = snapshot.enable_monster_loot_split;
  polyline.map_match_method = snapshot.map_match_method;
  const latlngs = snapshot.positions.map((pos) => {
    const main1024Pos = coordinateConverter.value.gameToMain1024(pos.x, pos.y);
    return L.latLng(main1024Pos.y, main1024Pos.x);
  });
  polyline.layer.setLatLngs(latlngs);
  selectedPointIndex.value = -1;
  nextTick(() => {
    isRestoring = false;
  });
}

/**
 * 手动保存当前路线并提示。
 */
export function saveCurrentRoute() {
  snapshotPolyline();
  Message.success('已保存');
}

/**
 * 撤销一步。
 */
export function undoStep() {
  if (!canUndo.value) return;
  historyPointer.value--;
  restoreFromHistory(historyPointer.value);
}

/**
 * 重做一步。
 */
export function redoStep() {
  if (!canRedo.value) return;
  historyPointer.value++;
  restoreFromHistory(historyPointer.value);
}

/**
 * 监听当前路线变化并自动写入历史。
 */
export function watchRouteHistory() {
  watch(
    () => {
      const polyline = polylines.value[selectedPolylineIndex.value];
      if (!polyline) return null;
      return JSON.stringify({
        positions: polyline.positions,
        info: polyline.info,
        name: polyline.name,
        tags: polyline.tags,
        enable_monster_loot_split: polyline.enable_monster_loot_split,
        map_match_method: polyline.map_match_method
      });
    },
    (newVal) => {
      if (!newVal || isRestoring) return;
      if (historyStack.value.length === 0) {
        historyStack.value.push(newVal);
        historyPointer.value = 0;
      } else if (newVal !== historyStack.value[historyPointer.value]) {
        historyStack.value = historyStack.value.slice(0, historyPointer.value + 1);
        historyStack.value.push(newVal);
        if (historyStack.value.length > MAX_HISTORY) {
          historyStack.value.shift();
        }
        historyPointer.value = historyStack.value.length - 1;
      }
    }
  );
}
