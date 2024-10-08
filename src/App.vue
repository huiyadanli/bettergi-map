<script setup>
import { onMounted, ref, computed } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import { gameToMain1024, main1024ToGame } from './utils/coordinateConverter';
import { Modal } from '@arco-design/web-vue';

// 修改这一行
const mapImage = ref('./1024_map.jpg');
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

// 导出
const exportAuthor = ref('');
const exportVersion = ref('1.0');
const exportDescription = ref('');
const showExportModal = ref(false);

onMounted(() => {
  const img = new Image();
  img.onload = function() {
    imageWidth.value = this.width;
    imageHeight.value = this.height;
    initMap();
  }
  img.src = mapImage.value;
});

function initMap() {

  map.value = L.map('map', {
    attributionControl: false,
    crs: L.CRS.Simple,
    minZoom: -3,  // 允许缩小
    maxZoom: 2    // 允许放大
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

// 保持原有的 addPolyline 函数不变
function addPolyline(layer, name = "未命名路径") {
  const newPolyline = {
    name: name,
    layer: layer,
    positions: layer.getLatLngs().map((latlng, index) => {
      const gamePos = main1024ToGame(latlng.lng, latlng.lat);
      return {
        id: index + 1,
        action: "",
        move_mode: "walk",
        type: index === 0 ? "teleport" : "path",
        x: gamePos.x,
        y: gamePos.y
      };
    }),
    info: { // 初始化 info 属性
      name: name,
      author: '',
      version: '1.0',
      description: ''
    }
  };
  polylines.value.push(newPolyline);
  selectedPolylineIndex.value = polylines.value.length - 1;
  selectPolyline(selectedPolylineIndex.value);
}

// 新增一个函数来处理导入的数据
function addImportedPolyline(importedData) {
  const positions = importedData.positions.map(pos => {
    const main1024Pos = gameToMain1024(pos.x, pos.y);
    return L.latLng(main1024Pos.y, main1024Pos.x);
  });
  const layer = L.polyline(positions, {
    color: 'red',
    weight: 3
  }).addTo(map.value);
  layer.on("pm:edit", handleMapPointChange);

  const newPolyline = {
    name: importedData.info.name,
    layer: layer,
    positions: importedData.positions.map((pos, index) => ({
      id: index + 1,
      x: pos.x,
      y: pos.y,
      action: pos.action || "",
      move_mode: pos.move_mode || "walk",
      type: pos.type || "path"
    })),
    info: importedData.info // 保留导入时的信息
  };
  polylines.value.push(newPolyline);
  selectedPolylineIndex.value = polylines.value.length - 1;
  selectPolyline(selectedPolylineIndex.value);
}

// 修改 importPositions 函数
function importPositions() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (event) => {
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = JSON.parse(e.target.result);
      addImportedPolyline(data);
    };
    reader.readAsText(file);
  };
  input.click();
}

// 添加重命名函数
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
        const gamePos = main1024ToGame(newLatLngs[idx].lng, newLatLngs[idx].lat);
        pos.x = gamePos.x;
        pos.y = gamePos.y;
      });
    } else {
      // 如果长度发生变化，进行匹配更新
      const updatedPositions = newLatLngs.map((latlng, idx) => {
        const gamePos = main1024ToGame(latlng.lng, latlng.lat);
        const existingPosition = currentPositions.find(pos => pos.x === gamePos.x && pos.y === gamePos.y);
        return {
          ...existingPosition, // 保留原有数据
          id: idx + 1,
          x: gamePos.x,
          y: gamePos.y
        };
      });
      polylines.value[index].positions = updatedPositions;
    }
  }
}

function exportPositions(index) {
  const polyline = polylines.value[index];
  // 检查 polyline.info 是否存在
  const info = polyline.info || {};
  exportAuthor.value = info.author || ''; // 回填作者信息
  exportVersion.value = info.version || ''; // 回填版本信息
  showExportModal.value = true;
  selectedPolylineIndex.value = index;
}

