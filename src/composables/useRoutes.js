/**
 * 路线与点位编辑。
 *
 * 负责折线增删改、点位表格同步和地图图层更新，不处理文件读写。
 */
import L from 'leaflet';
import {Message, Modal} from '@arco-design/web-vue';
import {MAPS} from '../config/mapConfig';
import {JSONStringifyOrdered, deepMerge} from '../utils/json';
import {
  currentMapName,
  currentMapConfig,
  coordinateConverter,
  map,
  polylines,
  selectedPolylineIndex,
  selectedPointIndex,
  highlightMarker,
  routePointTooltipsEnabled,
  newPointX,
  newPointY,
  newPointName,
  showAddPointModal,
} from '../stores/editor';
import {saveLocal} from '../utils/storage';
import {switchMap} from './useMap';
import {snapshotPolyline, ensureHistoryRoute} from './useHistory';
import {COORDINATE_PRECISION} from '../constants/editor';

const ROUTE_STYLE = Object.freeze({
  color: '#ff5964',
  weight: 3,
  opacity: 0.92,
  lineCap: 'round',
  lineJoin: 'round',
  pane: 'routePane',
});

const POINT_TYPE_LABELS = Object.freeze({
  teleport: '传送',
  path: '途经',
  target: '目标',
  orientation: '朝向',
});
const MOVE_MODE_LABELS = Object.freeze({
  walk: '行走',
  dash: '间歇冲刺',
  run: '持续奔跑',
  fly: '飞行',
  swim: '游泳',
  climb: '攀爬',
  jump: '跳跃',
});

let activeRoutePointMarkers = [];

function clearRoutePointMarkers() {
  activeRoutePointMarkers.forEach((marker) => {
    marker._routePointCleanup?.();
    marker.off?.();
    marker.remove?.();
  });
  activeRoutePointMarkers = [];
}

function formatPointCoordinate(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toFixed(COORDINATE_PRECISION).replace(/\.?0+$/, '');
}

function createPointTooltipContent(position, index, keepOpen, scheduleClose) {
  const card = document.createElement('div');
  card.className = 'route-point-card';
  card.addEventListener('mouseenter', keepOpen);
  card.addEventListener('mouseleave', scheduleClose);

  const header = document.createElement('div');
  header.className = 'route-point-card-header';
  const title = document.createElement('strong');
  title.textContent = `点位 ${index + 1}`;
  const badges = document.createElement('span');
  badges.className = 'route-point-card-badges';
  badges.textContent = `${POINT_TYPE_LABELS[position.type] || position.type || '途经'} · ${MOVE_MODE_LABELS[position.move_mode] || position.move_mode || '行走'}`;
  header.append(title, badges);

  const coordinates = document.createElement('div');
  coordinates.className = 'route-point-card-coordinates';
  const x = document.createElement('span');
  x.className = 'route-point-card-x';
  x.textContent = `X ${formatPointCoordinate(position.x)}`;
  const y = document.createElement('span');
  y.className = 'route-point-card-y';
  y.textContent = `Y ${formatPointCoordinate(position.y)}`;
  coordinates.append(x, y);

  const runButton = document.createElement('button');
  runButton.type = 'button';
  runButton.className = 'route-point-run';
  runButton.setAttribute('aria-label', `从点位 ${index + 1} 开始运行`);
  runButton.innerHTML = '<span aria-hidden="true">▶</span><span>从此处运行</span>';
  runButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    runFromPoint(index);
  });

  card.append(header, coordinates, runButton);
  L.DomEvent.disableClickPropagation(card);
  L.DomEvent.disableScrollPropagation(card);
  return card;
}

