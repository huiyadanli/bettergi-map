<script setup>
import { onMounted, ref } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import { gameToMain1024, main1024ToGame } from './utils/coordinateConverter';

const mapImage = ref('/src/assets/1024_map.jpg');
const imageWidth = ref(0);
const imageHeight = ref(0);
const map = ref(null);
const positions = ref([]);
const polyline = ref(null);

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
    removalMode: true,
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
      polyline.value = e.layer;
      updatePositions();
    }
  });

  map.value.on('pm:edit', (e) => {
    if (e.layer instanceof L.Polyline) {
      updatePositions();
    }
  });
}

function updatePositions() {
  if (polyline.value) {
    positions.value = polyline.value.getLatLngs().map((latlng, index) => ({
      action: "",
      move_mode: index === 0 ? "walk" : "fly",
      type: index === 0 ? "teleport" : "path",
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
      positions.value = data.positions.map(pos => {
        const convertedPos = gameToMain1024(pos.x, pos.y);
        return {
          ...pos,
          x: convertedPos.x,
          y: convertedPos.y
        };
      });
      drawPolyline();
    };
    reader.readAsText(file);
  };
  input.click();
}

function exportPositions() {
  const data = {
    info: {
      name: "月莲_禅那园",
      type: "collect"
    },
    positions: positions.value.map(pos => {
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
  a.download = 'positions.json';
  a.click();
  URL.revokeObjectURL(url);
}

function drawPolyline() {
  if (polyline.value) {
    map.value.removeLayer(polyline.value);
  }

  const latlngs = positions.value.map(pos => [pos.y, pos.x]);
  polyline.value = L.polyline(latlngs, {
    color: 'red',
    weight: 3
  }).addTo(map.value);

  map.value.fitBounds(polyline.value.getBounds());
}
</script>

<template>
  <div>
    <div id="map"></div>
    <div class="controls">
      <button @click="importPositions">导入点位</button>
      <button @click="exportPositions">导出点位</button>
    </div>
  </div>
</template>

<style>
#map {
  height: 90vh;
  width: 100%;
}
.controls {
  padding: 10px;
  display: flex;
  justify-content: center;
  gap: 10px;
}
</style>