function handleExport() {
  const polyline = polylines.value[selectedPolylineIndex.value];
  const data = {
    info: {
      name: polyline.name,
      type: "collect",
      author: exportAuthor.value, // 使用用户输入的作者信息
      version: exportVersion.value, // 使用用户输入的版本信息
      description: exportDescription.value, // 添加描述信息
      bgiVersion: import.meta.env.VITE_BGI_VERSION // 添加BGI版本信息
    },
    positions: polyline.positions // 已经是游戏坐标，无需转换
  };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${polyline.name}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showExportModal.value = false;
}

const selectedPolyline = computed(() => {
  const polyline = polylines.value[selectedPolylineIndex.value];
  return polyline ? { ...polyline, positions: [...polyline.positions] } : { positions: [] };
});

function selectPolyline(index) {
  selectedPolylineIndex.value = index;
  map.value.fitBounds(polylines.value[index].layer.getBounds());
}

function deletePolyline(index) {
  map.value.removeLayer(polylines.value[index].layer);
  polylines.value.splice(index, 1);
  if (selectedPolylineIndex.value >= polylines.value.length) {
    selectedPolylineIndex.value = Math.max(0, polylines.value.length - 1);
  }
}

function updateMapFromTable(polylineIndex, positionIndex) {
  const polyline = polylines.value[polylineIndex];
  const position = polyline.positions[positionIndex];
  const main1024Pos = gameToMain1024(position.x, position.y);
  const latlngs = polyline.layer.getLatLngs();
  latlngs[positionIndex] = L.latLng(main1024Pos.y, main1024Pos.x);
  polyline.layer.setLatLngs(latlngs);
}

function updatePosition(polylineIndex, positionIndex, key, value) {
  const polyline = polylines.value[polylineIndex];
  polyline.positions[positionIndex][key] = value;
  updateMapFromTable(polylineIndex, positionIndex);
}

// 添加动作选项
const actionOptions = [
  { label: '无', value: '' },
  { label: '下落攻击', value: 'stop_flying' },
  { label: '强制传送', value: 'force_tp' },
  { label: '纳西妲长E收集', value: 'nahida_collect' },
  { label: '战斗', value: 'fight' },
];

function handleChange(newData) {
  const polyline = polylines.value[selectedPolylineIndex.value];
  
  // 更新位置数据
  polyline.positions = newData.map((item, index) => ({
    ...item,
    id: index + 1
  }));

  // 更新地图上的折线
  const latlngs = newData.map(pos => {
    const main1024Pos = gameToMain1024(pos.x, pos.y);
    return L.latLng(main1024Pos.y, main1024Pos.x);
  });
  polyline.layer.setLatLngs(latlngs);
}

