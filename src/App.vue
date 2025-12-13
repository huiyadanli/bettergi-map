<script setup>
import {onMounted, ref, computed} from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import {CoordinateConverter} from './utils/coordinateConverter';
import {Message, Modal} from '@arco-design/web-vue';
import {setPosition} from "leaflet/src/dom/DomUtil.js";

// 添加环境变量的引用
const mode = import.meta.env.VITE_MODE;
// 地图配置
const mapConfigs = {
  Teyvat: {
    gameMapRows: 13,
    gameMapCols: 22,
    gameMapUpRows: 5,
    gameMapLeftCols: 15,
    gameMapBlockWidth: 1024,
    mapImage: './1024_map.jpg',
    displayName: '提瓦特大陆',
  },
  TheChasm: {
    gameMapRows: 2,
    gameMapCols: 2,
    gameMapUpRows: 1,
    gameMapLeftCols: 1,
    gameMapBlockWidth: 1024,
    mapImage: './thechasm_1024_map.jpg',
    displayName: '层岩巨渊',
  },
  Enkanomiya: {
    gameMapRows: 3,
    gameMapCols: 3,
    gameMapUpRows: 1,
    gameMapLeftCols: 1,
    gameMapBlockWidth: 1024,
    mapImage: './enkanomiya_1024_map.jpg',
    displayName: '渊下宫',
  },
  SeaOfBygoneEras: {
    gameMapRows: 3,
    gameMapCols: 4,
    gameMapUpRows: 2,
    gameMapLeftCols: 5,
    gameMapBlockWidth: 1024,
    mapImage: './seaofbygoneeras_1024_map.jpg',
    displayName: '旧日之海',
  },
};

// 当前地图相关变量
const currentMapName = ref('Teyvat');
const currentMapConfig = computed(() => mapConfigs[currentMapName.value]);
const coordinateConverter = ref(new CoordinateConverter(currentMapConfig.value));
const mapImage = ref(currentMapConfig.value.mapImage);
const isMapLoaded = ref(false);


// 修改这一行
const imageWidth = ref(0);
const imageHeight = ref(0);
const map = ref(null);
const polylines = ref([]);
const selectedPolylineIndex = ref(0);

// 添加新的响应式变量
const newPointX = ref(0);
const newPointY = ref(0);
const showAddPointModal = ref(false);
const newPointName = ref('');
const selectedPointIndex = ref(-1);
const highlightMarker = ref(null);

// 文件访问相关变量
const currentPath = ref('');
const pathHistory = ref([]);
const availableFiles = ref([]);
const selectedFiles = ref([]);
const showFileSelectModal = ref(false);

// 导出
const exportAuthors = ref([{name: '', links: ''}]);
const exportVersion = ref('1.0');
const exportDescription = ref('');
const showExportModal = ref(false);

//本地存储
const saveLocal = (k, v) => {
  localStorage.setItem("bgiMap" + k, JSON.stringify(v));
}
const loadLocal = (k) => {
  const val = localStorage.getItem("bgiMap" + k);
  if (!val) return val;
  return JSON.parse(val);
}

onMounted(() => {
  const urlParams = new URLSearchParams(window.location.search);
  const mapParam = urlParams.get('map');

  if (mapParam && mapConfigs[mapParam]) {
    currentMapName.value = mapParam;
    currentMapConfig.value = mapConfigs[mapParam];
    coordinateConverter.value = new CoordinateConverter(currentMapConfig.value);
    mapImage.value = currentMapConfig.value.mapImage;
  }

  // Remove the map parameter from the URL
  urlParams.delete('map');
  let p = urlParams.toString();
  let newUrl = `${window.location.pathname}?${p}`;
  if (p.length === 0) {
    newUrl = `${window.location.pathname}`;
  }
  window.history.replaceState(null, '', newUrl);

  loadMapImageAndInit(mapImage.value);
});

function JSONStringifyOrdered(obj, space)
{
    const allKeys = new Set();
    JSON.stringify(obj, (key, value) => (allKeys.add(key), value));
    return JSON.stringify(obj, Array.from(allKeys).sort(), space);
}
 
function loadMapImageAndInit(mapImageSrc) {
  isMapLoaded.value = false; // 地图加载开始
  const img = new Image();
  img.onload = function () {
    imageWidth.value = this.width;
    imageHeight.value = this.height;
    initMap();
    isMapLoaded.value = true; // 地图加载完成
  };
  img.src = mapImageSrc;
}

function initMap() {
  // Check if the map instance already exists
  if (map.value) {
    map.value.remove(); // Destroy the existing map instance
    map.value = null;   // Reset the map reference
  }

  map.value = L.map('map', {
    attributionControl: false,
    crs: L.CRS.Simple,
    minZoom: -4,  // 允许缩小
    maxZoom: 5    // 允许放大
  });

  const bounds = [[0, 0], [imageHeight.value, imageWidth.value]];
  L.imageOverlay(mapImage.value, bounds).addTo(map.value);

  map.value.fitBounds(bounds);
  map.value.setZoom(0);

  // 初始化 Geoman 控件
  map.value.pm.addControls({
    position: 'topleft',
    drawMarker: false,
    drawCircleMarker: false,
    drawPolygon: false,
    drawRectangle: false,
    drawCircle: false,
    drawText: false,
    drawPolyline: true,
    editMode: true,
    dragMode: false,
    cutPolygon: false,
    removalMode: false,
    rotateMode: false,
  });

  map.value.pm.setLang("zh");

  // 设置绘制折线的颜色为红色
  map.value.pm.setGlobalOptions({
    pathOptions: {
      color: 'red',
      weight: 3
    }
  });

  map.value.on('pm:create', (e) => {
    if (e.layer instanceof L.Polyline) {
      addPolyline(e.layer);
      // 为新创建的折线添加事件监听
      e.layer.on("pm:edit", handleMapPointChange);
    }
  });
}

// 切换地图
function switchMap(mapName) {
  return new Promise((resolve) => {
    changeBgiMapSettingsName(mapName);

    currentMapName.value = mapName;
    currentMapConfig.value = mapConfigs[mapName];
    coordinateConverter.value = new CoordinateConverter(currentMapConfig.value);
    mapImage.value = currentMapConfig.value.mapImage;

    // 清空地图上的折线和点位
    polylines.value = [];
    if (map.value) {
      map.value.eachLayer((layer) => {
        if (layer instanceof L.Polyline || layer instanceof L.Marker) {
          map.value.removeLayer(layer);
        }
      });
    }

    // 重新加载地图
    loadMapImageAndInit(mapImage.value);

    // 使用轮询检查地图是否加载完成
    const checkMapLoaded = () => {
      if (isMapLoaded.value) {
        resolve();
      } else {
        requestAnimationFrame(checkMapLoaded); // 继续检查
      }
    };

    checkMapLoaded(); // 开始检查
  });
}

function changeBgiMapSettingsName(mapName) {
  if (mode !== 'single') {
    return;
  }
  try {
    const mapEditorWebBridge = chrome.webview.hostObjects.mapEditorWebBridge;
    const jsonString = mapEditorWebBridge.ChangeMapName(mapName);
    return JSON.parse(jsonString);
  } catch (e) {
    console.log("切换bgi地图配置失败，如果是在线版，请无视这个提示。");
  }
}

function removeHighlightMarker() {
  if (highlightMarker.value) {
    map.value.removeLayer(highlightMarker.value);
    highlightMarker.value = null;
  }
}

function handleMapPointChange(e) {
  removeHighlightMarker();
  updatePolyline(e.target);
}