function refreshRoutePointMarkers() {
  clearRoutePointMarkers();
  if (!routePointTooltipsEnabled.value) return;
  const route = polylines.value[selectedPolylineIndex.value];
  if (!map.value || !route?.positions?.length || !map.value.getPane('routePointPane')) return;

  activeRoutePointMarkers = route.positions.map((position, index) => {
    const main1024Pos = coordinateConverter.value.gameToMain1024(position.x, position.y);
    const marker = L.circleMarker([main1024Pos.y, main1024Pos.x], {
      pane: 'routePointPane',
      radius: 8,
      color: 'transparent',
      weight: 0,
      opacity: 0,
      fillColor: '#ff5964',
      fillOpacity: 0,
      className: 'route-point-marker',
      pmIgnore: true,
    }).addTo(map.value);
    const tooltip = L.tooltip({
      className: 'route-point-tooltip',
      direction: 'top',
      offset: L.point(0, -9),
      opacity: 1,
      interactive: true,
    }, marker);
    marker._routePointTooltip = tooltip;
    let closeTimer = null;
    let removalTimer = null;
    let deferredRemoveMap = null;
    let deferredRemoveHandler = null;

    const cancelDeferredRemove = () => {
      if (deferredRemoveMap && deferredRemoveHandler) {
        deferredRemoveMap.off('zoomend', deferredRemoveHandler);
      }
      deferredRemoveMap = null;
      deferredRemoveHandler = null;
    };
    const removeTooltipSafely = () => {
      const tooltipMap = tooltip._map;
      if (!tooltipMap) return;
      if (tooltipMap._animatingZoom) {
        cancelDeferredRemove();
        deferredRemoveMap = tooltipMap;
        deferredRemoveHandler = () => {
          deferredRemoveMap = null;
          deferredRemoveHandler = null;
          tooltip.remove();
        };
        tooltipMap.once('zoomend', deferredRemoveHandler);
        return;
      }
      tooltip.remove();
    };

    const keepOpen = () => {
      if (closeTimer) clearTimeout(closeTimer);
      if (removalTimer) clearTimeout(removalTimer);
      closeTimer = null;
      removalTimer = null;
      cancelDeferredRemove();
      tooltip.getElement()?.classList.remove('is-leaving');
    };
    const closeTooltip = () => {
      closeTimer = null;
      marker.setRadius(8);
      marker.setStyle({color: 'transparent', weight: 0, opacity: 0, fillOpacity: 0});
      marker.getElement()?.classList.remove('is-hovered');
      const tooltipElement = tooltip.getElement();
      if (!tooltipElement) return;
      tooltipElement.classList.add('is-leaving');
      removalTimer = setTimeout(() => {
        removalTimer = null;
        removeTooltipSafely();
      }, 120);
    };
    const scheduleClose = () => {
      keepOpen();
      closeTimer = setTimeout(closeTooltip, 140);
    };

    marker.on('mouseover', () => {
      keepOpen();
      marker.setRadius(8);
      marker.setStyle({color: '#ffffff', weight: 2.5, opacity: 1, fillOpacity: 1});
      marker.getElement()?.classList.add('is-hovered');
      marker.bringToFront();
      tooltip
        .setLatLng(marker.getLatLng())
        .setContent(createPointTooltipContent(position, index, keepOpen, scheduleClose))
        .addTo(map.value);
    });
    marker.on('mouseout', scheduleClose);
    marker.on('click', () => selectPoint(position));
    marker._routePointCleanup = () => {
      if (closeTimer) clearTimeout(closeTimer);
      if (removalTimer) clearTimeout(removalTimer);
      closeTimer = null;
      removalTimer = null;
      removeTooltipSafely();
    };
    marker.on('remove', () => {
      marker._routePointCleanup();
    });
    return marker;
  });
}

export function setRoutePointTooltipsEnabled(enabled) {
  routePointTooltipsEnabled.value = Boolean(enabled);
  saveLocal('_routePointTooltipsEnabled', routePointTooltipsEnabled.value);
  refreshRoutePointMarkers();
}

function refreshRouteStyles() {
  polylines.value.forEach((route, index) => {
    if (typeof route.layer?.setStyle !== 'function') return;
    const active = index === selectedPolylineIndex.value;
    route.layer.setStyle({
      ...ROUTE_STYLE,
      color: active ? ROUTE_STYLE.color : '#ff9da4',
      weight: active ? 3.5 : 2.5,
      opacity: active ? 0.94 : 0.42,
    });
  });
  refreshRoutePointMarkers();
}

/**
 * 移除当前选中点的高亮标记。
 */
export function removeHighlightMarker() {
  if (highlightMarker.value) {
    // The map can be torn down while a marker reference is still present
    // (for example during a map switch).  Removing it should be idempotent.
    if (typeof map.value?.removeLayer === 'function') {
      map.value.removeLayer(highlightMarker.value);
    }
    highlightMarker.value = null;
  }
}

/**
 * 地图折线被 Geoman 编辑后同步点位数据。
 */
export function handleMapPointChange(e) {
  removeHighlightMarker();
  updatePolyline(e.target);
}

/**
 * 按当前点位数组重绘折线并重排序号。
 */
