<script setup>
/** 提瓦特与独立地图共用的分层地图控制器。 */
import L from 'leaflet';
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue';
import teyvatLayerConfig from '../config/teyvatLayerConfig';
import ancientSacredMountainLayerConfig from '../config/layers/AncientSacredMountain';
import moonCanonLayerConfig from '../config/layers/MoonCanon';
import seaOfBygoneErasLayerConfig from '../config/layers/SeaOfBygoneEras';
import templeOfSpaceLayerConfig from '../config/layers/TempleOfSpace';
import {currentMapConfig, currentMapName, imageHeight, imageWidth, map} from '../stores/editor';
import {getLayerImageUrl} from '../utils/layerImageIndex';

const LAYER_CATALOGS = {
  Teyvat: teyvatLayerConfig,
  TempleOfSpace: templeOfSpaceLayerConfig,
  SeaOfBygoneEras: seaOfBygoneErasLayerConfig,
  AncientSacredMountain: ancientSacredMountainLayerConfig,
  MoonCanon: moonCanonLayerConfig,
};

// 分层图由控制器统一响应缩放事件。这样 Group 切换并重建 ImageOverlay 后，
// 不依赖每个临时图层各自注册/注销 zoomanim，避免第二个 Group 丢失缩放监听。
const LayeredImageOverlay = L.ImageOverlay.extend({
  getEvents() {
    return {};
  },
});

const controlElement = ref(null);
const floorControlElement = ref(null);
const enabled = ref(false);
const selectedGroupId = ref('');
const selectedFloorLevel = ref(null);
const groupSearch = ref('');
const viewportReferenceBounds = ref(null);

const layerCatalog = computed(() => LAYER_CATALOGS[currentMapName.value] || null);
const hasLayeredMap = computed(() => Boolean(layerCatalog.value && currentMapConfig.value?.layeredMap));
const floors = computed(() => Object.entries(layerCatalog.value?.floors || {})
  .map(([level, floor]) => ({...floor, floorLevel: Number(level)}))
  .sort((a, b) => a.floorLevel - b.floorLevel));

