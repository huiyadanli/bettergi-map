<script setup>
/**
 * Leaflet 地图容器。
 *
 * 只提供 #map 挂载点，地图实例由 useMap 创建。
 */
import {onBeforeUnmount, watch} from 'vue';
import L from 'leaflet';
import LayeredMapControl from './LayeredMapControl.vue';
import {map, routePointTooltipsEnabled} from '../stores/editor';
import {setRoutePointTooltipsEnabled} from '../composables/useRoutes';

let tooltipControl = null;
let tooltipControlMap = null;
let tooltipButton = null;
let attachToken = 0;

function updateTooltipButton() {
  if (!tooltipButton) return;
  const enabled = routePointTooltipsEnabled.value;
  tooltipButton.classList.toggle('active', enabled);
  tooltipButton.setAttribute('aria-pressed', String(enabled));
  tooltipButton.setAttribute('aria-label', enabled ? '关闭点位提示' : '开启点位提示');
  tooltipButton.title = enabled ? '点位提示：已开启' : '点位提示：已关闭';
}

function detachTooltipControl() {
  if (tooltipControl && tooltipControlMap) tooltipControl.remove();
  tooltipControl = null;
  tooltipControlMap = null;
  tooltipButton = null;
}

function attachTooltipControl(currentMap) {
  const token = ++attachToken;
  detachTooltipControl();
  if (!currentMap) return;

  // useMap 会在下一帧添加缩放与 Geoman 工具；再延后一帧保证开关排在操作栏末尾。
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (token !== attachToken || map.value !== currentMap) return;
    tooltipControlMap = currentMap;
    tooltipControl = L.control({position: 'topleft'});
    tooltipControl.onAdd = () => {
      const container = L.DomUtil.create('div', 'route-point-tooltip-control');
      tooltipButton = L.DomUtil.create('button', 'route-point-tooltip-toggle', container);
      tooltipButton.type = 'button';
      tooltipButton.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 5.5h14v10H11l-4.5 3v-3H5z"/>
          <circle cx="9" cy="10.5" r="1"/>
          <circle cx="12" cy="10.5" r="1"/>
          <circle cx="15" cy="10.5" r="1"/>
          <path class="disabled-slash" d="M4.5 4.5l15 15"/>
        </svg>`;
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);
      tooltipButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setRoutePointTooltipsEnabled(!routePointTooltipsEnabled.value);
      });
      updateTooltipButton();
      return container;
    };
    tooltipControl.addTo(currentMap);
  }));
}

watch(map, attachTooltipControl, {immediate: true});
watch(routePointTooltipsEnabled, updateTooltipButton);

onBeforeUnmount(() => {
  attachToken += 1;
  detachTooltipControl();
});
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