export function updateMapFromPolyLine(polyline) {
  if (!polyline || !Array.isArray(polyline.positions)) return;
  polyline.positions.forEach((item, index) => item.id = index + 1);
  const latlngs = polyline.positions.map((pos) => {
    const main1024Pos = coordinateConverter.value.gameToMain1024(pos.x, pos.y);
    return L.latLng(main1024Pos.y, main1024Pos.x);
  });
  if (typeof polyline.layer?.setLatLngs === 'function') {
    polyline.layer.setLatLngs(latlngs);
  }
  if (polylines.value[selectedPolylineIndex.value] === polyline) refreshRoutePointMarkers();
}

/**
 * 将表格里某个点的游戏坐标写回地图折线。
 */
export function updateMapFromTable(polylineIndex, positionIndex) {
  const polyline = polylines.value[polylineIndex];
  const position = polyline.positions[positionIndex];
  const main1024Pos = coordinateConverter.value.gameToMain1024(position.x, position.y);
  const latlngs = polyline.layer.getLatLngs();
  latlngs[positionIndex] = L.latLng(main1024Pos.y, main1024Pos.x);
  polyline.layer.setLatLngs(latlngs);
  if (polylineIndex === selectedPolylineIndex.value) refreshRoutePointMarkers();
}

/**
 * 更新指定点位字段，坐标变化时同步地图。
 */
export function updatePosition(polylineIndex, positionIndex, key, value) {
  const polyline = polylines.value[polylineIndex];
  polyline.positions[positionIndex][key] = value;
  updateMapFromTable(polylineIndex, positionIndex);
}

/**
 * 把 Leaflet 折线转成路线；有锁定行时插入到锁定位置。
 */
export function addPolyline(layer, name = '未命名路径') {
  layer?.setStyle?.(ROUTE_STYLE);
  const newPositions = layer.getLatLngs().map((latlng, index) => {
    const gamePos = coordinateConverter.value.main1024ToGame(latlng.lng, latlng.lat);
    return {
      id: index + 1,
      action: '',
      move_mode: 'walk',
      type: index === 0 ? 'teleport' : 'path',
      x: gamePos.x,
      y: gamePos.y,
      action_params: ''
    };
  });

  if (selectedPolylineIndex.value >= 0 && selectedPolylineIndex.value < polylines.value.length) {
    const currentPolyline = polylines.value[selectedPolylineIndex.value];
    const lockedIndex = currentPolyline.positions.findIndex((item) => item.locked);

    if (lockedIndex > -1) {
      const insertPositions = newPositions.map((pos, index) => ({
        ...pos,
        id: lockedIndex + index + 1
      }));

      currentPolyline.positions.splice(lockedIndex, 0, ...insertPositions);

      currentPolyline.positions.forEach((pos, index) => {
        pos.id = index + 1;
      });

      updateMapFromPolyLine(currentPolyline);

      currentPolyline.positions.forEach((item) => {
        item.locked = false;
      });

      map.value.removeLayer(layer);

      return;
    }
  }

  clearSelection();

  const newPolyline = {
    name: name,
    layer: layer,
    positions: newPositions,
    info: {
      name: name,
      authors: [],
      version: '1.0',
      description: ''
    }
  };
  polylines.value.push(newPolyline);
  selectedPolylineIndex.value = polylines.value.length - 1;
  refreshRouteStyles();
  snapshotPolyline();
  selectPolyline(selectedPolylineIndex.value);
}

/**
 * 把导入的 JSON 规范成当前编辑器使用的 info / authors 结构。
 */
function normalizeImportedInfo(importedData) {
  let processedInfo = {...importedData.info};

  if (processedInfo.author && !processedInfo.authors) {
    processedInfo.authors = [{
      name: processedInfo.author,
      links: ''
    }];
    delete processedInfo.author;
    delete importedData?.info?.author;
  }

  if (!processedInfo.authors || !Array.isArray(processedInfo.authors)) {
    processedInfo.authors = [];
  }

  return processedInfo;
}

/**
 * 按导入数据创建一条路线并加入地图。
 */