function commonGroupName(names, fallback = names[0]) {
  const unique = [...new Set(names)];
  if (unique.length === 1) return unique[0];
  let prefix = unique[0];
  for (const name of unique.slice(1)) {
    while (prefix && !name.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  prefix = prefix.replace(/[·・\s的第—-]+$/u, '');
  if (prefix.length >= 4) return prefix;
  const ordered = [fallback, ...unique.filter((name) => name !== fallback)];
  return `${ordered.slice(0, 2).join(' / ')}${ordered.length > 2 ? ' / …' : ''}`;
}

const groupOptions = computed(() => {
  const groups = new Map();
  for (const floor of floors.value) {
    for (const area of floor.areas) {
      const id = String(area.id);
      const group = groups.get(id) || {
        id,
        names: [],
        nameEntries: [],
        floorLabels: [],
        bounds: [Infinity, Infinity, -Infinity, -Infinity],
      };
      group.names.push(area.name);
      group.nameEntries.push({level: floor.floorLevel, name: area.name});
      group.floorLabels.push(floor.label);
      for (const layer of area.layers) {
        group.bounds[0] = Math.min(group.bounds[0], layer.bounds[0]);
        group.bounds[1] = Math.min(group.bounds[1], layer.bounds[1]);
        group.bounds[2] = Math.max(group.bounds[2], layer.bounds[2]);
        group.bounds[3] = Math.max(group.bounds[3], layer.bounds[3]);
      }
      groups.set(id, group);
    }
  }
  return [...groups.values()]
    .map((group) => {
      const representative = [...group.nameEntries].sort((a, b) => {
        const priority = (level) => level === -1 ? 0 : level === 0 ? 1 : level === 1 ? 2 : 3 + Math.abs(level);
        return priority(a.level) - priority(b.level);
      })[0]?.name;
      return {
        ...group,
        label: commonGroupName(group.names, representative),
        searchText: [...new Set(group.names)].join(' '),
        floorText: [...new Set(group.floorLabels)].join(' / '),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN', {numeric: true}));
});
const selectedGroupOption = computed(() => groupOptions.value
  .find((group) => group.id === selectedGroupId.value));
const groupSelectClass = computed(() => ({
  compact: (selectedGroupOption.value?.label.length || 0) > 9,
  dense: (selectedGroupOption.value?.label.length || 0) > 13,
}));
const floorOptions = computed(() => floors.value
  .map((floor) => ({
    level: floor.floorLevel,
    label: floor.label,
    name: floor.areas.find((area) => String(area.id) === selectedGroupId.value)?.name,
  }))
  .filter((floor) => floor.name));
const visibleGroupOptions = computed(() => {
  if (groupSearch.value.trim() || !viewportReferenceBounds.value) return groupOptions.value;
  const [left, top, right, bottom] = viewportReferenceBounds.value;
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  // 提瓦特在总览缩放下会同时覆盖上百个 Group；只给出离视野中心最近的候选。
  // 输入任意文字后仍搜索完整目录，不会丢失远处 Group。
  const intersecting = groupOptions.value
    .filter(({bounds}) => bounds[0] <= right && bounds[2] >= left && bounds[1] <= bottom && bounds[3] >= top);
  const visibleGroups = (intersecting.length ? intersecting : groupOptions.value)
    .sort((a, b) => {
      const distanceA = ((a.bounds[0] + a.bounds[2]) / 2 - centerX) ** 2
        + ((a.bounds[1] + a.bounds[3]) / 2 - centerY) ** 2;
      const distanceB = ((b.bounds[0] + b.bounds[2]) / 2 - centerX) ** 2
        + ((b.bounds[1] + b.bounds[3]) / 2 - centerY) ** 2;
      return distanceA - distanceB;
    })
    .slice(0, 20);
  const selected = groupOptions.value.find((group) => group.id === selectedGroupId.value);
  return selected && !visibleGroups.some((group) => group.id === selected.id)
    ? [selected, ...visibleGroups]
    : visibleGroups;
});

let control = null;
let controlMap = null;
let viewportMap = null;
let overlayMap = null;
let cachedGroupId = '';
let cachedFloorLayers = new Map();
let ignoreBlankClickUntil = 0;

function imageBounds(bounds) {
  const config = currentMapConfig.value.layeredMap;
  const scaleX = imageWidth.value / config.referenceWidth;
  const scaleY = imageHeight.value / config.referenceHeight;
  return [
    [bounds[1] * scaleY, bounds[0] * scaleX],
    [bounds[3] * scaleY, bounds[2] * scaleX],
  ];
}

function refreshViewportBounds() {
  if (controlElement.value && map.value) {
    const {x: mapWidth, y: mapHeight} = map.value.getSize();
    controlElement.value.style.setProperty('--layered-map-floor-top', `${mapHeight / 2}px`);
    controlElement.value.style.setProperty(
      '--layered-map-select-width',
      `${Math.max(170, Math.min(340, mapWidth - 54))}px`,
    );
  }
  if (!map.value || !imageWidth.value || !imageHeight.value || !currentMapConfig.value?.layeredMap) {
    viewportReferenceBounds.value = null;
    return;
  }
  const bounds = map.value.getBounds();
  const config = currentMapConfig.value.layeredMap;
  const scaleX = config.referenceWidth / imageWidth.value;
  const scaleY = config.referenceHeight / imageHeight.value;
  viewportReferenceBounds.value = [
    bounds.getWest() * scaleX,
    bounds.getSouth() * scaleY,
    bounds.getEast() * scaleX,
    bounds.getNorth() * scaleY,
  ];
}

function attachViewportListener() {
  if (viewportMap) {
    viewportMap.off('moveend zoomend resize', refreshViewportBounds);
    viewportMap.off('zoomanim', animateCachedOverlays);
    viewportMap.off('zoom viewreset', resetCachedOverlayGeometry);
    viewportMap.off('click', closeModeOnBlankMapClick);
  }
  viewportMap = map.value;
  if (viewportMap) {
    viewportMap.on('moveend zoomend resize', refreshViewportBounds);
    viewportMap.on('zoomanim', animateCachedOverlays);
    viewportMap.on('zoom viewreset', resetCachedOverlayGeometry);
    viewportMap.on('click', closeModeOnBlankMapClick);
  }
  refreshViewportBounds();
}

function closeModeOnBlankMapClick(event) {
  if (!enabled.value || Date.now() < ignoreBlankClickUntil) return;
  const target = event.originalEvent?.target;
  if (target instanceof Element && target.closest(
    '.leaflet-control, .leaflet-marker-icon, .leaflet-interactive, .layered-map-piece, '
      + '.arco-trigger-popup, .arco-select-dropdown, .arco-select-option',
  )) return;
  enabled.value = false;
}

function removeCachedLayers() {
  if (overlayMap) {
    for (const entries of cachedFloorLayers.values()) {
      for (const {overlay} of entries) overlay.removeFrom(overlayMap);
    }
  }
  cachedFloorLayers = new Map();
  cachedGroupId = '';
}

function clearMode() {
  removeCachedLayers();
  if (overlayMap) {
    const container = overlayMap.getContainer();
    container.classList.remove('layered-map-mode');
    container.style.removeProperty('--layered-map-base-opacity');
  }
  overlayMap = null;
}

function setOverlayState(overlay, visible, selected, stackIndex) {
  const element = overlay.getElement();
  if (!element) return;
  const config = currentMapConfig.value.layeredMap;
  element.style.visibility = visible ? 'visible' : 'hidden';
  element.style.filter = selected ? 'none' : `brightness(${config.greyedLayerBrightness})`;
  element.style.zIndex = String(selected ? 1000 + stackIndex : stackIndex);
  element.classList.toggle('is-selected-layer', selected);
  element.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function animateCachedOverlays(event) {
  for (const entries of cachedFloorLayers.values()) {
    for (const {overlay} of entries) overlay._animateZoom(event);
  }
}

function resetCachedOverlayGeometry() {
  for (const entries of cachedFloorLayers.values()) {
    for (const {overlay} of entries) overlay._reset();
  }
}

function showSelectedFloor() {
  const selectedLevel = selectedFloorLevel.value;
  if (enabled.value && cachedGroupId === selectedGroupId.value && selectedLevel !== null) {
    // 同组全部层都参与显示；非当前层统一进入暗化 Pane，当前层单独置顶。
    for (const {level} of floorOptions.value) {
      buildFloor(level, level === selectedLevel);
    }
  }
  const orderedLevels = [...cachedFloorLayers.keys()].sort((a, b) => a - b);
  orderedLevels.forEach((level, stackIndex) => {
    const visible = selectedLevel !== null;
    for (const {overlay} of cachedFloorLayers.get(level)) {
      setOverlayState(overlay, visible, level === selectedLevel, stackIndex);
    }
  });
}

function filterGroupOption(inputValue, option) {
  const item = groupOptions.value.find((candidate) => candidate.id === String(option.value));
  const query = inputValue.trim().toLocaleLowerCase();
  return !query || `${item?.searchText || ''} ${item?.floorText || ''}`
    .toLocaleLowerCase()
    .includes(query);
}

function layerImageUrl(id) {
  const config = currentMapConfig.value.layeredMap;
  const bundled = getLayerImageUrl(currentMapName.value, id, config.format);
  if (bundled) return bundled;
  return `${config.imageDir}/UI_Map_LayeredMap_${id}.${config.format}`;
}

function buildFloor(level, highPriority = false) {
  if (cachedFloorLayers.has(level) || !overlayMap) return;
  const floor = floors.value.find((item) => item.floorLevel === level);
  const layers = floor?.areas
    .filter((area) => String(area.id) === selectedGroupId.value)
    .flatMap((area) => area.layers) || [];
  if (!layers.length) return;

  const config = currentMapConfig.value.layeredMap;
  const entries = layers.map((layer) => {
    // 在设置 src 前声明优先级，并主动触发解码；切到后续楼层时不再临时解码大图。
    const image = new Image();
    image.fetchPriority = highPriority ? 'high' : 'auto';
    image.decoding = 'async';
    image.loading = 'eager';
    image.src = layerImageUrl(layer.id);
    const overlay = new LayeredImageOverlay(
      image,
      imageBounds(layer.bounds),
      {
        pane: config.pane,
        opacity: 1,
        interactive: false,
        className: 'layered-map-piece',
      },
    ).addTo(overlayMap);
    image.decode?.().catch(() => {});
    return {overlay, bounds: layer.bounds};
  });
  cachedFloorLayers.set(level, entries);
}

function buildSelectedGroup() {
  removeCachedLayers();
  if (!enabled.value || !overlayMap || !selectedGroupId.value) return;

  cachedGroupId = selectedGroupId.value;
  // 当前层先创建，其余楼层随后预加载并解码，避免首次切层时才开始处理图片。
  const orderedFloors = [...floorOptions.value].sort((a, b) => {
    if (a.level === selectedFloorLevel.value) return -1;
    if (b.level === selectedFloorLevel.value) return 1;
    return a.level - b.level;
  });
  for (const {level} of orderedFloors) buildFloor(level, level === selectedFloorLevel.value);
  showSelectedFloor();
}

function renderMode() {
  clearMode();
  if (!enabled.value || !hasLayeredMap.value || !map.value || !imageWidth.value || !imageHeight.value) return;

  overlayMap = map.value;
  const config = currentMapConfig.value.layeredMap;
  const pane = overlayMap.getPane(config.pane) || overlayMap.createPane(config.pane);
  pane.style.zIndex = '450';
  pane.style.pointerEvents = 'none';
  pane.style.filter = 'none';
  pane.style.backfaceVisibility = 'hidden';
  const container = overlayMap.getContainer();
  container.classList.add('layered-map-mode');
  container.style.setProperty('--layered-map-base-opacity', String(1 - config.backgroundMaskOpacity));
  buildSelectedGroup();
}

function chooseDefaultFloor() {
  const options = floorOptions.value;
  if (options.some((item) => item.level === selectedFloorLevel.value)) return;
  selectedFloorLevel.value = options.find((item) => item.level === -1)?.level
    ?? options.find((item) => item.level === 0)?.level
    ?? [...options].sort((a, b) => Math.abs(a.level) - Math.abs(b.level))[0]?.level
    ?? null;
}

function resetSelection() {
  selectedGroupId.value = '';
  selectedFloorLevel.value = null;
  groupSearch.value = '';
}

function detachControl() {
  if (viewportMap) {
    viewportMap.off('moveend zoomend resize', refreshViewportBounds);
    viewportMap.off('zoomanim', animateCachedOverlays);
    viewportMap.off('zoom viewreset', resetCachedOverlayGeometry);
    viewportMap.off('click', closeModeOnBlankMapClick);
  }
  viewportMap = null;
  if (control && controlMap) control.remove();
  control = null;
  controlMap = null;
}

function attachControl() {
  detachControl();
  if (!map.value || !controlElement.value) return;
  controlMap = map.value;
  control = L.control({position: 'topright'});
  control.onAdd = () => controlElement.value;
  control.addTo(controlMap);
  L.DomEvent.disableClickPropagation(controlElement.value);
  L.DomEvent.disableScrollPropagation(controlElement.value);
  attachViewportListener();
}

function toggle() {
  enabled.value = !enabled.value;
}

watch(map, () => {
  attachControl();
  renderMode();
});
watch(selectedGroupId, () => {
  // Arco 下拉弹层位于 Leaflet 控件 DOM 外；阻止选项点击穿透后立刻退出分层。
  ignoreBlankClickUntil = Date.now() + 300;
  chooseDefaultFloor();
  if (enabled.value && cachedGroupId !== selectedGroupId.value) buildSelectedGroup();
});
watch(selectedFloorLevel, showSelectedFloor);
watch([enabled, imageWidth, imageHeight], renderMode);
watch([imageWidth, imageHeight], refreshViewportBounds);
watch(currentMapName, async () => {
  enabled.value = false;
  resetSelection();
  clearMode();
  await nextTick();
  attachControl();
});
onMounted(attachControl);
onBeforeUnmount(() => {
  clearMode();
  detachControl();
});
</script>

<template>
  <div
    ref="controlElement"
    v-show="hasLayeredMap"
    class="layered-map-control-shell"
  >
    <div class="layered-map-control leaflet-bar">
      <template v-if="enabled">
        <a-select
          v-model="selectedGroupId"
          class="group-select"
          :class="groupSelectClass"
          aria-label="分层地图区域"
          placeholder="附近区域；输入名称可全图搜索"
          :allow-search="{retainInputValue: false}"
          allow-clear
          v-model:input-value="groupSearch"
          :filter-option="filterGroupOption"
        >
          <template #label="{data}">
            <span class="selected-group-label" :title="data.label">{{ data.label }}</span>
          </template>
          <a-option
            v-for="item in visibleGroupOptions"
            :key="item.id"
            :value="item.id"
            :label="item.label"
          >
            <span class="group-option-row">
              <span>{{ item.label }}</span>
              <span class="group-option-meta">{{ item.floorText }}</span>
            </span>
          </a-option>
        </a-select>
      </template>
      <button
        type="button"
        class="mode-button"
        :class="{active: enabled}"
        :title="enabled ? '退出分层地图' : '进入分层地图'"
        aria-label="切换分层地图"
        @click="toggle"
      >{{ enabled ? '×' : '分层' }}</button>
    </div>
    <div
      ref="floorControlElement"
      v-show="enabled && floorOptions.length > 1"
      class="layered-map-floor-control leaflet-bar"
      role="group"
      aria-label="分层地图楼层"
    >
      <button
        v-for="item in floorOptions"
        :key="item.level"
        type="button"
        class="floor-button"
        :class="{active: selectedFloorLevel === item.level}"
        :aria-pressed="selectedFloorLevel === item.level"
        :title="selectedFloorLevel === item.level ? `当前：${item.name}` : item.name"
        @click="selectedFloorLevel = item.level"
      >{{ item.label }}</button>
    </div>
  </div>
</template>

<style scoped>
.layered-map-control-shell {
  position: static !important;
}

.layered-map-control {
  display: flex;
  align-items: stretch;
  overflow: hidden;
  border: 0;
  box-shadow: 0 1px 5px rgb(0 0 0 / 35%);
}

.layered-map-control button,
.layered-map-control :deep(.arco-select) {
  box-sizing: border-box;
  height: 36px;
  border: 0;
  border-right: 1px solid #d7d7d7;
  background: #fff;
  color: #333;
}

.layered-map-control :deep(.arco-select-view-single) {
  height: 36px;
  border: 0;
  border-radius: 0;
  background: #fff;
}

.layered-map-control .group-select {
  width: var(--layered-map-select-width, 250px);
  max-width: calc(100vw - 54px);
}

.selected-group-label {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.layered-map-control .group-select.compact :deep(.arco-select-view-value) {
  font-size: 12px;
}

.layered-map-control .group-select.dense :deep(.arco-select-view-value) {
  font-size: 11px;
}

.layered-map-control .mode-button {
  min-width: 34px;
  padding: 0 6px;
  cursor: pointer;
}

.layered-map-control button:hover,
.layered-map-control :deep(.arco-select-view-single:hover) {
  background: #f4f4f4;
}

.layered-map-control .mode-button.active {
  background: #1677ff;
  color: #fff;
}

.layered-map-control .mode-button.active:hover {
  background: #0958d9;
}

.layered-map-floor-control {
  position: absolute;
  z-index: 1000;
  top: var(--layered-map-floor-top, 50vh);
  right: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transform: translateY(-50%);
  box-shadow: 0 1px 5px rgb(0 0 0 / 35%);
}

.layered-map-floor-control .floor-button {
  box-sizing: border-box;
  width: 44px;
  height: 38px;
  padding: 0 6px;
  border: 0;
  border-bottom: 1px solid #d7d7d7;
  background: #fff;
  color: #333;
  cursor: pointer;
  white-space: nowrap;
}

.layered-map-floor-control .floor-button:last-child {
  border-bottom: 0;
}

.layered-map-floor-control .floor-button:hover {
  background: #f4f4f4;
}

.layered-map-floor-control .floor-button.active {
  background: #e8f3ff;
  color: #1677ff;
  font-weight: 600;
}

.layered-map-floor-control .floor-button.active:hover {
  background: #d7eaff;
}

.layered-map-control > :last-child {
  border-right: 0;
}

:global(#map.layered-map-mode) {
  background: #000;
}

:global(#map.layered-map-mode .leaflet-tile-pane) {
  opacity: var(--layered-map-base-opacity, 0.333333);
  will-change: opacity, transform;
}

:global(#map.layered-map-mode .leaflet-overlay-pane > .leaflet-image-layer:not(.layered-map-piece)) {
  opacity: var(--layered-map-base-opacity, 0.333333) !important;
}

:global(#map .layered-map-piece) {
  opacity: 1 !important;
  will-change: transform, filter;
  backface-visibility: hidden;
  transform-origin: 0 0;
}

.group-option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 16px;
}

.group-option-row > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-option-meta {
  flex: none;
  color: #86909c;
  font-size: 12px;
}
</style>