// 添加点位，支持插入到锁定行位置
function addPolyline(layer, name = "未命名路径") {
  const newPositions = layer.getLatLngs().map((latlng, index) => {
    const gamePos = coordinateConverter.value.main1024ToGame(latlng.lng, latlng.lat);
    return {
      id: index + 1,
      action: "",
      move_mode: "walk",
      type: index === 0 ? "teleport" : "path",
      x: gamePos.x,
      y: gamePos.y,
      action_params: ""
    };
  });

  // 检查当前选中的路线是否有锁定行
  if (selectedPolylineIndex.value >= 0 && selectedPolylineIndex.value < polylines.value.length) {
    const currentPolyline = polylines.value[selectedPolylineIndex.value];
    const lockedIndex = currentPolyline.positions.findIndex(item => item.locked);
    
    if (lockedIndex > -1) {
      // 有锁定行，插入到锁定位置
      const insertPositions = newPositions.map((pos, index) => ({
        ...pos,
        id: lockedIndex + index + 1
      }));
      
      // 插入新点位到锁定位置
      currentPolyline.positions.splice(lockedIndex, 0, ...insertPositions);
      
      // 更新后续点位的ID
      currentPolyline.positions.forEach((pos, index) => {
        pos.id = index + 1;
      });
      
      // 更新地图上的折线
      updateMapFromPolyLine(currentPolyline);
      
      // 解锁所有行
      currentPolyline.positions.forEach(item => {
        item.locked = false;
      });
      
      map.value.removeLayer(layer);
      
      return; // 插入完成，不创建新路线
    }
  }

  // 没有锁定行或没有选中路线，创建新路线
  // 清空选中态和选中点
  selectedPointIndex.value = -1;
  if (highlightMarker.value) {
    map.value.removeLayer(highlightMarker.value);
    highlightMarker.value = null;
  }
  
  const newPolyline = {
    name: name,
    layer: layer,
    positions: newPositions,
    info: { // 初始化 info 属性
      name: name,
      authors: [], // 使用新的authors数组格式
      version: '1.0',
      description: ''
    }
  };
  polylines.value.push(newPolyline);
  selectedPolylineIndex.value = polylines.value.length - 1;
  selectPolyline(selectedPolylineIndex.value);
}

async function addImportedPolyline(importedData, filePath = null) {
  const mapName = importedData.info.map_name || 'Teyvat'; // 默认地图为 Teyvat
  if (mapName !== currentMapName.value && mapConfigs[mapName]) {
    // 显示切换地图提示，减少意外的卡顿
    const mapDisplayName = mapConfigs[mapName].displayName;
    const currentMapDisplayName = mapConfigs[currentMapName.value].displayName;
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
      
      await switchMap(mapName); // 用户确认后切换地图
    } catch (error) {
      console.log('用户取消导入:', error.message);
      return; // 用户取消，直接返回
    }
  }
  const positions = importedData.positions.map((pos) => {
    const main1024Pos = coordinateConverter.value.gameToMain1024(pos.x, pos.y);
    return L.latLng(main1024Pos.y, main1024Pos.x);
  });
  const layer = L.polyline(positions, {
    color: 'red',
    weight: 3,
  }).addTo(map.value);
  layer.on('pm:edit', handleMapPointChange);

  // 处理作者信息的兼容性
  let processedInfo = { ...importedData.info };
  
  // 如果有旧格式的author字段，转换为新格式的authors数组
  if (processedInfo.author && !processedInfo.authors) {
    processedInfo.authors = [{
      name: processedInfo.author,
      links: ''
    }];
    // 移除旧的author字段
   delete processedInfo.author;
   delete importedData?.info?.author;
  }
  
  // 确保authors字段存在且为数组
  if (!processedInfo.authors || !Array.isArray(processedInfo.authors)) {
    processedInfo.authors = [];
  }

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
    info: processedInfo, // 使用处理后的info
    savedPath: filePath // 记录原始文件路径
    ,oldFileData:importedData
  };
  polylines.value.push(newPolyline);
  selectedPolylineIndex.value = polylines.value.length - 1;
  selectPolyline(selectedPolylineIndex.value);
}

// 不切换地图的导入函数，用于批量导入
function addImportedPolylineWithoutMapSwitch(importedData, filePath = null) {
  const positions = importedData.positions.map((pos) => {
    const main1024Pos = coordinateConverter.value.gameToMain1024(pos.x, pos.y);
    return L.latLng(main1024Pos.y, main1024Pos.x);
  });
  const layer = L.polyline(positions, {
    color: 'red',
    weight: 3,
  }).addTo(map.value);
  layer.on('pm:edit', handleMapPointChange);

  // 处理作者信息的兼容性
  let processedInfo = { ...importedData.info };
  
  // 如果有旧格式的author字段，转换为新格式的authors数组
  if (processedInfo.author && !processedInfo.authors) {
    processedInfo.authors = [{
      name: processedInfo.author,
      links: ''
    }];
    // 移除旧的author字段
    delete processedInfo.author;
    delete importedData?.info?.author;
  }
  
  // 确保authors字段存在且为数组
  if (!processedInfo.authors || !Array.isArray(processedInfo.authors)) {
    processedInfo.authors = [];
  }

  const newPolyline = {
    name: importedData.info.name,
    tags: importedData.info.tags || [],
    enable_monster_loot_split: !!importedData.info.enable_monster_loot_split,
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
    info: processedInfo, // 使用处理后的info
    savedPath: filePath, // 记录原始文件路径
    oldFileData:importedData //原始文件数据，用于导出时合并
  };
  polylines.value.push(newPolyline);
  selectedPolylineIndex.value = polylines.value.length - 1;
  selectPolyline(selectedPolylineIndex.value);
}


// 通过 fileAccessBridge 导入路线
async function importFromFileAccessBridge() {
  try {
    const fileAccessBridge = chrome.webview.hostObjects.fileAccessBridge;

    // 获取当前路径下的所有项目（文件和目录）
    let itemsJson = await fileAccessBridge.ListItems(currentPath.value);
    const items = JSON.parse(itemsJson);

    if (items.length === 0) {
      Message.warning('当前目录为空');
      return;
    }

    // 显示文件选择对话框
    showFileSelectDialog(items);

  } catch (error) {
    console.error('导入路线失败:', error);
    Message.error('导入路线失败: ' + error.message);
  }
}

// 显示文件选择对话框
function showFileSelectDialog(items) {
  availableFiles.value = Array.isArray(items) ? items : [];
  selectedFiles.value = [];
  showFileSelectModal.value = true;
}

// 进入目录
async function enterDirectory(dirPath) {
  try {
    const fileAccessBridge = chrome.webview.hostObjects.fileAccessBridge;
    pathHistory.value.push(currentPath.value);
    currentPath.value = dirPath;

    const itemsJson = await fileAccessBridge.ListItems(currentPath.value);
    const items = JSON.parse(itemsJson);
    availableFiles.value = items;
    selectedFiles.value = [];

  } catch (error) {
    console.error('进入目录失败:', error);
    Message.error('进入目录失败: ' + error.message);
  }
}

// 返回上级目录
async function goBack() {
  if (pathHistory.value.length > 0) {
    currentPath.value = pathHistory.value.pop();
    try {
      const fileAccessBridge = chrome.webview.hostObjects.fileAccessBridge;
      const itemsJson = await fileAccessBridge.ListItems(currentPath.value);
      const items = JSON.parse(itemsJson);
      availableFiles.value = items;
      selectedFiles.value = [];
    } catch (error) {
      console.error('返回上级目录失败:', error);
      Message.error('返回上级目录失败: ' + error.message);
    }
  }
}

// 重置到根目录
function resetToRoot() {
  currentPath.value = '';
  pathHistory.value = [];
  importFromFileAccessBridge();
}

// 全选
async function selectAll() {
  console.log(availableFiles.value, selectedFiles.value)
  if (availableFiles.value.length === selectedFiles.value.length) {
    // 已经全选，取消
    console.log("取消全选")
    selectedFiles.value = [];
  } else {
    console.log("全选")
    selectedFiles.value = availableFiles.value.map(item => item.RelativePath);
  }
}

// 获取文件图标
function getFileIcon(item) {
  if (item.IsDirectory) {
    return '📁';
  } else if (item.Name.endsWith('.json')) {
    return '📄';
  } else {
    return '📋';
  }
}

// 检查是否为JSON文件
function isJsonFile(item) {
  return !item.IsDirectory && item.Name.endsWith('.json');
}

// 获取选中的JSON文件数量
const selectedJsonFileCount = computed(() => {
  return selectedFiles.value.filter(filePath => {
    const item = availableFiles.value.find(item => item.RelativePath === filePath);
    return item && isJsonFile(item);
  }).length;
});

// 判断是否全选状态
const isAllSelected = computed(() => {
  const jsonFiles = availableFiles.value.filter(item => isJsonFile(item));
  return jsonFiles.length > 0 && selectedJsonFileCount.value === jsonFiles.length;
});