function createImportedPolyline(importedData, filePath, processedInfo) {
  const positions = importedData.positions.map((pos) => {
    const main1024Pos = coordinateConverter.value.gameToMain1024(pos.x, pos.y);
    return L.latLng(main1024Pos.y, main1024Pos.x);
  });
  const layer = L.polyline(positions, {
    ...ROUTE_STYLE,
  }).addTo(map.value);
  layer.on('pm:edit', handleMapPointChange);

  const newPolyline = {
    name: importedData.info.name,
    tags: importedData.info.tags || [],
    enable_monster_loot_split: !!importedData.info.enable_monster_loot_split,
    map_match_method: importedData.info.map_match_method || '',
    layer: layer,
    positions: importedData.positions.map((pos, index) => ({
      id: index + 1,
      x: pos.x,
      y: pos.y,
      action: pos.action || '',
      move_mode: pos.move_mode || 'walk',
      action_params: pos.action_params,
      type: pos.type || 'path',
      point_ext_params: pos.point_ext_params || undefined
    })),
    info: processedInfo,
    savedPath: filePath,
    oldFileData: importedData
  };
  polylines.value.push(newPolyline);
  selectedPolylineIndex.value = polylines.value.length - 1;
  refreshRouteStyles();
  snapshotPolyline();
  selectPolyline(selectedPolylineIndex.value);
}

/**
 * 导入单条路线，必要时先确认并切换地图。
 */
export async function addImportedPolyline(importedData, filePath = null) {
  const mapName = importedData.info.map_name || 'Teyvat';
  if (mapName !== currentMapName.value && MAPS[mapName]) {
    const mapDisplayName = MAPS[mapName].displayName;
    const currentMapDisplayName = MAPS[currentMapName.value].displayName;
    try {
      await new Promise((resolve, reject) => {
        Modal.confirm({
          title: '需要切换地图',
          content: `该脚本属于 ${mapDisplayName}，当前地图为 ${currentMapDisplayName}，需要切换地图后导入。`,
          okText: '确认切换',
          cancelText: '取消导入',
          onOk: () => resolve(),
          onCancel: () => reject(new Error('用户取消导入'))
        });
      });

      await switchMap(mapName);
    } catch (error) {
      console.log('用户取消导入:', error.message);
      return;
    }
  }

  createImportedPolyline(importedData, filePath, normalizeImportedInfo(importedData));
}

/**
 * 导入路线但不切换地图，供批量导入使用。
 */
export function addImportedPolylineWithoutMapSwitch(importedData, filePath = null) {
  createImportedPolyline(importedData, filePath, normalizeImportedInfo(importedData));
}

/**
 * 重命名指定路线。
 */
export function renamePolyline(index, newName) {
  polylines.value[index].name = newName;
}

/**
 * 按地图折线顶点更新对应路线的点位坐标。
 */
export function updatePolyline(layer) {
  const index = polylines.value.findIndex((p) => p.layer === layer);
  if (index !== -1) {
    const currentPositions = polylines.value[index].positions;
    const newLatLngs = layer.getLatLngs();

    if (currentPositions.length === newLatLngs.length) {
      currentPositions.forEach((pos, idx) => {
        const gamePos = coordinateConverter.value.main1024ToGame(newLatLngs[idx].lng, newLatLngs[idx].lat);
        pos.x = gamePos.x;
        pos.y = gamePos.y;
      });
    } else {
      const updatedPositions = newLatLngs.map((latlng, idx) => {
        const gamePos = coordinateConverter.value.main1024ToGame(latlng.lng, latlng.lat);
        const existingPosition = currentPositions.find((pos) => pos.x === gamePos.x && pos.y === gamePos.y);

        if (existingPosition) {
          return {
            ...existingPosition,
            id: idx + 1,
            x: gamePos.x,
            y: gamePos.y
          };
        } else {
          return {
            id: idx + 1,
            x: gamePos.x,
            y: gamePos.y,
            action: '',
            move_mode: 'walk',
            type: idx === 0 ? 'teleport' : 'path',
            action_params: ''
          };
        }
      });
      polylines.value[index].positions = updatedPositions;
    }
    if (index === selectedPolylineIndex.value) refreshRoutePointMarkers();
  }
}

/**
 * 选中一条路线并把地图中心移到该折线。
 */
