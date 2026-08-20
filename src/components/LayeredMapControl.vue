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

// 分层区域切换时会整批重建 ImageOverlay，因此由控制器持有唯一一组
// 地图事件监听。事件处理必须同步执行，不能再延迟到下一帧，否则底图
// 已经开始变换而分层图仍停留在上一帧，连续缩放时会明显脱节。
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
  .map((floor) => {
    const area = floor.areas.find((item) => String(item.id) === selectedGroupId.value);
    return {
      level: floor.floorLevel,
      floorId: area?.floorId,
      label: floor.label,
      name: area?.name,
    };
  })
  .filter((floor) => floor.name));
const selectedFloorId = computed(() => floorOptions.value
  .find((floor) => floor.level === selectedFloorLevel.value)?.floorId ?? null);
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
let cachedBackgroundLayers = new Map();
let tileTransformObserver = null;
let overlayResetTimer = 0;
let overlayGeometryZoom = null;

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
  // The map ref is assigned immediately after `L.map()` is created, before
  // initMap() has called fitBounds/setView. Leaflet cannot answer getBounds()
  // during that short window, so wait for its loaded state instead of letting
  // the control's watcher throw and abort the component update.
  if (!map.value?._loaded) {
    viewportReferenceBounds.value = null;
    return;
  }
  if (controlElement.value && map.value) {
    const {x: mapWidth, y: mapHeight} = map.value.getSize();
    controlElement.value.style.setProperty('--layered-map-floor-top', `${mapHeight / 2}px`);
    controlElement.value.style.setProperty(
      '--layered-map-floor-max-height',
      `${Math.max(120, mapHeight - 150)}px`,
    );
    controlElement.value.style.setProperty(
      '--layered-map-select-width',
      `${Math.max(96, Math.min(320, mapWidth - 84))}px`,
    );
    controlElement.value.classList.toggle('is-narrow', mapWidth < 230);
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
  }
  viewportMap = map.value;
  if (viewportMap) {
    viewportMap.on('moveend zoomend resize', refreshViewportBounds);
  }
  refreshViewportBounds();
}

function handleKeydown(event) {
  if (event.key === 'Escape' && enabled.value && !event.defaultPrevented) {
    enabled.value = false;
  }
}

function removeCachedLayers() {
  if (overlayMap) {
    for (const entries of cachedFloorLayers.values()) {
      for (const {overlay} of entries) overlay.removeFrom(overlayMap);
    }
    for (const {entries} of cachedBackgroundLayers.values()) {
      for (const {overlay} of entries) overlay.removeFrom(overlayMap);
    }
  }
  cachedFloorLayers = new Map();
  cachedBackgroundLayers = new Map();
  cachedGroupId = '';
}

function clearMode() {
  tileTransformObserver?.disconnect();
  tileTransformObserver = null;
  if (overlayResetTimer) window.clearTimeout(overlayResetTimer);
  overlayResetTimer = 0;
  overlayGeometryZoom = null;
  removeCachedLayers();
  if (overlayMap) {
    overlayMap.off('zoomanim', animateCachedOverlays);
    const container = overlayMap.getContainer();
    container.classList.remove('layered-map-mode');
    container.style.removeProperty('--layered-map-base-opacity');
  }
  overlayMap = null;
}

