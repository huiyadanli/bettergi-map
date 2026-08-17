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
  newPointX,
  newPointY,
  newPointName,
  showAddPointModal,
  showEditPointModal,
  curUpdatePosition,
  curUpdatrowIndex,
} from '../stores/editor';
import {switchMap} from './useMap';
import {snapshotPolyline} from './useHistory';

/**
 * 移除当前选中点的高亮标记。
 */
export function removeHighlightMarker() {
  if (highlightMarker.value) {
    map.value.removeLayer(highlightMarker.value);
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
  polyline.positions.forEach((item, index) => item.id = index + 1);
  const latlngs = polyline.positions.map((pos) => {
    const main1024Pos = coordinateConverter.value.gameToMain1024(pos.x, pos.y);
    return L.latLng(main1024Pos.y, main1024Pos.x);
  });
  polyline.layer.setLatLngs(latlngs);
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

  selectedPointIndex.value = -1;
  if (highlightMarker.value) {
    map.value.removeLayer(highlightMarker.value);
    highlightMarker.value = null;
  }

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
    color: 'red',
    weight: 3,
    pane: 'routePane',
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
  }
}

/**
 * 选中一条路线并把地图中心移到该折线。
 */
export function selectPolyline(index) {
  snapshotPolyline();
  selectedPolylineIndex.value = index;
  const meta = currentMapConfig.value.meta;
  const maxZoom = meta ? meta.maxTileZoom : 5;
  const targetZoom = maxZoom + 1;
  map.value.setView(polylines.value[index].layer.getBounds().getCenter(), Math.max(map.value.getZoom(), targetZoom));
}

/**
 * 确认后删除一条路线（只删页面显示，不删本地文件）。
 */
export function deletePolyline(index) {
  Modal.confirm({
    title: '确认删除',
    content: '确定要删除该路线吗？此操作不可撤销。（仅删除当前页面显示，已存在的本地文件不会被删除）',
    okText: '删除',
    okButtonProps: {status: 'danger'},
    cancelText: '取消',
    onOk: () => {
      map.value.removeLayer(polylines.value[index].layer);
      polylines.value.splice(index, 1);
      if (selectedPolylineIndex.value >= polylines.value.length) {
        selectedPolylineIndex.value = Math.max(0, polylines.value.length - 1);
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

  polyline.positions = newData.map((item, index) => ({
    ...item,
    id: index + 1
  }));

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
  let classes = [];

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
  polyline.positions.splice(index, 1);

  if (selectedPointIndex.value === index) {
    selectedPointIndex.value = -1;
    if (highlightMarker.value) {
      map.value.removeLayer(highlightMarker.value);
      highlightMarker.value = null;
    }
  } else if (selectedPointIndex.value > index) {
    selectedPointIndex.value -= 1;
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
      if (polylines.value[selectedPolylineIndex.value]) {
        polylines.value[selectedPolylineIndex.value].positions = [];
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
      color: 'red',
      weight: 3,
      pane: 'routePane',
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
  if (highlightMarker.value) {
    map.value.removeLayer(highlightMarker.value);
    highlightMarker.value = null;
  }

  const polyline = polylines.value[selectedPolylineIndex.value];
  const actualIndex = polyline.positions.findIndex((pos) => pos === record);

  selectedPointIndex.value = actualIndex;

  const main1024Pos = coordinateConverter.value.gameToMain1024(record.x, record.y);

  highlightMarker.value = L.marker([main1024Pos.y, main1024Pos.x], {
    icon: L.divIcon({
      className: 'highlight-marker',
      html: '<div style="background-color: #ff3333; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
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
  if (highlightMarker.value) {
    map.value.removeLayer(highlightMarker.value);
    highlightMarker.value = null;
  }

  selectedPointIndex.value = -1;
}

/**
 * 把所有路线的点位合并到第一条。
 */
export function mergedPolyline() {
  const newPos = [];
  polylines.value.forEach((polyline) => {
    polyline.positions.forEach((p) => {
      newPos[newPos.length] = p;
    });
  });
  polylines.value[0].positions = newPos;
  for (let i = 1; i < polylines.value.length; i++) {
    map.value.removeLayer(polylines.value[i].layer);
  }
  polylines.value = [polylines.value[0]];
  updateMapFromPolyLine(polylines.value[0]);
  selectPolyline(0);
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
    color: 'red',
    weight: 3,
    pane: 'routePane',
  }).addTo(map.value);
  layer.on('pm:edit', handleMapPointChange);
  importedData.layer = layer;
  polylines.value.push(importedData);
  selectedPolylineIndex.value = polylines.value.length - 1;
  snapshotPolyline();
}

/**
 * 打开编辑点位坐标弹窗。
 */
export function editPointModal(record, rowIndex) {
  newPointX.value = record.x;
  newPointY.value = record.y;
  curUpdatePosition.value = record;
  curUpdatrowIndex.value = rowIndex;
  showEditPointModal.value = true;
  selectPoint(record);
}

/**
 * 把弹窗里的坐标写回点位并刷新地图。
 */
export function updatePointModal() {
  curUpdatePosition.value.x = newPointX.value;
  curUpdatePosition.value.y = newPointY.value;
  showEditPointModal.value = false;
  updateMapFromTable(selectedPolylineIndex.value, curUpdatrowIndex.value);
  selectPoint(curUpdatePosition.value);
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
  try {
    const fileAccessBridge = chrome.webview.hostObjects.mapEditorWebBridge;
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