export function selectPolyline(index) {
  const nextPolyline = polylines.value[index];
  if (!nextPolyline) {
    selectedPolylineIndex.value = -1;
    clearSelection();
    ensureHistoryRoute();
    refreshRoutePointMarkers();
    return;
  }

  const changed = selectedPolylineIndex.value !== index
    || polylines.value[selectedPolylineIndex.value] !== nextPolyline;
  selectedPolylineIndex.value = index;
  refreshRouteStyles();
  if (changed) {
    // A point index/highlight belongs to the previously selected route.
    // Carrying it over makes the table and map disagree after a route switch.
    clearSelection();
  }
  // Ensure the undo stack is associated with the newly selected route before
  // taking a snapshot.  This also prevents an undo on route B from restoring
  // a snapshot that belongs to route A.
  ensureHistoryRoute();
  snapshotPolyline();

  if (!map.value || typeof map.value.setView !== 'function'
    || typeof nextPolyline.layer?.getBounds !== 'function') return;
  const meta = currentMapConfig.value.meta;
  const maxZoom = meta ? meta.maxTileZoom : 5;
  const targetZoom = maxZoom + 1;
  const bounds = nextPolyline.layer.getBounds();
  const boundsValid = bounds && (typeof bounds.isValid !== 'function' || bounds.isValid());
  if (boundsValid) {
    const currentZoom = typeof map.value.getZoom === 'function' ? map.value.getZoom() : targetZoom;
    map.value.setView(bounds.getCenter(), Math.max(currentZoom, targetZoom));
  }
}

/**
 * 确认后删除一条路线（只删页面显示，不删本地文件）。
 */
export function deletePolyline(index) {
  const targetPolyline = polylines.value[index];
  if (!targetPolyline) return;

  Modal.confirm({
    title: '确认删除',
    content: '确定要删除该路线吗？此操作不可撤销。（仅删除当前页面显示，已存在的本地文件不会被删除）',
    okText: '删除',
    okButtonProps: {status: 'danger'},
    cancelText: '取消',
    onOk: () => {
      const routeCount = polylines.value.length;
      // Resolve the route again in case another operation changed the list
      // while the confirmation dialog was open.
      const targetIndex = polylines.value.indexOf(targetPolyline);
      if (targetIndex < 0 || targetIndex >= routeCount) return;
      const polyline = polylines.value[targetIndex];

      const previousSelectedIndex = selectedPolylineIndex.value;
      const deletingSelected = previousSelectedIndex === targetIndex;

      map.value?.removeLayer(polyline.layer);
      polylines.value.splice(targetIndex, 1);

      if (polylines.value.length === 0) {
        selectedPolylineIndex.value = -1;
        clearSelection();
        ensureHistoryRoute();
        refreshRoutePointMarkers();
        return;
      }

      let nextSelectedIndex = previousSelectedIndex;
      if (deletingSelected) {
        // Prefer the route that shifted into the removed route's slot, or the
        // previous last route when the removed item was at the end.
        nextSelectedIndex = Math.min(targetIndex, polylines.value.length - 1);
      } else if (previousSelectedIndex > targetIndex) {
        // Removing an item before the current selection shifts its index left.
        nextSelectedIndex = previousSelectedIndex - 1;
      }

      // If the old selection was already invalid, recover to a valid route
      // whenever one exists instead of leaving a stale index behind.
      if (nextSelectedIndex < 0 || nextSelectedIndex >= polylines.value.length) {
        nextSelectedIndex = Math.min(Math.max(targetIndex, 0), polylines.value.length - 1);
      }

      selectedPolylineIndex.value = nextSelectedIndex;
      refreshRouteStyles();
      if (deletingSelected || previousSelectedIndex < 0 || previousSelectedIndex >= routeCount) {
        clearSelection();
        ensureHistoryRoute();
        const nextPolyline = polylines.value[nextSelectedIndex];
        if (map.value && typeof map.value.setView === 'function'
          && typeof nextPolyline?.layer?.getBounds === 'function') {
          const bounds = nextPolyline.layer.getBounds();
          const boundsValid = bounds && (typeof bounds.isValid !== 'function' || bounds.isValid());
          if (boundsValid) {
            const meta = currentMapConfig.value.meta;
            const targetZoom = (meta ? meta.maxTileZoom : 5) + 1;
            const currentZoom = typeof map.value.getZoom === 'function' ? map.value.getZoom() : targetZoom;
            map.value.setView(bounds.getCenter(), Math.max(currentZoom, targetZoom));
          }
        }
      }
    }
  });
}

/**
 * 表格拖拽或编辑后回写点位，并尽量保持原选中点。
 */