// 确认导入选中的文件
async function confirmImportFiles() {
  try {
    const fileAccessBridge = chrome.webview.hostObjects.fileAccessBridge;

    // 只导入JSON文件
    const jsonFiles = selectedFiles.value.filter(filePath => {
      const item = availableFiles.value.find(item => item.RelativePath === filePath);
      return item && isJsonFile(item);
    });

    if (jsonFiles.length === 0) {
      Message.warning('请选择至少一个JSON文件');
      return;
    }

    // 预读取所有文件，检查是否需要切换地图
    const fileDataList = [];
    for (const filePath of jsonFiles) {
      try {
        const content = await fileAccessBridge.ReadFile(filePath);
        const data = JSON.parse(content);
        fileDataList.push({ filePath, data });
      } catch (error) {
        console.error(`读取文件 ${filePath} 失败:`, error);
      }
    }

    // 检查是否有不同地图的文件
    const mapNames = [...new Set(fileDataList.map(item => item.data.info.map_name || 'Teyvat'))];
    const needSwitchMap = mapNames.some(mapName => mapName !== currentMapName.value);

    if (needSwitchMap && mapNames.length > 1) {
      // 多个不同地图的文件
      Message.warning('选中的文件包含多个不同地图的脚本，请分批导入同一地图的脚本');
      return;
    } else if (needSwitchMap) {
      // 单个不同地图，提示用户
      const targetMapName = mapNames[0];
      const mapDisplayName = mapConfigs[targetMapName]?.displayName || targetMapName;
      const currentMapDisplayName = mapConfigs[currentMapName.value].displayName;
        try {
        await new Promise((resolve, reject) => {
          Modal.confirm({
            title: '需要切换地图',
            content: `选中的脚本属于 ${mapDisplayName}，当前地图为 ${currentMapDisplayName}，需要切换地图后批量导入。`,
            okText: '确认切换',
            cancelText: '取消导入',
            onOk: () => resolve(),
            onCancel: () => reject(new Error('用户取消导入'))
          });
        });
        
        await switchMap(targetMapName);
      } catch (error) {
        console.log('用户取消批量导入');
        return;
      }
    }

    let successCount = 0;
    let errorCount = 0;

    // 批量导入（此时地图已经统一）
    for (const { filePath, data } of fileDataList) {
      try {
        await addImportedPolylineWithoutMapSwitch(data, filePath); // 使用不切换地图的版本
        successCount++;
      } catch (error) {
        console.error(`导入文件 ${filePath} 失败:`, error);
        errorCount++;
      }
    }

    showFileSelectModal.value = false;

    if (successCount > 0) {
      Message.success(`成功导入 ${successCount} 个路线文件`);
    }
    if (errorCount > 0) {
      Message.error(`${errorCount} 个文件导入失败`);
    }

  } catch (error) {
    console.error('导入文件失败:', error);
    Message.error('导入文件失败: ' + error.message);
  }
}

// 关闭文件选择对话框时重置状态
function closeFileSelectModal() {
  showFileSelectModal.value = false;
  currentPath.value = '';
  pathHistory.value = [];
  selectedFiles.value = [];
}

// 通过 fileAccessBridge 保存路线
async function saveToFileAccessBridge(data, fileName) {
  try {
    const fileAccessBridge = chrome.webview.hostObjects.fileAccessBridge;
    const json = JSONStringifyOrdered(data, 2);
    const safeFileName = fileName.replace(/[<>:"/\\|?*]/g, '_') + '.json';

    // 首先检查是否存在原始存储路径
    const currentPolyline = polylines.value[selectedPolylineIndex.value];
    let savePath = '';

    // 如果路线有记录的存储路径，保留原路径的目录，但使用新的文件名
    if (currentPolyline.savedPath) {
      // 检测路径分隔符（Windows 使用 \，类 Unix 系统使用 /）
      const pathSeparator = currentPolyline.savedPath.includes('/') ? '/' : '\\';

      // 获取原路径的目录部分
      const lastSeparatorIndex = currentPolyline.savedPath.lastIndexOf(pathSeparator);
      const dirPath = lastSeparatorIndex !== -1 ?
          currentPolyline.savedPath.substring(0, lastSeparatorIndex + 1) :
          '';

      // 组合目录与新文件名
      savePath = dirPath + safeFileName;

      // 更新保存路径到路线对象中
      currentPolyline.savedPath = savePath;
    } else {
      // 没有记录的存储路径，使用当前路径和文件名
      // 假设 currentPath.value 中的路径分隔符是一致的
      const pathSeparator = currentPath.value.includes('/') ? '/' : '\\';

      savePath = currentPath.value ?
          `${currentPath.value}${pathSeparator}${safeFileName}` :
          safeFileName;

      // 保存路径到路线对象中，方便下次使用
      currentPolyline.savedPath = savePath;
    }

    await fileAccessBridge.WriteFile(savePath, json);
    Message.success(`路线已保存到: ${savePath}`);

  } catch (error) {
    console.error('保存路线失败:', error);
    Message.error('保存路线失败: ' + error.message);
  }
}

// 支持 fileAccessBridge
function importPositions() {
  if (mode === 'single') {
    // 使用 fileAccessBridge 导入
    importFromFileAccessBridge();
  } else {
    // 保持原有逻辑
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.multiple = true;
    input.onchange = (event) => {
      [...event.target.files].forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const data = JSON.parse(e.target.result);
          addImportedPolyline(data);
        };
        reader.readAsText(file);
      })
    };
    input.click();
  }
}

// 重命名函数
function renamePolyline(index, newName) {
  polylines.value[index].name = newName;
}

function updatePolyline(layer) {
  const index = polylines.value.findIndex(p => p.layer === layer);
  if (index !== -1) {
    const currentPositions = polylines.value[index].positions;
    const newLatLngs = layer.getLatLngs();

    if (currentPositions.length === newLatLngs.length) {
      // 如果长度没有变化，直接更新对应索引下的 x, y 数据
      currentPositions.forEach((pos, idx) => {
        const gamePos = coordinateConverter.value.main1024ToGame(newLatLngs[idx].lng, newLatLngs[idx].lat);
        pos.x = gamePos.x;
        pos.y = gamePos.y;
      });
    } else {
      // 如果长度发生变化，进行匹配更新
      const updatedPositions = newLatLngs.map((latlng, idx) => {
        const gamePos = coordinateConverter.value.main1024ToGame(latlng.lng, latlng.lat);
        const existingPosition = currentPositions.find(pos => pos.x === gamePos.x && pos.y === gamePos.y);
        
        // 如果找到匹配的原有点位，保留其所有属性
        if (existingPosition) {
          return {
            ...existingPosition, // 保留原有数据
            id: idx + 1,
            x: gamePos.x,
            y: gamePos.y
          };
        } else {
          // 新添加的点位，使用默认属性
          return {
            id: idx + 1,
            x: gamePos.x,
            y: gamePos.y,
            action: "",
            move_mode: "walk",
            type: idx === 0 ? "teleport" : "path",
            action_params: ""
          };
        }
      });
      polylines.value[index].positions = updatedPositions;
    }
  }
}

let preAuthors = (loadLocal("_preAuthors") || {}).preAuthors || [{name: '', links: ''}];

// 作者管理函数
function addAuthor() {
  exportAuthors.value.push({name: '', links: ''});
}

function removeAuthor(index) {
  if (exportAuthors.value.length > 1) {
    exportAuthors.value.splice(index, 1);
  }
}

