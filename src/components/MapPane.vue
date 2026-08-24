<script setup>
/**
 * Leaflet 地图容器。
 *
 * 只提供 #map 挂载点，地图实例由 useMap 创建。
 */
import LayeredMapControl from './LayeredMapControl.vue';
</script>

<template>
  <div class="map-pane">
    <div id="map"></div>
    <LayeredMapControl/>
  </div>
</template>

<style scoped>
.map-pane,
#map {
  height: 100%;
  width: 100%;
}

.map-pane {
  position: relative;
}
</style>