export function handleChange(newData) {
  const polyline = polylines.value[selectedPolylineIndex.value];

  let selectedPoint = null;
  if (selectedPointIndex.value >= 0 && selectedPointIndex.value < polyline.positions.length) {
    const oldRecord = polyline.positions[selectedPointIndex.value];
    selectedPoint = {x: oldRecord.x, y: oldRecord.y};
  }

  newData.forEach((item, index) => item.id = index + 1);
  // 保留点位对象身份，供表格重排动画和选中状态稳定追踪。
  polyline.positions = [...newData];

  const latlngs = newData.map((pos) => {
    const main1024Pos = coordinateConverter.value.gameToMain1024(pos.x, pos.y);
    return L.latLng(main1024Pos.y, main1024Pos.x);
  });
  polyline.layer.setLatLngs(latlngs);

  if (selectedPoint) {
    const newIndex = polyline.positions.findIndex((pos) => pos.x === selectedPoint.x && pos.y === selectedPoint.y);
    if (newIndex !== -1) {
      selectedPointIndex.value = newIndex;
      const newRecord = polyline.positions[newIndex];
      selectPoint(newRecord);
    } else {
      selectedPointIndex.value = -1;
    }
  }
}

/**
 * 执行下拉菜单里绑定的点位操作。
 */
export function moreSelect(v) {
  v.onclick.call(null, v.record, v.rowIndex);
}

/**
 * 在指定行复制一个点位。
 */
export function copyPosition(record, rowIndex) {
  const polyline = polylines.value[selectedPolylineIndex.value];
  polyline.positions.splice(rowIndex, 0, Object.assign({}, record, {locked: false}));
  if (selectedPointIndex.value >= rowIndex) {
    selectedPointIndex.value += 1;
  }
  updateMapFromPolyLine(polyline);
}

/**
 * 锁定一行，作为后续插入点位的位置。
 */
export function lockRowIndex(record) {
  polylines.value[selectedPolylineIndex.value].positions.forEach((item) => {
    item.locked = false;
  });
  record.locked = true;
}

/**
 * 解锁一行。
 */
export function unlockRowIndex(record) {
  record.locked = false;
}

/**
 * 计算点位表格行的锁定/选中样式。
 */
export function setPositionRowClass(record, rowIndex) {
  let classes = ['point-row'];

  if (record.locked) {
    classes.push('locked');
  }

  if (rowIndex === selectedPointIndex.value) {
    classes.push('selected-row');
  }

  return classes.join(' ');
}

/**
 * 删除一个点位并维护选中下标。
 */
export function deletePosition(index) {
  const polyline = polylines.value[selectedPolylineIndex.value];
  if (!polyline || !Array.isArray(polyline.positions) || index < 0 || index >= polyline.positions.length) {
    // A stale table event can arrive after its route was removed or cleared.
    // It must not leave a point selected on a route that no longer owns it.
    if (!polyline || polyline.positions?.length === 0
      || selectedPointIndex.value >= (polyline.positions?.length ?? 0)) {
      clearSelection();
    }
    return;
  }

  polyline.positions.splice(index, 1);

  if (selectedPointIndex.value === index || polyline.positions.length === 0) {
    clearSelection();
  } else if (selectedPointIndex.value > index) {
    selectedPointIndex.value -= 1;
  } else if (selectedPointIndex.value < 0 && highlightMarker.value) {
    // A marker without a corresponding selected row is stale as well.
    clearSelection();
  }

  updateMapFromPolyLine(polyline);
}

/**
 * 打开添加点位弹窗并重置输入。
 */
export function openAddPointModal() {
  showAddPointModal.value = true;
  newPointX.value = 0;
  newPointY.value = 0;
  newPointName.value = '';
}

/**
 * 确认后清空当前路线全部点位。
 */
export function clearPoints() {
  Modal.confirm({
    title: '请确认',
    content: '确定要清除所有点位吗，此操作不可逆？',
    okText: '确认',
    cancelText: '取消',
    onOk: () => {
      const polyline = polylines.value[selectedPolylineIndex.value];
      if (polyline) {
        polyline.positions = [];
        updateMapFromPolyLine(polyline);
        clearSelection();
        snapshotPolyline();
      } else {
        // Keep selection state consistent even if the route was removed while
        // the confirmation dialog was open.
        clearSelection();
      }
    },
    onCancel: () => {
    },
  });
}

/**
 * 按游戏坐标添加一个点；没有路线时先建一条。
 */