function exportPositions(index) {
  const polyline = polylines.value[index];
  // 检查 polyline.info 是否存在
  const info = polyline.info || {};
  
  // 处理新旧格式兼容
  if (info.authors && Array.isArray(info.authors) && info.authors.length > 0) {
    // 使用新格式
    exportAuthors.value = [...info.authors];
  } else if (info.author && info.author.trim() !== '') {
    // 兼容旧格式，转换为新格式
    exportAuthors.value = [{name: info.author, links: ''}];
  } else {
    // 路线没有作者信息，使用空数组
    exportAuthors.value = [{name: '', links: ''}];
  }
  
  exportVersion.value = info.version || '';
  exportDescription.value = info.description || '';
  showExportModal.value = true;
  selectedPolylineIndex.value = index;
}
function deepMerge(target, source) {
  // 辅助函数：判断是否为纯对象（通过 {} 或 new Object 创建）
  const isPlainObject = (obj) => {
    return Object.prototype.toString.call(obj) === '[object Object]';
  };

  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      const sourceValue = source[key];
      const targetValue = target[key];

      // 情况1：source属性是数组 → 直接覆盖
      if (Array.isArray(sourceValue)) {
        target[key] = sourceValue.slice(); // 浅拷贝数组
      }
      // 情况2：source属性是纯对象 → 递归合并
      else if (isPlainObject(sourceValue)) {
        // 确保target对应属性也是纯对象，否则创建新对象
        if (!isPlainObject(targetValue)) {
          target[key] = {};
        }
        deepMerge(target[key], sourceValue);
      }
      // 情况3：基本类型或内置对象 → 直接覆盖
      else {
        target[key] = sourceValue;
      }
    }
  }
  return target;
}
function handleExport() {
  const polyline = polylines.value[selectedPolylineIndex.value];
  
  // 检查路线是否已有作者
  const info = polyline.info || {};
  const hasRouteAuthors = info.authors && Array.isArray(info.authors) && info.authors.length > 0 && info.authors.some(author => author.name.trim() !== '');
  
  // 如果路线没有作者信息，且当前输入框也为空，使用预设作者
  if (!hasRouteAuthors) {
    const inputHasAuthor = exportAuthors.value.some(author => author.name.trim() !== '');
    if (!inputHasAuthor) {
      // 从localStorage获取最新的预设作者
      const storedPreAuthors = (loadLocal("_preAuthors") || {}).preAuthors || [];
      if (storedPreAuthors.length > 0) {
        // 应用预设作者
        exportAuthors.value = storedPreAuthors.map(author => ({...author}));
        const authorsList = storedPreAuthors.map(author => author.name).join('、');
        Message.info(`当前作者信息为空，使用预设作者：${authorsList}`);
      }
    }
  }
  
  // 过滤掉空的作者信息
  const validAuthors = exportAuthors.value.filter(author => author.name.trim() !== '');
  
  // 保存当前填写的作者为预设
  if (validAuthors && validAuthors.length > 0) {
    const preAuthorsString = JSON.stringify(
        (preAuthors || []).map(a => ({
          name: a.name ? a.name.trim() : '',
          links: a.links ? a.links.trim() : ''
        })).sort((a, b) => a.name.localeCompare(b.name))
    );

    const validAuthorsString = JSON.stringify(
        validAuthors.map(a => ({
          name: a.name ? a.name.trim() : '',
          links: a.links ? a.links.trim() : ''
        })).sort((a, b) => a.name.localeCompare(b.name))
    );

    if (preAuthorsString !== validAuthorsString) {
      preAuthors = validAuthors;
      saveLocal("_preAuthors", { preAuthors });
    }
  }

  let data = {
    info: {
      name: polyline.name,
      type: "collect",
      authors: validAuthors, // 使用新格式
      version: exportVersion.value, // 使用用户输入的版本信息
      description: exportDescription.value, // 添加描述信息
      map_name: currentMapName.value, // 添加地图名字
      bgi_version: import.meta.env.VITE_BGI_VERSION // 添加BGI版本信息
      , tags: polyline.tags || []
      , last_modified_time: Date.now() //导出时间
      , enable_monster_loot_split: !!polyline.enable_monster_loot_split //区分怪物拾取
      , map_match_method: polyline.map_match_method || '' //地图匹配方法

    },
    positions: polyline.positions // 已经是游戏坐标，无需转换
  };
  //合并data 保留自定义属等，不能在编辑器中编辑的数据  oldFileData
  data=deepMerge(polyline.oldFileData || {},data);
  
  // 更新当前路径的info信息，保持数据同步
  if (!polyline.info) {
    polyline.info = {};
  }
  polyline.info.version = exportVersion.value;
  polyline.info.description = exportDescription.value;
  polyline.info.authors = validAuthors;
  
  if (mode === 'single') {
    // 使用 fileAccessBridge 保存
    saveToFileAccessBridge(data, polyline.name);
  } else {
    // 保持原有逻辑
    const json = JSONStringifyOrdered(data, 2);
    const blob = new Blob([json], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${polyline.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  showExportModal.value = false;
}

const selectedPolyline = computed(() => {
  const polyline = polylines.value[selectedPolylineIndex.value];
  return polyline ? {...polyline, positions: [...polyline.positions]} : {positions: []};
});

function selectPolyline(index) {
  selectedPolylineIndex.value = index;
  map.value.fitBounds(polylines.value[index].layer.getBounds());
  map.value.setZoom(2);
}

function deletePolyline(index) {
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

function updateMapFromTable(polylineIndex, positionIndex) {
  const polyline = polylines.value[polylineIndex];
  const position = polyline.positions[positionIndex];
  const main1024Pos = coordinateConverter.value.gameToMain1024(position.x, position.y);
  const latlngs = polyline.layer.getLatLngs();
  latlngs[positionIndex] = L.latLng(main1024Pos.y, main1024Pos.x);
  polyline.layer.setLatLngs(latlngs);
}

function updatePosition(polylineIndex, positionIndex, key, value) {
  const polyline = polylines.value[polylineIndex];
  polyline.positions[positionIndex][key] = value;
  updateMapFromTable(polylineIndex, positionIndex);
}

// 动作选项
const actionOptionsTree = [
  {label: '无', value: ''},
  {label: '战斗', value: 'fight'},
  {label: '简易策略脚本', value: 'combat_script'},
  {label: '纳西妲长E收集', value: 'nahida_collect'},
  {label: '下落攻击', value: 'stop_flying'},
  {label: '四叶印', value: 'up_down_grab_leaf'},
  {label: '挖矿', value: 'mining'},
  {label: '钓鱼', value: 'fishing'},
  {label: '聚集材料', value: 'pick_up_collect'},
  {label: '在附近拾取', value: 'pick_around'},
  {label: '使用小道具', value: 'use_gadget'},
  {
    label: '元素力采集',
    value: 'element',
    children: [
      {label: '水元素力采集', value: 'hydro_collect'},
      {label: '雷元素力采集', value: 'electro_collect'},
      {label: '风元素力采集', value: 'anemo_collect'},
      {label: '火元素力采集', value: 'pyro_collect'},
    ]
  },
  {
    label: '其他',
    value: 'system',
    children: [
      {label: '强制传送', value: 'force_tp'},
      {label: '输出日志', value: 'log_output'},
      {label: '退出重新登录', value: 'exit_and_relogin'},
      {label: '设置时间', value: 'set_time'},
    ]
  }
];

function handleChange(newData) {
  const polyline = polylines.value[selectedPolylineIndex.value];

  // 保存当前选中的点位坐标信息（如果有）
  let selectedPoint = null;
  if (selectedPointIndex.value >= 0 && selectedPointIndex.value < polyline.positions.length) {
    const oldRecord = polyline.positions[selectedPointIndex.value];
    selectedPoint = { x: oldRecord.x, y: oldRecord.y };
  }

  // 更新位置数据
  polyline.positions = newData.map((item, index) => ({
    ...item,
    id: index + 1
  }));

  // 更新地图上的折线
  const latlngs = newData.map(pos => {
    const main1024Pos = coordinateConverter.value.gameToMain1024(pos.x, pos.y);
    return L.latLng(main1024Pos.y, main1024Pos.x);
  });
  polyline.layer.setLatLngs(latlngs);

  // 如果之前有选中的点位，在新数据中通过坐标重新找到它并重新应用选中状态
  if (selectedPoint) {
    const newIndex = polyline.positions.findIndex(pos => pos.x === selectedPoint.x && pos.y === selectedPoint.y);
    if (newIndex !== -1) {
      selectedPointIndex.value = newIndex;
      const newRecord = polyline.positions[newIndex];
      // 重新应用选中效果（更新高亮标记）
      selectPoint(newRecord);
    } else {
      // 如果找不到对应的点位，清除选中状态
      selectedPointIndex.value = -1;
    }
  }
}

function moreSelect(v) {
  v.onclick.call(null, v.record, v.rowIndex);
}

function copyPosition(record, rowIndex) {
  const polyline = polylines.value[selectedPolylineIndex.value];
  polyline.positions.splice(rowIndex, 0, Object.assign({}, record, {locked: false}));
  // 更新选中点位索引，因为插入了新点位，原来的索引需要+1
  if (selectedPointIndex.value >= rowIndex) {
    selectedPointIndex.value += 1;
  }
  updateMapFromPolyLine(polyline);
}

function lockRowIndex(record, rowIndex) {
  polylines.value[selectedPolylineIndex.value].positions.forEach((item, index) => {
    item.locked = false;
  });
  record.locked = true;
}

function unlockRowIndex(record, rowIndex) {
  record.locked = false;
}

const setPositionRowClass = (record, rowIndex) => {
  let classes = [];
  
  // 如果是锁定的行，添加锁定样式
  if (record.locked) {
    classes.push("locked");
  }
  
  // 如果是选中的行，添加选中样式
  if (rowIndex === selectedPointIndex.value) {
    classes.push("selected-row");
  }
  
  return classes.join(" ");
}

// 删除点位
function deletePosition(index) {
  const polyline = polylines.value[selectedPolylineIndex.value];
  polyline.positions.splice(index, 1);
  
  // 更新选中点位索引
  if (selectedPointIndex.value === index) {
    // 如果删除的是当前选中的点位，清除选中状态
    selectedPointIndex.value = -1;
    // 清除高亮标记
    if (highlightMarker.value) {
      map.value.removeLayer(highlightMarker.value);
      highlightMarker.value = null;
    }
  } else if (selectedPointIndex.value > index) {
    // 如果删除的点位在当前选中点位之前，索引需要-1
    selectedPointIndex.value -= 1;
  }
  
  updateMapFromPolyLine(polyline);
}

// 更新地图上的折线
const updateMapFromPolyLine = (polyline) => {
  //更新序号
  polyline.positions.forEach((item, index) => item.id = index + 1);
  //更新折线图
  const latlngs = polyline.positions.map(pos => {
    const main1024Pos = coordinateConverter.value.gameToMain1024(pos.x, pos.y);
    return L.latLng(main1024Pos.y, main1024Pos.x);
  });
  polyline.layer.setLatLngs(latlngs);
}

function openAddPointModal() {
  showAddPointModal.value = true;
  newPointX.value = 0;
  newPointY.value = 0;
  newPointName.value = '';
}

function clearPoints() {
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

function addNewPoint(x, y) {
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
    // 如果没有选中的路径或没有路径，创建新路径
    const layer = L.polyline([L.latLng(main1024Pos.y, main1024Pos.x)], {
      color: 'red',
      weight: 3
    }).addTo(map.value);
    map.value.setZoom(2);
    layer.on("pm:edit", handleMapPointChange);
    addPolyline(layer, "未命名路径");  // 使用默认名称 "未命名路径"
  } else {
    // 添加新点位到现有路径
    const polyline = polylines.value[selectedPolylineIndex.value];
    newPoint.id = polyline.positions.length + 1;
    if (polyline.positions.length === 0) {
      newPoint.type = "teleport";
    }
    let lockedIndex = polyline.positions.findIndex(item => item.locked);
    if (lockedIndex > -1) {
      polyline.positions.splice(lockedIndex, 0, newPoint);
      // 更新选中点位索引，因为插入了新点位，原来的索引需要+1
      if (selectedPointIndex.value >= lockedIndex) {
        selectedPointIndex.value += 1;
      }
    } else {
      polyline.positions.push(newPoint);
    }


    // 更新地图上的折线
    updateMapFromPolyLine(polyline)
    /*    const latlngs = polyline.layer.getLatLngs();
        latlngs.push(L.latLng(main1024Pos.y, main1024Pos.x));
        polyline.layer.setLatLngs(latlngs);*/
  }
}

window.addNewPoint = (x, y) => {
  addNewPoint(x, y);
};


function handleAddPointFromModal() {
  addNewPoint(newPointX.value, newPointY.value);
  showAddPointModal.value = false;
}

function selectPoint(record) {
  // 清除之前的高亮标记
  if (highlightMarker.value) {
    map.value.removeLayer(highlightMarker.value);
    highlightMarker.value = null;
  }

  // 更新 selectedPointIndex - 从 positions 数组中找到对应的索引
  const polyline = polylines.value[selectedPolylineIndex.value];
  const actualIndex = polyline.positions.findIndex(pos => pos === record);
  
  selectedPointIndex.value = actualIndex;

  // 高亮选中的点
  const main1024Pos = coordinateConverter.value.gameToMain1024(record.x, record.y);

  // 创建新的高亮标记
  highlightMarker.value = L.marker([main1024Pos.y, main1024Pos.x], {
    icon: L.divIcon({
      className: 'highlight-marker',
      html: '<div style="background-color: #ff3333; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    })
  }).addTo(map.value);

  // 将地图视图居中到选中的点
  map.value.setView([main1024Pos.y, main1024Pos.x], map.value.getZoom());
}

function clearSelection() {
  // 清除高亮标记
  if (highlightMarker.value) {
    map.value.removeLayer(highlightMarker.value);
    highlightMarker.value = null;
  }
  
  // 清除选中状态
  selectedPointIndex.value = -1;
}


//战斗策略管理
console.log('vue')
const combatScriptKey = "_combatScriptData";
const getCombatScriptByLocal = () => {
  return (loadLocal(combatScriptKey) || []);
}
const showAddCombatScript = ref(false);
const combatScriptData = ref(getCombatScriptByLocal());
const showCombatScriptManagerModal = ref(false);
const combatScriptManagerModal = () => {
  showCombatScriptManagerModal.value = true;
}

const saveCombatScript = () => {
  //const val=[{value:"钟离 e(hold);坎蒂丝 e(hold);雷泽 e(hold);卡齐娜 e;凝光 attack(0.2),attack(0.2),attack(0.2),attack(0.2),attack(0.2)",def:true}];
  // saveLocal(combatScriptKey,val);
  //combatScriptData.value=getCombatScriptByLocal();

}
//默认战斗策略赋值
const actionChange = (record) => {
  // 确保 action 字段值是最终叶子节点的值
  if (Array.isArray(record.action)) {
    record.action = record.action[record.action.length - 1];
  }
  if (record.action === "combat_script") {
    record.action_params = (combatScriptData.value.find(item => item.def) || {}).value;
  } else {
    record.action_params = "";
  }
}
const newActionParams = ref({value: "", def: false});
const addCombatScript = () => {
  const newActionParamsTemp = Object.assign({}, newActionParams.value);
  if (combatScriptData.value.find(item => item.value === newActionParamsTemp.value)) {
    alert("不要重复添加！");
  } else {
    const temp = combatScriptData.value;
    //只能一个默认
    if (newActionParamsTemp.def) {
      temp.forEach((item, index) => {
        item.def = false;
      })
    }
    newActionParams.value = {value: "", def: false};
    combatScriptData.value = [...temp, newActionParamsTemp];
    saveLocal(combatScriptKey, combatScriptData.value);

  }

}
const deleteCombatScriptPosition = index => {
  combatScriptData.value.splice(index, 1);
  saveLocal(combatScriptKey, combatScriptData.value);
}
const changeCombatScriptDef = (rowindex) => {
  if (combatScriptData.value[rowindex].def) {
    combatScriptData.value.forEach((item, index) => {
      if (index !== rowindex) {
        item.def = false;
      }
    })
  }
  saveLocal(combatScriptKey, combatScriptData.value);
}
const combatScriptColumns = [
  {
    title: '策略参数',
    dataIndex: 'value',
  },
  {
    title: '是否默认',
    dataIndex: 'def',
    slotName: 'def'
  },
  {
    title: '操作',
    dataIndex: 'operations',
    slotName: 'operations'
  }]

//点位扩展参数 
//monster_tag  normal,elite,legendary
//未识别，路径过远，所有
//unrecognized,pathTooFar,all
//取上一个识别到的点位置，大地图识别，特定时间到达
//previousDetectedPoint,mapRecognition,scheduledArrival
const defaultPointExtParams = {
  misidentification: {
    type: ["unrecognized"],
    handling_mode: "previousDetectedPoint",
    arrival_time: 0
  }, description: "", monster_tag: ""
};

const pointExtParams = ref(Object.assign({}, defaultPointExtParams));
const showPointExtConfig = ref(false);
let curPointRecord;
const editPointExtParams = (record, rowIndex) => {
  pointExtParams.value = record.point_ext_params || Object.assign({}, JSON.parse(JSON.stringify(defaultPointExtParams)));
  showPointExtConfig.value = true;
  curPointRecord = record;
}
const savePointExtParams = () => {
  if (curPointRecord) {
    curPointRecord.point_ext_params = JSON.parse(JSON.stringify(pointExtParams.value));
  }

}
const deletePointExtParams = (record, rowIndex) => {
  delete record.point_ext_params;
}


//标签管理
const commonTagKey = "_commonTag";
//const commonTag = ref([]);
const otherConfig = ref({
  commonTag: []
  , enableMonsterLootSplit: false
  , mapMatchMethod: ''
})
const showCommonTagManager = ref(false);
const polylineTagsSelectIndex = ref(-1);
const commonTagManagerModal = (index) => {
  otherConfig.value.commonTag = polylines.value[index].tags || [];
  otherConfig.value.enableMonsterLootSplit = !!polylines.value[index].enable_monster_loot_split;
  otherConfig.value.mapMatchMethod = polylines.value[index].map_match_method || '';
  polylineTagsSelectIndex.value = index;
  showCommonTagManager.value = true;
}
const saveCommonTagManagerModal = () => {
  polylines.value[polylineTagsSelectIndex.value].tags = otherConfig.value.commonTag;
  polylines.value[polylineTagsSelectIndex.value].enable_monster_loot_split = otherConfig.value.enableMonsterLootSplit;
  polylines.value[polylineTagsSelectIndex.value].map_match_method = otherConfig.value.mapMatchMethod;
}
const commonTagChange = () => {
  let tags = otherConfig.value.commonTag;
  const newTags = [];
  for (let i = 0; i < tags.length; i++) {
    let tag = tags[i];
    tag = tag.replaceAll("，", ",");
    tag.split(",").filter(t => t).forEach(t => newTags[newTags.length] = t);
  }
  otherConfig.value.commonTag = newTags;
}

//合并
const mergedPolyline = () => {

  const newPos = [];
  polylines.value.forEach(polyline => {
    polyline.positions.forEach(p => {
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
//拆分
const splitPolyline = () => {

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
    pl.name = pl.name + "_" + (i + 1);
    addSpliePolyline(pl);
    updateMapFromPolyLine(polylines.value[i]);
    selectPolyline(i);
  }

}

function addSpliePolyline(importedData) {
  const layer = L.polyline(importedData.positions.map((pos) => {
    const main1024Pos = coordinateConverter.value.gameToMain1024(pos.x, pos.y);
    return L.latLng(main1024Pos.y, main1024Pos.x);
  }), {
    color: 'red',
    weight: 3,
  }).addTo(map.value);
  layer.on('pm:edit', handleMapPointChange);
  importedData.layer = layer;
  polylines.value.push(importedData);
}

const showEditPointModal = ref(false);
const curUpdatePosition = ref({});
const curUpdatrowIndex = ref({});

const editPointModal = (record, rowIndex) => {
  newPointX.value = record.x;
  newPointY.value = record.y;
  curUpdatePosition.value = record;
  curUpdatrowIndex.value = rowIndex;
  showEditPointModal.value = true;
  selectPoint(record);
};
const updatePointModal = () => {
  curUpdatePosition.value.x = newPointX.value;
  curUpdatePosition.value.y = newPointY.value;
  showEditPointModal.value = false;
  updateMapFromTable(selectedPolylineIndex.value, curUpdatrowIndex.value);
  selectPoint(curUpdatePosition.value);
};

function formatNumber(num) {
  // 保留两位小数，但去掉多余的 0
  let str = num.toFixed(2);
  if (str.endsWith('.00')) {
    return str.slice(0, -3);
  } else if (str.endsWith('0')) {
    return str.slice(0, -1);
  } else {
    return str;
  }
}
</script>

<template>
  <a-layout class="layout">
    <a-layout-sider width="45%" :resize-directions="['right']">
      <div id="map"></div>
    </a-layout-sider>
    <a-layout-content>
      <a-space direction="vertical" size="large" fill>
        <a-card title="路径列表" style="max-height: 400px;overflow-y: auto">
          <template #extra>
            <a-space>
              <!-- 地图选择框 -->
              <a-select v-model="currentMapName" @change="switchMap" style="width: 160px; margin-right: 10px">
                <a-option v-for="(config, name) in mapConfigs" :key="name" :value="name">
                  {{ config.displayName }}
                </a-option>
              </a-select>
              <a-button @click="importPositions" type="primary" size="small">导入路径</a-button>
            </a-space>
          </template>
          <a-list :data="polylines" :bordered="false">
            <template #item="{ item, index }">
              <a-list-item>
                <a-space>
                  <a-input
                      v-model="item.name"
                      @change="(value) => renamePolyline(index, value)"
                      style="width: 300px;"
                  />
                  <a-button @click="selectPolyline(index)" type="primary" size="small">选择</a-button>
                  <a-button @click="commonTagManagerModal(index)" type="secondary" size="small">其他设置</a-button>
                  <a-button @click="deletePolyline(index)" status="danger" size="small">删除</a-button>
                  <a-button @click="exportPositions(index)" type="secondary" size="small">导出</a-button>
                </a-space>
              </a-list-item>
            </template>
          </a-list>
        </a-card>
        <a-card :title="`点位信息 - ${selectedPolyline.name || '未选择路径'}`">
          <a-table
              :columns="columns"
              :data="selectedPolyline.positions"
              :pagination="false"
              :draggable="{ type: 'handle', width: 40 }"
              @change="handleChange"
              @row-click="selectPoint"
              :row-class="setPositionRowClass"
          >
            <template #drag-handle-icon>
              <icon-drag-dot-vertical/>
            </template>
            <template #id="{ record, rowIndex }">
              <span :style="{color:(record.point_ext_params?'blue':'')}">{{ record.id }}</span>
            </template>
            <template #xy="{ record, rowIndex }">
              <a-button type="text" @click="editPointModal(record,rowIndex)">{{ formatNumber(record.x) }},
                {{ formatNumber(record.y) }}
              </a-button>
            </template>
            <template #x="{ record, rowIndex }">
              <a-input-number
                  v-model="record.x"
                  @change="(value) => updatePosition(selectedPolylineIndex, rowIndex, 'x', value)"
              />
            </template>
            <template #y="{ record, rowIndex }">
              <a-input-number
                  v-model="record.y"
                  @change="(value) => updatePosition(selectedPolylineIndex, rowIndex, 'y', value)"
              />
            </template>
            <template #move_mode="{ record }">
              <a-select v-model="record.move_mode">
                <a-option value="walk">行走</a-option>
                <a-option value="dash">间歇冲刺</a-option>
                <a-option value="run">持续奔跑</a-option>
                <a-option value="fly">飞行</a-option>
                <a-option value="swim">游泳</a-option>
                <a-option value="climb">攀爬</a-option>
                <a-option value="jump">跳跃</a-option>
              </a-select>
            </template>
            <template #action="{ record }">
              <!--              <a-select v-model="record.action" @change="actionChange(record)" style="min-width: 120px">
                              <a-option v-for="option in actionOptions" :key="option.value" :value="option.value" >
                                {{ option.label }}
                              </a-option>
                            </a-select>-->
              <a-cascader
                  v-model="record.action"
                  :options="actionOptionsTree"
                  placeholder="请选择动作"
                  @change="actionChange(record)"
                  style="min-width: 120px"
                  :field-names="{ label: 'label', value: 'value', children: 'children' }"
              />
              <a-input allow-clear v-if="record.action==='log_output'" v-model="record.action_params"
                       :disabled="record.type === 'teleport'" placeholder="录入需要输出的日志" strict/>
              <a-input allow-clear v-if="record.action==='stop_flying'" v-model="record.action_params"
                       placeholder="录入下落攻击等待时间(毫秒)" strict/>
              <a-input allow-clear v-if="record.action==='set_time'" v-model="record.action_params"
                       placeholder="录入需要设置的时间 HH:MM" strict/>
              <a-auto-complete allow-clear :data="combatScriptData" v-if="record.action==='combat_script'"
                               v-model="record.action_params" placeholder="录入或清空后选择策略" strict/>

            </template>
            <template #type="{ record }">
              <a-select v-model="record.type">
                <a-option value="teleport">传送</a-option>
                <a-option value="path">途经</a-option>
                <a-option value="target">目标</a-option>
                <a-option value="orientation">朝向</a-option>
              </a-select>
            </template>
            <template #operations="{ record, rowIndex }">
              <a-button
                  @click="deletePosition(rowIndex)"
                  status="danger"
                  size="small"
              >
                删除
              </a-button>


              <a-dropdown @select="moreSelect">
                <a-button style="margin-left: 10px" status="success">更多</a-button>
                <template #content>
                  <a-doption :value="{ onclick: copyPosition,record,rowIndex}">复制</a-doption>
                  <a-doption :value="{ onclick: editPointExtParams,record,rowIndex}">
                    {{ (record.point_ext_params ? "修改" : "新增") + "扩展参数" }}
                  </a-doption>
                  <a-doption :value="{ onclick: deletePointExtParams,record,rowIndex}" v-if="record.point_ext_params">
                    清除扩展参数
                  </a-doption>
                  <a-doption :value="{ onclick: lockRowIndex,record,rowIndex}" v-if="!record.locked">锁定行</a-doption>
                  <a-doption :value="{ onclick: unlockRowIndex,record,rowIndex}" v-if="record.locked">解锁行</a-doption>
                </template>
              </a-dropdown>
              <sapn style="color:red" v-if="record.locked">↑↑↑</sapn>
            </template>
          </a-table>

          <template #extra>
            <a-button @click="clearSelection" :disabled="selectedPointIndex === -1" type="primary" size="small">取消选中</a-button>
            <a-button @click="clearPoints" type="primary" style="margin-left: 20px;" size="small">清空</a-button>
            <a-popconfirm content="是否确认合并！" @ok="mergedPolyline" okText="确认" cancelText="关闭">
              <a-button type="primary" style="margin-left: 20px;" size="small" v-if="polylines.length > 1">合并
              </a-button>
            </a-popconfirm>
            <a-popconfirm content="是否确认按传送点进行拆分！" @ok="splitPolyline" okText="确认" cancelText="关闭">
              <a-button type="primary" style="margin-left: 20px;" size="small"
                        v-if="polylines.length == 1  && polylines[selectedPolylineIndex].positions.filter(item=>item.type=='teleport').length>1">
                拆分
              </a-button>
            </a-popconfirm>

            <a-button @click="combatScriptManagerModal" type="primary" style="margin-left: 20px;" size="small">
              战斗策略管理
            </a-button>
            <a-button @click="openAddPointModal" type="primary" size="small" style="margin-left: 20px;">添加点位
            </a-button>
          </template>
        </a-card>
      </a-space>
    </a-layout-content>
  </a-layout>
  <!-- 战斗策略管理 -->
  <!-- 添加战斗策略 -->
  <a-modal
      v-model:visible="showPointExtConfig"
      title="扩展参数"
      @ok="savePointExtParams"
      @cancel="showPointExtConfig = false"
      :width="800"
  >
    <a-form size="mini">
      <a-row :gutter="24">
        <a-col :span="24">
          <a-form-item label="怪物标签：" size="mini"
                       tooltip="为此点位打上标签，后续可能根据怪物种类决定是否拾取设置等逻辑。">
            <a-select v-model="pointExtParams.monster_tag" allow-clear>
              <a-option value="normal">小怪</a-option>
              <a-option value="elite">精英</a-option>
              <a-option value="legendary">传奇</a-option>
            </a-select>
          </a-form-item>
        </a-col>

      </a-row>
      <a-row :gutter="24">
        <a-col :span="24">
          <a-form-item label="异常识别：" size="mini" :content-flex="false" :merge-props="false" allow-clear
                       tooltip="当遇到点位无法识别时，用其他方式来解决无法识别的情况，编辑器如果无法识别点位，可以用编辑线的方式加点位。">

            <a-space direction="vertical" fill>
              <a-form-item field="misidentification.type" label="类型" tooltip="当小地图特征点比较少时，会出现点位无法识别或识别到其他位置的问题，
              此选项决定在什么情况下处理。
              未识别：算出坐标为0，即明面意思。
              路径过远：识别到其他的坐标，从而算出路径过远。">
                <a-select v-model="pointExtParams.misidentification.type" allow-clear multiple>
                  <a-option value="unrecognized">未识别</a-option>
                  <a-option value="pathTooFar">路径过远</a-option>
                </a-select>
              </a-form-item>
              <a-row :gutter="8">
                <a-col :span="12">
                  <a-form-item field="misidentification.handling_mode" label="处理方式" label-col-flex="100px" tooltip="
取上一个识别到的点位置:即当未识别时，拿上一次能正确识别的点。
大地图识别：即当未识别时，打开大地图，取中心点坐标，当中心点也识别不到时，取上一个识别到的点位。
特定时间到达：自行估算到达时间，不会尝试获取从小地图获取坐标，适用于纯平地，最好时最后一个点位。
">
                    <a-select v-model="pointExtParams.misidentification.handling_mode" allow-clear>
                      <a-option value="previousDetectedPoint">取上一个识别到的点位置</a-option>
                      <a-option value="mapRecognition">大地图识别</a-option>
                      <!--                      <a-option value="scheduledArrival">特定时间到达</a-option>-->
                    </a-select>
                  </a-form-item>
                </a-col>
                <a-col :span="12">
                  <a-form-item field="misidentification.arrival_time">
                    <a-input-number v-model="pointExtParams.misidentification.arrival_time"
                                    v-if="pointExtParams.misidentification.handling_mode === 'scheduledArrival'"
                                    placeholder="毫秒" class="input-demo" :min="0" allow-clear/>
                  </a-form-item>
                </a-col>
              </a-row>
            </a-space>
          </a-form-item>
        </a-col>
      </a-row>
      <a-row :gutter="24">
        <a-col :span="24">
          <a-form-item field="description" label="描述：">
            <a-textarea v-model="pointExtParams.description" placeholder="请输入描述"
                        :auto-size="{ minRows: 3, maxRows: 5 }"/>
          </a-form-item>
        </a-col>
      </a-row>


      <!--      <a-form-item label="策略参数">
              <a-input v-model="pointExtParams.enable"  allow-clear />
            </a-form-item>
            <a-form-item   label="是否默认">
              <a-checkbox :value="true" v-model="pointExtParams.def"></a-checkbox>
            </a-form-item>-->
    </a-form>
  </a-modal>
  <a-modal
      v-model:visible="showCombatScriptManagerModal"
      title="战斗策略管理"
      @ok="saveCombatScript"
      @cancel="showCombatScriptManagerModal = false"
      width="50%" height="50%"
      hideCancel
      okText="关闭"
  >

    <a-space direction="vertical" size="large" fill>
      <a-card>

        <a-table :columns="combatScriptColumns" :data="combatScriptData" :pagination="false">
          <template #def="{ record, rowIndex }">
            <a-checkbox :value="true" v-model="record.def" @change="changeCombatScriptDef(rowIndex)"></a-checkbox>
          </template>
          <template #operations="{ record, rowIndex }">
            <a-button
                @click="deleteCombatScriptPosition(rowIndex)"
                status="danger"
                size="small"
            >
              删除
            </a-button>
          </template>

        </a-table>
        <template #extra>
          <a-button @click="showAddCombatScript = true" type="primary" size="small" style="margin-left: 20px;">添加
          </a-button>
        </template>
      </a-card>
    </a-space>

  </a-modal>
  <!-- 添加战斗策略 -->
  <a-modal
      v-model:visible="showAddCombatScript"
      title="添加战斗策略"
      @ok="addCombatScript"
      @cancel="showAddCombatScript = false"
  >
    <a-form>
      <a-form-item label="策略参数">
        <a-input v-model="newActionParams.value" allow-clear/>
      </a-form-item>
      <a-form-item label="是否默认">
        <a-checkbox :value="true" v-model="newActionParams.def"></a-checkbox>
      </a-form-item>
    </a-form>
  </a-modal>
  <!-- 标签管理 -->
  <a-modal
      v-model:visible="showCommonTagManager"
      title="其他设置"
      @ok="saveCommonTagManagerModal"
      @cancel="showCommonTagManager = false"
      width="600" height="50%"
      okText="保存"
      cancelText="关闭"
  >
    <a-form size="mini">
      <a-row :gutter="24">
        <a-col :span="24">
          <a-form-item label="标签" size="mini" tooltip="为此点位打上标签，可供js等筛选。">
            <a-input-tag v-model="otherConfig.commonTag" @change="commonTagChange"
                         placeholder="输入文本后按Enter，如果录入内容带有逗号，则会拆分为多个标签" allow-clear/>
          </a-form-item>
        </a-col>

      </a-row>
      <a-row :gutter="24">
        <a-col :span="24">
          <a-form-item label="区分怪物拾取" size="mini"
                       tooltip="只有启用此配置，在调度中的只拾取精英配置才会生效，如果该脚本无精英怪，则无脑开启即可（和调度器配置同时开启后，没有标记精英的点位，将不再拾取）。">
            <a-checkbox :value="true" v-model="otherConfig.enableMonsterLootSplit"></a-checkbox>
          </a-form-item>
        </a-col>

      </a-row>
      <a-row :gutter="24">
        <a-col :span="24">
          <a-form-item label="地图匹配方法" size="mini"
                       tooltip="选择地图匹配的方法，SIFT特征匹配适用于一般情况，TemplateMatch模板匹配支持分层地图。">
            <a-select v-model="otherConfig.mapMatchMethod" placeholder="请选择地图匹配方法" allow-clear>
              <a-option value=""></a-option>
              <a-option value="SIFT">特征匹配</a-option>
              <a-option value="TemplateMatch">模板匹配(支持分层地图)</a-option>
            </a-select>
          </a-form-item>
        </a-col>

      </a-row>
    </a-form>

  </a-modal>


  <!-- 添加点位的模态框 -->
  <a-modal
      v-model:visible="showAddPointModal"
      title="添加新点位"
      @ok="handleAddPointFromModal"
      @cancel="showAddPointModal = false"
  >
    <a-form :model="{ x: newPointX, y: newPointY }">
      <a-form-item field="x" label="X坐标">
        <a-input-number v-model="newPointX" placeholder="请输入X坐标"/>
      </a-form-item>
      <a-form-item field="y" label="Y坐标">
        <a-input-number v-model="newPointY" placeholder="请输入Y坐标"/>
      </a-form-item>
    </a-form>
  </a-modal>
  <a-modal
      v-model:visible="showEditPointModal"
      title="修改点位坐标"
      @ok="updatePointModal"
      @cancel="showEditPointModal = false"
  >
    <a-form :model="{ x: newPointX, y: newPointY }">
      <a-form-item field="x" label="X坐标">
        <a-input-number v-model="newPointX" placeholder="请输入X坐标"/>
      </a-form-item>
      <a-form-item field="y" label="Y坐标">
        <a-input-number v-model="newPointY" placeholder="请输入Y坐标"/>
      </a-form-item>
    </a-form>
  </a-modal>  <!-- 导出模态框 -->
  <a-modal
      v-model:visible="showExportModal"
      title="导出路径"
      @ok="handleExport"
      @cancel="showExportModal = false"
      :width="600"
  >
    <a-form :model="{ authors: exportAuthors, version: exportVersion }">
      <!-- 作者信息区域 -->
      <a-form-item label="作者信息" style="width: 100%;">
        <div style="width: 100%;">
          <template v-for="(author, index) in exportAuthors" :key="index">
            <!-- 作者姓名行 -->
            <div style="margin-bottom: 4px; display: flex; width: 100%; gap: 8px;">
              <a-input
                  v-model="author.name"
                  :placeholder="`作者 ${index + 1} 姓名`"
                  size="small"
                  style="flex: 1;"
              />
              <a-button
                  @click="removeAuthor(index)"
                  size="small"
                  status="danger"
                  :disabled="exportAuthors.length === 1"
              >
                删除
              </a-button>
            </div>
            <!-- 作者链接行 -->
            <div style="margin-bottom: 12px; width: 100%;">
              <a-input
                  v-model="author.links"
                  :placeholder="`作者 ${index + 1} 链接（可选）`"
                  size="small"
                  style="width: 100%;"
              />
            </div>
          </template>
          <a-button @click="addAuthor" type="dashed" size="small" style="width: 100%;">
            + 添加作者
          </a-button>
        </div>
      </a-form-item>

      <a-form-item field="version" label="版本">
        <a-input v-model="exportVersion" placeholder="请输入版本号,从1.0开始"/>
      </a-form-item>
      <a-form-item field="description" label="描述">
        <a-textarea v-model="exportDescription" placeholder="请输入描述" :auto-size="{ minRows: 3, maxRows: 5 }"/>
      </a-form-item>
    </a-form>
  </a-modal>

  <!-- 新增：文件选择对话框 -->
  <a-modal
      v-model:visible="showFileSelectModal"
      title="选择要导入的路线文件"
      @ok="confirmImportFiles"
      @cancel="closeFileSelectModal"
      :width="800"
      :height="600"
  >
    <div style="height: 500px; display: flex; flex-direction: column;">
      <!-- 路径导航栏 -->
      <div style="margin-bottom: 16px; padding: 8px; background: #f5f5f5; border-radius: 4px;">
        <a-space>
          <a-button size="small" @click="resetToRoot" :disabled="!currentPath">
            <template #icon>🏠</template>
            根目录
          </a-button>
          <a-button size="small" @click="goBack" :disabled="pathHistory.length === 0">
            <template #icon>⬅️</template>
            返回
          </a-button>
          <span style="color: #666;">
            当前路径: {{ currentPath || '根目录' }}
          </span>
          <a-button 
            size="small" 
            @click="selectAll"
          >
            <template #icon>
              <span v-if="isAllSelected">☑️</span>
              <span v-else>☐</span>
            </template>
            {{ isAllSelected ? '取消全选' : '全选' }}
          </a-button>
        </a-space>
      </div>

      <!-- 文件列表 -->
      <div style="flex: 1; overflow-y: auto; border: 1px solid #e5e6e8; border-radius: 4px;">
        <a-list :data="availableFiles" :bordered="false">
          <template #item="{ item }">
            <a-list-item style="padding: 8px 16px;">
              <div style="display: flex; align-items: center; width: 100%;">
                <!-- 文件/目录图标和名称 -->
                <div style="flex: 1; display: flex; align-items: center;">
                  <span style="margin-right: 8px; font-size: 16px;">
                    {{ getFileIcon(item) }}
                  </span>

                  <!-- 如果是目录，显示为可点击的链接 -->
                  <a-button
                      v-if="item.IsDirectory"
                      type="text"
                      @click="enterDirectory(item.RelativePath)"
                      style="text-align: left; padding: 0;"
                  >
                    {{ item.Name }}
                  </a-button>

                  <!-- 如果是文件，显示为普通文本 -->
                  <span v-else>{{ item.Name }}</span>
                </div>

                <!-- 文件信息 -->
                <div style="color: #999; font-size: 12px; margin-right: 16px;">
                  {{ new Date(item.LastModified).toLocaleString() }}
                </div>

                <!-- 选择框（仅对JSON文件显示） -->
                <a-checkbox
                    v-if="isJsonFile(item)"
                    :model-value="selectedFiles.includes(item.RelativePath)"
                    @change="(checked) => {
                    if (checked) {
                      selectedFiles.push(item.RelativePath);
                    } else {
                      const index = selectedFiles.indexOf(item.RelativePath);
                      if (index > -1) {
                        selectedFiles.splice(index, 1);
                      }
                    }
                  }"
                />

                <!-- 非JSON文件的提示 -->
                <span v-else-if="!item.IsDirectory" style="color: #ccc; font-size: 12px;">
                  不可导入
                </span>
              </div>
            </a-list-item>
          </template>
        </a-list>
      </div>

      <!-- 选择状态显示 -->
      <div style="margin-top: 16px; padding: 8px; background: #f0f2f5; border-radius: 4px;">
        <a-space>
          <span>已选择 {{ selectedJsonFileCount }} 个JSON文件</span>
          <a-button
              v-if="selectedFiles.length > 0"
              size="small"
              @click="selectedFiles = []"
          >
            清空选择
          </a-button>
        </a-space>
      </div>
    </div>

    <template #footer>
      <a-space>
        <a-button @click="closeFileSelectModal">取消</a-button>
        <a-button
            type="primary"
            @click="confirmImportFiles"
            :disabled="selectedJsonFileCount === 0"
        >
          导入选中的文件 ({{ selectedJsonFileCount }})
        </a-button>
      </a-space>
    </template>
  </a-modal>
</template>

<script>
const columns = [
  {title: '#', dataIndex: 'id', slotName: 'id'},
  {title: '坐标', dataIndex: 'xy', slotName: 'xy'},
  /*  { title: 'X坐标', dataIndex: 'x', slotName: 'x' },
    { title: 'Y坐标', dataIndex: 'y', slotName: 'y' },*/
  {title: '类型', dataIndex: 'type', slotName: 'type'},
  {title: '移动方式', dataIndex: 'move_mode', slotName: 'move_mode'},
  {title: '动作', dataIndex: 'action', slotName: 'action'},
  {title: '操作', slotName: 'operations'},
];
</script>
<style scoped>
:deep(.arco-table-tr.locked td) {
  border-top: 2px red solid;
}

:deep(.arco-table-tr.selected-row td) {
  background-color: #e4edff;
}

:deep(.arco-table-hover:not(.arco-table-dragging) .arco-table-tr:not(.arco-table-tr-empty):not(.arco-table-tr-summary):hover .arco-table-td) {
  background-color: #e4edff !important;
}

:deep(.arco-table-tr) {
  cursor: pointer;
}

.layout {
  height: 100vh;
}

#map {
  height: 100%;
  width: 100%;
}

.arco-layout-sider {
  background: #fff;
}

.arco-layout-content {
  padding: 16px;
  background: #f0f2f5;
  overflow-y: auto;
}

.arco-table-tr-active {
  background-color: #e6f7ff;
}

.highlight-marker {
  z-index: 1000; /* 确保高亮标记显示在其他标记之上 */
}

.arco-table .arco-table-cell {
  padding: 8px 8px !important;
}
</style>
