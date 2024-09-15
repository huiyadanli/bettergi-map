<script setup>
import { onMounted, ref, computed } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import { gameToMain1024, main1024ToGame } from './utils/coordinateConverter';

const mapImage = ref('/src/assets/1024_map.jpg');
const imageWidth = ref(0);
const imageHeight = ref(0);
const map = ref(null);
const polylines = ref([]);
const selectedPolylineIndex = ref(0);

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


function handleMapPointChange(e) {
  updatePolyline(e.target);
}

// 修改 addPolyline 函数
function addPolyline(layer, name = "未命名路径") {
  const newPolyline = {
    name: name,
    layer: layer,
    positions: layer.getLatLngs().map((latlng, index) => ({
      id: index + 1,
      action: "",
      move_mode: "walk",
      type: index === 0 ? "teleport" : "path",
      x: latlng.lng,
      y: latlng.lat
    }))
  };
  polylines.value.push(newPolyline);
  selectedPolylineIndex.value = polylines.value.length - 1;
  selectPolyline(selectedPolylineIndex.value);
}

// 添加重命名函数
function renamePolyline(index, newName) {
  polylines.value[index].name = newName;
}

function updatePolyline(layer) {
  const index = polylines.value.findIndex(p => p.layer === layer);
  if (index !== -1) {
    polylines.value[index].positions = layer.getLatLngs().map((latlng, idx) => ({
      ...polylines.value[index].positions[idx],
      id: idx + 1,
      type: "path",
      move_mode: "walk",
      action: "",
      x: latlng.lng,
      y: latlng.lat
    }));
  }
}

function importPositions() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (event) => {
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = JSON.parse(e.target.result);
      const positions = data.positions.map(pos => {
        const convertedPos = gameToMain1024(pos.x, pos.y);
        return {
          ...pos,
          x: convertedPos.x,
          y: convertedPos.y
        };
      });
      const latlngs = positions.map(pos => L.latLng(pos.y, pos.x));
      const layer = L.polyline(latlngs, {
        color: 'red',
        weight: 3
      }).addTo(map.value);
      layer.on("pm:edit", handleMapPointChange);
      addPolyline(layer, data.info.name);
      
      // 选中新导入的路径
      selectPolyline(polylines.value.length - 1);
    };
    reader.readAsText(file);
  };
  input.click();
}

function exportPositions(index) {
  const polyline = polylines.value[index];
  const data = {
    info: {
      name: polyline.name,
      type: "collect"
    },
    positions: polyline.positions.map(pos => {
      const gamePos = main1024ToGame(pos.x, pos.y);
      return {
        ...pos,
        x: gamePos.x,
        y: gamePos.y
      };
    })
  };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${polyline.name}.json`;
  a.click();
  URL.revokeObjectURL(url);
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
  const latlngs = polyline.layer.getLatLngs();
  latlngs[positionIndex] = L.latLng(position.y, position.x);
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
];

function handleChange(newData) {
  const polyline = polylines.value[selectedPolylineIndex.value];
  
  // 更新位置数据
  polyline.positions = newData.map((item, index) => ({
    ...item,
    id: index + 1
  }));

  // 更新地图上的折线
  const latlngs = newData.map(pos => L.latLng(pos.y, pos.x));
  polyline.layer.setLatLngs(latlngs);
}

// 添加删除点位的函数
function deletePosition(index) {
  const polyline = polylines.value[selectedPolylineIndex.value];
  polyline.positions.splice(index, 1);
  const latlngs = polyline.positions.map(pos => L.latLng(pos.y, pos.x));
  polyline.layer.setLatLngs(latlngs);
}

</script>

<template>
  <a-layout class="layout">
    <a-layout-sider width="50%">
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
              <a-select v-model="record.move_mode" style="width: 120px">
                <a-option value="walk">步行</a-option>
                <a-option value="fly">飞行</a-option>
              </a-select>
            </template>
            <template #action="{ record }">
              <a-select v-model="record.action" style="width: 120px">
                <a-option v-for="option in actionOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </a-option>
              </a-select>
            </template>
            <template #type="{ record }">
              <a-select v-model="record.type" style="width: 120px">
                <a-option value="teleport">传送点</a-option>
                <a-option value="path">途经点</a-option>
                <a-option value="target">目标点</a-option>
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
        </a-card>
      </a-space>
    </a-layout-content>
  </a-layout>
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
</style>
