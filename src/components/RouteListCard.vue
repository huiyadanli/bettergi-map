<script setup>
/**
 * 路线悬浮面板。
 *
 * 页面只为当前路线保留一行高度；移入或聚焦后，同一片表面向下展开，
 * 其他路线仅在悬浮滚动区中出现，不会挤压点位编辑区。
 */
import {computed, onBeforeUnmount, ref, watch} from 'vue';
import {Modal} from '@arco-design/web-vue';
import {MAPS} from '../config/mapConfig';
import {currentMapName, polylines, selectedPolylineIndex} from '../stores/editor';
import {switchMap} from '../composables/useMap';
import {deletePolyline, renamePolyline, selectPolyline} from '../composables/useRoutes';
import {importPositions} from '../composables/useFileAccess';
import {commonTagManagerModal} from '../composables/useRouteSettings';
import {exportPositions} from '../composables/useExport';
import ComfortSelect from './ComfortSelect.vue';

const expanded = ref(false);
const hasFocus = ref(false);
const popupOpen = ref(false);
const pointerInside = ref(false);
const routePickerElement = ref(null);
const selectedMapName = ref(currentMapName.value);
const routeKeys = new WeakMap();
let routeKeySeed = 0;
let collapseTimer = null;

const activeRoute = computed(() => polylines.value[selectedPolylineIndex.value] || polylines.value[0] || null);
const activeRouteIndex = computed(() => {
  const index = polylines.value.indexOf(activeRoute.value);
  return index < 0 ? 0 : index;
});
const mapOptions = Object.entries(MAPS).map(([value, config]) => ({
  value,
  label: config.displayName,
}));
const otherRoutes = computed(() => polylines.value
  .map((item, index) => ({item, index}))
  .filter(({index}) => index !== activeRouteIndex.value));

function routeKey(item) {
  if (!routeKeys.has(item)) routeKeys.set(item, `route-${++routeKeySeed}`);
  return routeKeys.get(item);
}

function expandRoutes() {
  if (collapseTimer) clearTimeout(collapseTimer);
  expanded.value = true;
}

function handleMouseEnter() {
  pointerInside.value = true;
  expandRoutes();
}

function handleMouseLeave() {
  pointerInside.value = false;
  const active = document.activeElement;
  const isEditing = Boolean(
    active
    && routePickerElement.value?.contains(active)
    && active.matches?.('input, textarea, [contenteditable="true"]'),
  );
  scheduleCollapse(!isEditing);
}

function routeHasFocus() {
  return popupOpen.value || Boolean(
    document.activeElement && routePickerElement.value?.contains(document.activeElement),
  );
}

function scheduleCollapse(force = false) {
  if (collapseTimer) clearTimeout(collapseTimer);
  collapseTimer = setTimeout(() => {
    collapseTimer = null;
    hasFocus.value = routeHasFocus();
    if (!popupOpen.value && (force || !hasFocus.value)) expanded.value = false;
  }, 140);
}

function closeRoutes() {
  if (collapseTimer) clearTimeout(collapseTimer);
  popupOpen.value = false;
  hasFocus.value = false;
  expanded.value = false;
}

function handleFocusIn() {
  hasFocus.value = true;
  expandRoutes();
}

function handleFocusOut() {
  hasFocus.value = routeHasFocus();
  if (!hasFocus.value) scheduleCollapse();
}

function handleMapPopup(visible) {
  popupOpen.value = visible;
  if (visible) expandRoutes();
  else scheduleCollapse(!pointerInside.value);
}

function formatRouteIndex(index) {
  return String(index + 1).padStart(2, '0');
}

watch(currentMapName, (value) => {
  selectedMapName.value = value;
});

let switchingMap = false;