export function addNewPoint(x, y) {
  const main1024Pos = coordinateConverter.value.gameToMain1024(x, y);
  const newPoint = {
    id: 1,
    x: x,
    y: y,
    type: 'path',
    move_mode: 'walk',
    action: '',
    action_params: ''
  };

  if (selectedPolylineIndex.value === -1 || polylines.value.length === 0) {
    const layer = L.polyline([L.latLng(main1024Pos.y, main1024Pos.x)], {
      ...ROUTE_STYLE,
    }).addTo(map.value);
    map.value.setZoom(2);
    layer.on('pm:edit', handleMapPointChange);
    addPolyline(layer, '未命名路径');
  } else {
    const polyline = polylines.value[selectedPolylineIndex.value];
    newPoint.id = polyline.positions.length + 1;
    if (polyline.positions.length === 0) {
      newPoint.type = 'teleport';
    }
    let lockedIndex = polyline.positions.findIndex((item) => item.locked);
    if (lockedIndex > -1) {
      polyline.positions.splice(lockedIndex, 0, newPoint);
      if (selectedPointIndex.value >= lockedIndex) {
        selectedPointIndex.value += 1;
      }
    } else {
      polyline.positions.push(newPoint);
    }

    updateMapFromPolyLine(polyline);
  }
}

/**
 * 从添加点位弹窗确认写入坐标。
 */
export function handleAddPointFromModal() {
  addNewPoint(newPointX.value, newPointY.value);
  showAddPointModal.value = false;
}

/**
 * 选中一个点，在地图上加高亮并居中。
 */
