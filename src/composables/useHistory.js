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
  map,
  highlightMarker,
} from '../stores/editor';

// 正在从历史恢复，避免 watch 再写入一条快照
let isRestoring = false;

// historyStack is a shared store ref, while a snapshot belongs to exactly one
// route.  Keep track of the route represented by the current stack so a direct
// selectedPolylineIndex change (for example from the export dialog) cannot
// make undo restore another route's data.
let activeRoute = null;

function currentRoute() {
  return polylines.value[selectedPolylineIndex.value] || null;
}

function serializePolyline(polyline) {
  if (!polyline) return null;
  return JSON.stringify({
    positions: polyline.positions,
    info: polyline.info,
    name: polyline.name,
    tags: polyline.tags,
    enable_monster_loot_split: polyline.enable_monster_loot_split,
    map_match_method: polyline.map_match_method
  });
}

function appendSnapshot(snapshot) {
  if (!snapshot) return;
  if (historyStack.value[historyPointer.value] === snapshot) return;

  historyStack.value = historyStack.value.slice(0, historyPointer.value + 1);
  historyStack.value.push(snapshot);
  if (historyStack.value.length > MAX_HISTORY) {
    historyStack.value.shift();
  }
  historyPointer.value = historyStack.value.length - 1;
}

/**
 * 将撤销栈切换到当前路线。
 *
 * 路线切换时采用安全重置策略：当前路线从一条初始快照开始，绝不把
 * 另一条路线的快照带过来。调用方可以在切换后继续 snapshotPolyline。
 */
export function ensureHistoryRoute() {
  const route = currentRoute();
  if (route !== activeRoute) {
    activeRoute = route;
    historyStack.value = [];
    historyPointer.value = -1;
    if (route) {
      appendSnapshot(serializePolyline(route));
    }
  } else if (!route && (historyStack.value.length > 0 || historyPointer.value !== -1)) {
    // A map switch can clear polylines before Vue's watcher gets a chance to
    // run.  Keep the exposed canUndo/canRedo state correct immediately.
    historyStack.value = [];
    historyPointer.value = -1;
  }
  return route;
}

/**
 * Explicitly reset history after a lifecycle-level route collection change.
 */
export function resetHistory() {
  activeRoute = null;
  historyStack.value = [];
  historyPointer.value = -1;
  ensureHistoryRoute();
}

function clearRestoredPointSelection() {
  if (highlightMarker.value) {
    if (typeof map.value?.removeLayer === 'function') {
      map.value.removeLayer(highlightMarker.value);
    }
    highlightMarker.value = null;
  }
  selectedPointIndex.value = -1;
}

/**
 * 为当前选中路线压入一条历史快照。
 */
export function snapshotPolyline() {
  const polyline = ensureHistoryRoute();
  if (!polyline) return;
  appendSnapshot(serializePolyline(polyline));
}

/**
 * 把指定历史指针的快照写回当前路线和地图折线。
 */
export function restoreFromHistory(pointer) {
  const polyline = ensureHistoryRoute();
  if (!polyline || !Number.isInteger(pointer) || pointer < 0 || pointer >= historyStack.value.length) return;

  isRestoring = true;
  let snapshot;
  try {
    snapshot = JSON.parse(historyStack.value[pointer]);
  } catch (error) {
    console.warn('无法读取撤销快照:', error);
    isRestoring = false;
    return;
  }
  if (!Array.isArray(snapshot.positions)) {
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
  if (typeof polyline.layer?.setLatLngs === 'function') {
    polyline.layer.setLatLngs(latlngs);
  }
  clearRestoredPointSelection();
  nextTick(() => {
    isRestoring = false;
  });
}

/**
 * 手动保存当前路线并提示。
 */
export function saveCurrentRoute() {
  snapshotPolyline();
  Message.info('已记录当前编辑状态；需要落盘请使用导出路线');
}

/**
 * 撤销一步。
 */
export function undoStep() {
  ensureHistoryRoute();
  if (!canUndo.value) return;
  historyPointer.value--;
  restoreFromHistory(historyPointer.value);
}

/**
 * 重做一步。
 */
export function redoStep() {
  ensureHistoryRoute();
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
      const polyline = currentRoute();
      // Include route identity in the watched value.  Two routes can have
      // identical JSON, but their histories must still be isolated.
      return {
        polyline,
        snapshot: serializePolyline(polyline),
      };
    },
    (state) => {
      if (state.polyline !== activeRoute) {
        // This also handles callers that assign selectedPolylineIndex directly
        // instead of going through selectPolyline.
        activeRoute = state.polyline;
        historyStack.value = [];
        historyPointer.value = -1;
        if (state.snapshot) appendSnapshot(state.snapshot);
        return;
      }
      if (!state.snapshot || isRestoring) return;
      appendSnapshot(state.snapshot);
    }
  );
}