async function handleMapChange(nextMapName) {
  if (nextMapName === currentMapName.value || switchingMap) return;

  if (polylines.value.length) {
    const shouldSwitch = await new Promise((resolve) => {
      Modal.confirm({
        title: '切换地图？',
        content: '切换地图会清空当前已加载的路线，建议先导出保存。',
        okText: '继续切换',
        cancelText: '留在当前地图',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
    if (!shouldSwitch) {
      selectedMapName.value = currentMapName.value;
      return;
    }
  }

  switchingMap = true;
  try {
    await switchMap(nextMapName);
  } finally {
    switchingMap = false;
  }
}

onBeforeUnmount(() => {
  if (collapseTimer) clearTimeout(collapseTimer);
});
</script>

<template>
  <section
      ref="routePickerElement"
      class="route-picker"
      :class="{'is-expanded': expanded && otherRoutes.length}"
      aria-label="路线"
      @mouseenter="handleMouseEnter"
      @mouseleave="handleMouseLeave"
      @focusin="handleFocusIn"
      @focusout="handleFocusOut"
      @keydown.esc="closeRoutes"
  >
    <div class="route-surface">
      <div v-if="activeRoute" class="route-bar">
        <div class="route-heading">
          <span class="section-heading-main">路线</span>
        </div>

        <div class="current-route" @click.stop>
          <a-input
              v-model="activeRoute.name"
              class="current-route-name"
              aria-label="当前路线名称"
              @change="(value) => renamePolyline(activeRouteIndex, value)"
          />
          <span class="route-count">{{ activeRoute.positions.length }} 点</span>
        </div>

        <div class="current-route-actions">
          <a-button class="route-locate" type="secondary" @click.stop="selectPolyline(activeRouteIndex)">
            <template #icon><icon-location/></template>
            定位
          </a-button>
          <a-tooltip content="其他设置">
            <a-button class="route-icon-action" type="text" aria-label="其他设置" @click.stop="commonTagManagerModal(activeRouteIndex)">
              <template #icon><icon-settings/></template>
            </a-button>
          </a-tooltip>
          <a-tooltip content="导出路线">
            <a-button class="route-icon-action" type="text" aria-label="导出路线" @click.stop="exportPositions(activeRouteIndex)">
              <template #icon><icon-export/></template>
            </a-button>
          </a-tooltip>
          <a-tooltip content="删除路线">
            <a-button class="route-icon-action danger" type="text" status="danger" aria-label="删除路线" @click.stop="deletePolyline(activeRouteIndex)">
              <template #icon><icon-delete/></template>
            </a-button>
          </a-tooltip>
        </div>

        <div class="route-toolbar">
          <ComfortSelect
              :model-value="selectedMapName"
              class="map-select"
              :options="mapOptions"
              aria-label="当前地图"
              @change="handleMapChange"
              @popup-visible-change="handleMapPopup"
          />
          <a-button class="import-button" @click.stop="importPositions" type="primary">
            <template #icon><icon-import/></template>
            导入
          </a-button>
        </div>
      </div>

      <div v-else class="route-bar empty-route-bar">
        <div class="route-heading">
          <span class="section-heading-main">路线</span>
        </div>
        <span class="empty-route-name">暂无路线</span>
        <div class="route-toolbar">
          <ComfortSelect
              :model-value="selectedMapName"
              class="map-select"
              :options="mapOptions"
              aria-label="当前地图"
              @change="handleMapChange"
              @popup-visible-change="handleMapPopup"
          />
          <a-button class="import-button" @click.stop="importPositions" type="primary">
            <template #icon><icon-import/></template>
            导入
          </a-button>
        </div>
      </div>

      <div class="route-expand-body" :aria-hidden="!expanded" :inert="!expanded ? '' : null">
        <div v-if="otherRoutes.length" class="route-scroll" role="list" aria-label="其他路线">
          <div
              v-for="({item, index}) in otherRoutes"
              :key="routeKey(item)"
              class="route-option"
              role="listitem"
          >
            <span class="option-number">{{ formatRouteIndex(index) }}</span>
            <a-input
                v-model="item.name"
                class="option-name"
                :title="item.name"
                :aria-label="`路线 ${index + 1} 名称`"
                @click.stop
                @change="(value) => renamePolyline(index, value)"
            />
            <span class="route-count">{{ item.positions.length }} 点</span>
            <div class="option-actions">
              <a-button class="option-locate" type="text" @click.stop="selectPolyline(index)">
                <template #icon><icon-location/></template>
                定位
              </a-button>
              <a-tooltip content="其他设置">
                <a-button class="option-icon-action" type="text" aria-label="其他设置" @click.stop="commonTagManagerModal(index)">
                  <template #icon><icon-settings/></template>
                </a-button>
              </a-tooltip>
              <a-tooltip content="导出路线">
                <a-button class="option-icon-action" type="text" aria-label="导出路线" @click.stop="exportPositions(index)">
                  <template #icon><icon-export/></template>
                </a-button>
              </a-tooltip>
              <a-tooltip content="删除路线">
                <a-button class="option-icon-action danger" type="text" status="danger" aria-label="删除路线" @click.stop="deletePolyline(index)">
                  <template #icon><icon-delete/></template>
                </a-button>
              </a-tooltip>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.route-picker {
  position: relative;
  z-index: 2;
  container-type: inline-size;
  height: 48px;
  min-width: 0;
  overflow: visible;
}

.route-picker.is-expanded {
  z-index: 1000;
}

.route-surface {
  position: absolute;
  inset: 0 0 auto;
  overflow: hidden;
  border: 0;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 4px 15px rgb(31 48 76 / 5%);
  transition: box-shadow 0.16s ease;
}

.route-picker.is-expanded .route-surface {
  box-shadow: 0 18px 44px rgb(31 48 76 / 14%);
}

.route-bar {
  display: grid;
  grid-template-columns: auto minmax(150px, 1fr) auto auto;
  align-items: center;
  min-height: 48px;
  gap: 10px;
  padding: 0 14px;
  background: linear-gradient(100deg, #f1f6ff 0%, #fff 72%);
}

.route-heading {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 100%;
}

.option-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  color: #2468b4;
  background: #e5f0ff;
  border-radius: 7px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.current-route {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 9px;
}

.current-route-name,
.option-name {
  min-width: 0;
}

.current-route-name,
.option-name {
  height: 34px;
  padding: 0 7px;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.current-route-name:hover,
.current-route-name.arco-input-focus,
.option-name:hover,
.option-name.arco-input-focus {
  border-color: transparent !important;
  background: transparent !important;
  box-shadow: none !important;
}

.current-route-name :deep(.arco-input),
.option-name :deep(.arco-input) {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
}

.route-count {
  flex: none;
  color: var(--text-secondary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.current-route-actions,
.route-toolbar {
  display: flex;
  align-items: center;
  flex: none;
  gap: 4px;
}

.route-locate,
.import-button,
.route-icon-action,
.use-route-button {
  min-height: 36px;
}

.route-locate {
  padding: 0 12px;
}

.route-icon-action {
  width: 36px;
  min-width: 36px;
  padding: 0;
  color: #5b6f89;
  font-size: 16px;
}

.route-icon-action:hover {
  color: var(--brand);
  background: var(--brand-soft);
}

.route-icon-action.danger:hover {
  color: #e84646;
  background: var(--danger-soft);
}

.map-select {
  width: 142px;
  --comfort-select-height: 36px;
}

.import-button {
  min-height: 36px;
  height: 36px;
}

.empty-route-bar {
  grid-template-columns: auto minmax(120px, 1fr) auto;
}

.empty-route-name {
  color: var(--text-secondary);
  font-size: 13px;
}

.route-expand-body {
  max-height: 0;
  overflow: hidden;
  opacity: 0;
  background: #fff;
  transition: max-height 0.2s ease, opacity 0.12s ease;
}

.route-picker.is-expanded .route-expand-body {
  max-height: min(calc(52dvh - 48px), 382px);
  opacity: 1;
}

.route-scroll {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: start;
  gap: 2px 8px;
  max-height: min(calc(52dvh - 48px), 382px);
  padding: 6px 8px 8px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
}

.route-option {
  display: grid;
  grid-template-columns: 28px minmax(110px, 1fr) auto auto;
  align-items: center;
  min-height: 46px;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.14s ease;
}

.route-option:hover,
.route-option:focus-visible,
.route-option:focus-within {
  outline: 0;
  background: #edf5ff;
}

.option-number {
  min-width: 28px;
  height: auto;
  color: #7b8798;
  background: transparent;
  border-radius: 0;
  font-size: 12px;
}

.option-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.option-locate,
.option-icon-action {
  min-height: 36px;
}

.option-locate {
  min-width: 68px;
  padding: 0 9px;
  color: #2468b4;
}

.option-icon-action {
  width: 36px;
  min-width: 36px;
  padding: 0;
  color: #5b6f89;
  font-size: 16px;
}

.option-icon-action:hover {
  color: var(--brand);
  background: var(--brand-soft);
}

.option-icon-action.danger:hover {
  color: #e84646;
  background: var(--danger-soft);
}

@container (max-width: 860px) {
  .route-scroll {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 820px) {
  .route-bar {
    grid-template-columns: auto minmax(100px, 1fr) auto;
  }

  .route-toolbar {
    display: none;
  }

  .route-locate {
    width: 36px;
    padding: 0;
    font-size: 0;
  }
}
</style>