export function selectPoint(record) {
  const polyline = polylines.value[selectedPolylineIndex.value];
  const actualIndex = polyline?.positions?.findIndex((pos) => pos === record) ?? -1;
  if (!polyline || actualIndex < 0 || !record) {
    clearSelection();
    return;
  }

  removeHighlightMarker();

  selectedPointIndex.value = actualIndex;

  const main1024Pos = coordinateConverter.value.gameToMain1024(record.x, record.y);

  if (!map.value) return;
  highlightMarker.value = L.marker([main1024Pos.y, main1024Pos.x], {
    icon: L.divIcon({
      className: 'highlight-marker',
      html: '<div style="background-color: #ff5964; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 0 4px rgb(255 89 100 / 24%), 0 2px 6px rgb(35 48 67 / 30%);"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    })
  }).addTo(map.value);

  const meta = currentMapConfig.value.meta;
  const targetZoom = (meta ? meta.maxTileZoom : 5) + 1;
  map.value.setView([main1024Pos.y, main1024Pos.x], Math.max(map.value.getZoom(), targetZoom));
}

/**
 * 清除点位选中态和高亮。
 */
export function clearSelection() {
  removeHighlightMarker();
  selectedPointIndex.value = -1;
}

/**
 * 按给定顺序创建一条合并路线。
 *
 * 默认保留源路线；只有显式传入 removeSources 才移除本次选中的源路线。
 * 未选中的路线不受影响。
 */
export function mergePolylines(routes, name, removeSources = false) {
  const sourceRoutes = routes.filter((route, index, list) => (
    polylines.value.includes(route) && list.indexOf(route) === index
  ));
  const mergedName = String(name || '').trim();

  if (sourceRoutes.length < 2) {
    Message.warning('请至少选择两条路线');
    return false;
  }
  if (!mergedName) {
    Message.warning('请填写合并后的路线名称');
    return false;
  }

  const cloneData = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
  const positions = sourceRoutes.flatMap((route) => cloneData(route.positions || []));
  positions.forEach((position, index) => {
    position.id = index + 1;
  });

  const firstRoute = sourceRoutes[0];
  const info = cloneData(firstRoute.info || {});
  info.name = mergedName;

  const latlngs = positions.map((position) => {
    const main1024Pos = coordinateConverter.value.gameToMain1024(position.x, position.y);
    return L.latLng(main1024Pos.y, main1024Pos.x);
  });
  const layer = L.polyline(latlngs, {...ROUTE_STYLE}).addTo(map.value);
  layer.on('pm:edit', handleMapPointChange);

  const mergedRoute = {
    name: mergedName,
    tags: cloneData(firstRoute.tags || []),
    enable_monster_loot_split: !!firstRoute.enable_monster_loot_split,
    map_match_method: firstRoute.map_match_method || '',
    layer,
    positions,
    info,
  };

  clearSelection();

  if (removeSources) {
    const sourceSet = new Set(sourceRoutes);
    const sourceIndexes = sourceRoutes
      .map((route) => polylines.value.indexOf(route))
      .filter((index) => index >= 0);
    const insertIndex = Math.min(...sourceIndexes);

    sourceRoutes.forEach((route) => map.value?.removeLayer(route.layer));
    const remainingRoutes = polylines.value.filter((route) => !sourceSet.has(route));
    remainingRoutes.splice(insertIndex, 0, mergedRoute);
    polylines.value = remainingRoutes;
    selectedPolylineIndex.value = insertIndex;
  } else {
    polylines.value.push(mergedRoute);
    selectedPolylineIndex.value = polylines.value.length - 1;
  }

  refreshRouteStyles();
  ensureHistoryRoute();
  snapshotPolyline();
  selectPolyline(selectedPolylineIndex.value);
  Message.success(`已创建“${mergedName}”，共 ${positions.length} 个点位`);
  return true;
}

/**
 * 按传送点把当前路线拆成多条。
 */
export function splitPolyline() {
  const positions = polylines.value[selectedPolylineIndex.value].positions;
  const result = [];

  let currentGroup = [];

  for (const position of positions) {
    if (position.type === 'teleport') {
      if (currentGroup.length > 0) {
        result.push(currentGroup);
        currentGroup = [];
      }
      currentGroup.push(position);
    } else {
      currentGroup.push(position);
    }
  }

  if (currentGroup.length > 0) {
    result.push(currentGroup);
  }

  polylines.value[0].positions = result[0];
  updateMapFromPolyLine(polylines.value[0]);
  selectPolyline(0);
  for (let i = 1; i < result.length; i++) {
    let pl = Object.assign({}, polylines.value[0], {positions: result[i]});
    delete pl.layer;
    pl = JSON.parse(JSON.stringify(pl));
    pl.name = pl.name + '_' + (i + 1);
    addSpliePolyline(pl);
    updateMapFromPolyLine(polylines.value[i]);
    selectPolyline(i);
  }
}

/**
 * 为拆分结果补一条带图层的路线。
 */
export function addSpliePolyline(importedData) {
  const layer = L.polyline(importedData.positions.map((pos) => {
    const main1024Pos = coordinateConverter.value.gameToMain1024(pos.x, pos.y);
    return L.latLng(main1024Pos.y, main1024Pos.x);
  }), {
    ...ROUTE_STYLE,
  }).addTo(map.value);
  layer.on('pm:edit', handleMapPointChange);
  importedData.layer = layer;
  polylines.value.push(importedData);
  selectedPolylineIndex.value = polylines.value.length - 1;
  refreshRouteStyles();
  snapshotPolyline();
}

/**
 * 从指定点位开始，把后续路径交给 BGI 运行。
 */
export function runFromPoint(rowIndex) {
  const polyline = polylines.value[selectedPolylineIndex.value];
  if (!polyline) return;
  const info = polyline.info || {};
  let data = {
    info: {
      name: polyline.name,
      type: info.type || 'collect',
      authors: info.authors || [],
      version: info.version || '1.0',
      description: info.description || '',
      map_name: currentMapName.value,
      bgi_version: import.meta.env.VITE_BGI_VERSION,
      tags: polyline.tags || [],
      last_modified_time: Date.now(),
      enable_monster_loot_split: !!polyline.enable_monster_loot_split,
      map_match_method: polyline.map_match_method || ''
    },
    positions: polyline.positions.slice(rowIndex).map((pos) => ({
      ...pos,
      x: Math.round(pos.x * 10000) / 10000,
      y: Math.round(pos.y * 10000) / 10000
    }))
  };
  if (polyline.oldFileData?.info?.bgi_version) {
    data.info.bgi_version = polyline.oldFileData.info.bgi_version;
  }
  data = deepMerge(polyline.oldFileData || {}, data);
  const fileAccessBridge = globalThis.chrome?.webview?.hostObjects?.mapEditorWebBridge;
  if (!fileAccessBridge?.RunPathing) {
    Message.info('“从此处运行”需要在 BetterGI 地图编辑器中使用');
    return;
  }
  try {
    fileAccessBridge.RunPathing(JSONStringifyOrdered(data, 2));
    Message.success(`已从第 ${rowIndex + 1} 个点位开始运行`);
  } catch (error) {
    console.error('运行路线失败:', error);
    Message.error('运行路线失败: ' + error.message);
  }
}

/**
 * 给宿主调用的添加点位入口。
 */
export function exposeAddNewPoint() {
  window.addNewPoint = (x, y) => {
    addNewPoint(x, y);
  };
}
