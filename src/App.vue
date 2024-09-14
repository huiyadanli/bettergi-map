<script setup>
import { onMounted, ref } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';

const mapImage = ref('/src/assets/1024_map.jpg');
const imageWidth = ref(0);
const imageHeight = ref(0);

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
  const map = L.map('map', {
    attributionControl: false,
    crs: L.CRS.Simple,
    minZoom: -3,  // 允许缩小
    maxZoom: 2    // 允许放大
  });

  const bounds = [[0, 0], [imageHeight.value, imageWidth.value]];
  L.imageOverlay(mapImage.value, bounds).addTo(map);

  map.fitBounds(bounds);
  map.setZoom(0);

  // 初始化 Geoman 控件
  map.pm.addControls({
    position: 'topleft',
    drawMarker: false,
    drawCircleMarker: false,
    drawPolygon: false,
    drawRectangle: false,
    drawCircle: false,
    drawText: false,
    editMode: true,
    dragMode: false,
    cutPolygon: false,
    removalMode: true,
  });

  map.pm.setLang("zh");
}
</script>

<template>
  <div id="map"></div>
</template>

<style>
#map {
  height: 100vh;
  width: 100%;
}
</style>