function setOverlayState(overlay, visible, selected, stackIndex, background = false) {
  const element = overlay.getElement();
  if (!element) return;
  const config = currentMapConfig.value.layeredMap;
  element.style.visibility = visible ? 'visible' : 'hidden';
  element.style.filter = selected ? 'none' : `brightness(${config.greyedLayerBrightness})`;
  element.style.zIndex = String(selected ? 1000 + stackIndex : stackIndex);
  element.classList.toggle('is-selected-layer', selected);
  element.classList.toggle('is-background-group', background);
  element.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function animateCachedOverlays(event) {
  if (!overlayMap || !Number.isFinite(event?.zoom)) return;
  if (overlayResetTimer) {
    window.clearTimeout(overlayResetTimer);
    overlayResetTimer = 0;
  }
  const baseZoom = Number.isFinite(overlayGeometryZoom)
    ? overlayGeometryZoom
    : overlayMap.getZoom();
  const scale = overlayMap.getZoomScale(event.zoom, baseZoom);
  for (const entries of cachedFloorLayers.values()) {
    for (const {overlay} of entries) {
      const element = overlay.getElement();
      if (!element) continue;
      const offset = overlayMap._latLngBoundsToNewLayerBounds(
        overlay.getBounds(),
        event.zoom,
        event.center,
      ).min;
      L.DomUtil.setTransform(element, offset, scale);
    }
  }
  for (const {entries} of cachedBackgroundLayers.values()) {
    for (const {overlay} of entries) {
      const element = overlay.getElement();
      if (!element) continue;
      const offset = overlayMap._latLngBoundsToNewLayerBounds(
        overlay.getBounds(),
        event.zoom,
        event.center,
      ).min;
      L.DomUtil.setTransform(element, offset, scale);
    }
  }
  overlayResetTimer = window.setTimeout(() => {
    overlayResetTimer = 0;
    resetCachedOverlayGeometry();
  }, 280);
}

function resetCachedOverlayGeometry() {
  for (const entries of cachedFloorLayers.values()) {
    for (const {overlay} of entries) overlay._reset();
  }
  for (const {entries} of cachedBackgroundLayers.values()) {
    for (const {overlay} of entries) overlay._reset();
  }
  overlayGeometryZoom = overlayMap?._loaded ? overlayMap.getZoom() : null;
}

function attachTileTransformObserver() {
  tileTransformObserver?.disconnect();
  tileTransformObserver = null;
  if (!overlayMap) return;
  const tilePane = overlayMap.getPane('tilePane');
  if (!tilePane) return;

  // GridLayer 会先修改瓦片容器 transform，再由浏览器绘制下一帧。
  // MutationObserver 在绘制前的同一微任务中触发，可让分层图采用完全
  // 相同的目标中心和 zoom，避免经 requestAnimationFrame 后慢一帧。
  tileTransformObserver = new MutationObserver((mutations) => {
    const tileContainerChanged = mutations.some((mutation) => (
      mutation.target instanceof Element
      && mutation.target.classList.contains('leaflet-tile-container')
    ));
    if (!tileContainerChanged) return;
    if (!overlayMap?._loaded || (cachedFloorLayers.size === 0 && cachedBackgroundLayers.size === 0)) return;
    animateCachedOverlays({
      center: overlayMap.getCenter(),
      zoom: overlayMap.getZoom(),
    });
  });
  tileTransformObserver.observe(tilePane, {
    attributes: true,
    subtree: true,
    attributeFilter: ['style'],
  });
}

function showSelectedFloor() {
  const selectedLevel = selectedFloorLevel.value;
  if (enabled.value && cachedGroupId === selectedGroupId.value && selectedLevel !== null) {
    // 同组全部层都参与显示；非当前层统一进入暗化 Pane，当前层单独置顶。
    for (const {level} of floorOptions.value) {
      buildFloor(level, level === selectedLevel);
    }
  }
  let stackIndex = 0;
  const backgroundGroupIds = layerCatalog.value?.groups?.[selectedGroupId.value]?.backgroundGroupIds || [];
  for (const groupId of backgroundGroupIds) {
    const records = [...cachedBackgroundLayers.values()]
      .filter((record) => String(record.groupId) === String(groupId))
      .sort((a, b) => a.level - b.level);
    for (const {entries} of records) {
      for (const {overlay} of entries) setOverlayState(overlay, true, false, stackIndex, true);
      stackIndex += 1;
    }
  }
  const orderedLevels = [...cachedFloorLayers.keys()].sort((a, b) => a - b);
  orderedLevels.forEach((level) => {
    const visible = selectedLevel !== null;
    for (const {overlay} of cachedFloorLayers.get(level)) {
      setOverlayState(overlay, visible, level === selectedLevel, stackIndex);
    }
    stackIndex += 1;
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

function createLayerEntries(layers, highPriority = false) {
  const config = currentMapConfig.value.layeredMap;
  return layers.map((layer) => {
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
}

function buildFloor(level, highPriority = false) {
  if (cachedFloorLayers.has(level) || !overlayMap) return;
  const floor = floors.value.find((item) => item.floorLevel === level);
  const layers = floor?.areas
    .filter((area) => String(area.id) === selectedGroupId.value)
    .flatMap((area) => area.layers) || [];
  if (!layers.length) return;

  const entries = createLayerEntries(layers, highPriority);
  cachedFloorLayers.set(level, entries);
}

function buildBackgroundGroups() {
  const backgroundGroupIds = layerCatalog.value?.groups?.[selectedGroupId.value]?.backgroundGroupIds || [];
  for (const groupId of backgroundGroupIds) {
    for (const floor of floors.value) {
      const area = floor.areas.find((item) => String(item.id) === String(groupId));
      if (!area?.layers?.length) continue;
      const key = `${groupId}:${area.floorId ?? floor.floorLevel}`;
      if (cachedBackgroundLayers.has(key)) continue;
      cachedBackgroundLayers.set(key, {
        groupId,
        floorId: area.floorId,
        level: floor.floorLevel,
        entries: createLayerEntries(area.layers),
      });
    }
  }
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
  buildBackgroundGroups();
  showSelectedFloor();
  overlayGeometryZoom = overlayMap?._loaded ? overlayMap.getZoom() : null;
}

function renderMode() {
  clearMode();
  if (!enabled.value || !hasLayeredMap.value || !map.value || !imageWidth.value || !imageHeight.value) return;

  overlayMap = map.value;
  overlayMap.on('zoomanim', animateCachedOverlays);
  attachTileTransformObserver();
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

function chooseDefaultFloor(force = false) {
  const options = floorOptions.value;
  if (!force && options.some((item) => item.floorId === selectedFloorId.value)) return;
  const defaultFloorId = layerCatalog.value?.groups?.[selectedGroupId.value]?.defaultFloorId;
  selectedFloorLevel.value = options.find((item) => item.floorId === defaultFloorId)?.level
    ?? options.find((item) => item.level === -1)?.level
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
  chooseDefaultFloor(true);
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
onMounted(() => {
  attachControl();
  window.addEventListener('keydown', handleKeydown);
});
onBeforeUnmount(() => {
  clearMode();
  detachControl();
  window.removeEventListener('keydown', handleKeydown);
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
          placeholder="搜索区域"
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
        :title="enabled ? '退出分层地图（Esc）' : '进入分层地图'"
        aria-label="切换分层地图"
        :aria-pressed="enabled"
        @click="toggle"
      >{{ enabled ? '退出' : '分层' }}</button>
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
  width: max-content;
  max-width: none;
}

.layered-map-control {
  display: flex;
  align-items: stretch;
  width: max-content;
  max-width: none;
  gap: 4px;
  padding: 4px;
  overflow: visible;
  border: 0;
  border-radius: 13px;
  background: rgb(255 255 255 / 88%);
  box-shadow: 0 8px 22px rgb(31 48 76 / 18%);
  backdrop-filter: blur(8px);
}

.layered-map-control button,
.layered-map-control :deep(.arco-select) {
  box-sizing: border-box;
  height: 40px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #36506f;
}

.layered-map-control :deep(.arco-select-view-single) {
  height: 40px;
  border: 0;
  border-radius: 9px;
  background: transparent;
}

.layered-map-control :deep(.group-select) {
  width: var(--layered-map-select-width, 250px);
  min-width: var(--layered-map-select-width, 250px);
  max-width: var(--layered-map-select-width, 250px);
  flex: 0 0 var(--layered-map-select-width, 250px);
}

.layered-map-control-shell.is-narrow :deep(.group-select) {
  min-width: var(--layered-map-select-width, 96px);
  max-width: var(--layered-map-select-width, 96px);
}

.selected-group-label {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.layered-map-control :deep(.group-select.compact .arco-select-view-value) {
  font-size: 12px;
}

.layered-map-control :deep(.group-select.dense .arco-select-view-value) {
  font-size: 11px;
}

.layered-map-control .mode-button {
  flex: none;
  width: 56px;
  min-width: 56px;
  padding: 0 12px;
  appearance: none;
  font-size: 13px;
  font-weight: 650;
  line-height: 1;
  cursor: pointer;
  transform: none;
  transition: background-color 0.14s ease, color 0.14s ease;
}

.layered-map-control button:hover,
.layered-map-control :deep(.arco-select-view-single:hover) {
  background: #eaf3ff;
  color: #1677ff;
}

.layered-map-control .mode-button.active {
  background: #dceeff;
  color: #1264d8;
}

.layered-map-control .mode-button.active:hover {
  background: #cde5ff;
}

.layered-map-control .mode-button:focus-visible,
.layered-map-floor-control .floor-button:focus-visible {
  outline: 0;
  color: #1264d8;
  background: #dceeff;
}

.layered-map-floor-control {
  position: absolute;
  z-index: 1000;
  top: var(--layered-map-floor-top, 50%);
  right: 10px;
  display: flex;
  flex-direction: column;
  max-height: var(--layered-map-floor-max-height, 420px);
  padding: 4px;
  overflow-x: hidden;
  overflow-y: auto;
  transform: translateY(-50%);
  border-radius: 13px;
  background: rgb(255 255 255 / 88%);
  box-shadow: 0 8px 22px rgb(31 48 76 / 18%);
  backdrop-filter: blur(8px);
  scrollbar-width: thin;
}

.layered-map-floor-control .floor-button {
  box-sizing: border-box;
  width: 48px;
  height: 40px;
  min-height: 40px;
  padding: 0 5px;
  appearance: none;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #36506f;
  font-size: 12px;
  font-weight: 550;
  cursor: pointer;
  line-height: 1;
  white-space: nowrap;
  transition: background-color 0.14s ease, color 0.14s ease;
}

.layered-map-floor-control .floor-button:hover {
  background: #eaf3ff;
  color: #1677ff;
}

.layered-map-floor-control .floor-button.active {
  background: #e8f3ff;
  color: #1677ff;
  font-weight: 600;
}

.layered-map-floor-control .floor-button.active:hover {
  background: #cde5ff;
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