// 添加删除点位的函数
function deletePosition(index) {
  const polyline = polylines.value[selectedPolylineIndex.value];
  polyline.positions.splice(index, 1);
  
  // 更新地图上的折线
  const latlngs = polyline.positions.map(pos => {
    const main1024Pos = gameToMain1024(pos.x, pos.y);
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

function addNewPoint(x, y) {
  const main1024Pos = gameToMain1024(x, y);
  const newPoint = {
    id: 1,
    x: x,
    y: y,
    type: 'path',
    move_mode: 'walk',
    action: ''
  };

  if (selectedPolylineIndex.value === -1 || polylines.value.length === 0) {
    // 如果没有选中的路径或没有路径，创建新路径
    const layer = L.polyline([L.latLng(main1024Pos.y, main1024Pos.x)], {
      color: 'red',
      weight: 3
    }).addTo(map.value);
    layer.on("pm:edit", handleMapPointChange);
    addPolyline(layer, "未命名路径");  // 使用默认名称 "未命名路径"
  } else {
    // 添加新点位到现有路径
    const polyline = polylines.value[selectedPolylineIndex.value];
    newPoint.id = polyline.positions.length + 1;
    polyline.positions.push(newPoint);

    // 更新地图上的折线
    const latlngs = polyline.layer.getLatLngs();
    latlngs.push(L.latLng(main1024Pos.y, main1024Pos.x));
    polyline.layer.setLatLngs(latlngs);
  }
}

window.addNewPoint = (x, y) => {
  addNewPoint(x, y);
};
  

function handleAddPointFromModal() {
  addNewPoint(newPointX.value, newPointY.value);
  showAddPointModal.value = false;
}

function selectPoint(record, rowIndex) {
  // 清除之前的高亮标记
  if (highlightMarker.value) {
    map.value.removeLayer(highlightMarker.value);
    highlightMarker.value = null;
  }

  // 高亮选中的点
  const main1024Pos = gameToMain1024(record.x, record.y);
  
  // 创建新的高亮标记
  highlightMarker.value = L.marker([main1024Pos.y, main1024Pos.x], {
    icon: L.divIcon({
      className: 'highlight-marker',
      html: '<div style="background-color: #ff3333; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    })
  }).addTo(map.value);

  selectedPointIndex.value = rowIndex;
  
  // 将地图视图居中到选中的点
  map.value.setView([main1024Pos.y, main1024Pos.x], map.value.getZoom());
}

</script>

<template>
  <a-layout class="layout">
    <a-layout-sider width="45%" :resize-directions="['right']">
      <div id="map"></div>
    </a-layout-sider>
    <a-layout-content>
      <a-space direction="vertical" size="large" fill>
        <a-card title="路径列表">
          <template #extra>
            <a-button @click="importPositions" type="primary" size="small">导入路径</a-button>
          </template>
          <a-list :data="polylines" :bordered="false">
            <template #item="{ item, index }">
              <a-list-item>
                <a-space>
                  <a-input
                    v-model="item.name"
                    @change="(value) => renamePolyline(index, value)"
                    style="width: 150px;"
                  />
                  <a-button @click="selectPolyline(index)" type="primary" size="small">选择</a-button>
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
          >
            <template #drag-handle-icon>
              <icon-drag-dot-vertical />
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
                <a-option value="fly">飞行</a-option>
                <a-option value="swim">游泳</a-option>
              </a-select>
            </template>
            <template #action="{ record }">
              <a-select v-model="record.action">
                <a-option v-for="option in actionOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </a-option>
              </a-select>
            </template>
            <template #type="{ record }">
              <a-select v-model="record.type">
                <a-option value="teleport">传送</a-option>
                <a-option value="path">途经</a-option>
                <a-option value="target">目标</a-option>
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
            </template>
          </a-table>

          <template #extra>
            <a-button @click="openAddPointModal" type="primary" size="small">添加点位</a-button>
          </template>
        </a-card>
      </a-space>
    </a-layout-content>
  </a-layout>

  <!-- 添加点位的模态框 -->
  <a-modal
    v-model:visible="showAddPointModal"
    title="添加新点位"
    @ok="handleAddPointFromModal"
    @cancel="showAddPointModal = false"
  >
    <a-form :model="{ x: newPointX, y: newPointY }">
      <a-form-item field="x" label="X坐标">
        <a-input-number v-model="newPointX" placeholder="请输入X坐标" />
      </a-form-item>
      <a-form-item field="y" label="Y坐标">
        <a-input-number v-model="newPointY" placeholder="请输入Y坐标" />
      </a-form-item>
    </a-form>
  </a-modal>

  <!-- 导出模态框 -->
  <a-modal
    v-model:visible="showExportModal"
    title="导出路径"
    @ok="handleExport"
    @cancel="showExportModal = false"
  >
    <a-form :model="{ author: exportAuthor, version: exportVersion }">
      <a-form-item field="author" label="作者">
        <a-input v-model="exportAuthor" placeholder="请输入作者" />
      </a-form-item>
      <a-form-item field="version" label="版本">
        <a-input v-model="exportVersion" placeholder="请输入版本号,从1.0开始" />
      </a-form-item>
      <a-form-item field="description" label="描述">
        <a-textarea v-model="exportDescription" placeholder="请输入描述" :auto-size="{ minRows: 3, maxRows: 5 }" />
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<script>
const columns = [
  { title: '#', dataIndex: 'id' },
  { title: 'X坐标', dataIndex: 'x', slotName: 'x' },
  { title: 'Y坐标', dataIndex: 'y', slotName: 'y' },
  { title: '类型', dataIndex: 'type', slotName: 'type' },
  { title: '移动方式', dataIndex: 'move_mode', slotName: 'move_mode' },
  { title: '动作', dataIndex: 'action', slotName: 'action' },
  { title: '操作', slotName: 'operations' },
];
</script>

<style>
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
</style>
