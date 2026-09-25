<script setup>
/**
 * 地图路径编辑器页面。
 *
 * 编排工作区、路线面板和弹窗，会话启动由 useEditorLifecycle 完成。
 */
import AppLayout from '../layouts/AppLayout.vue';
import MapPane from '../components/MapPane.vue';
import RouteListCard from '../components/RouteListCard.vue';
import PointTableCard from '../components/PointTableCard.vue';
import FileSelectModal from '../components/FileSelectModal.vue';
import ExportModal from '../components/ExportModal.vue';
import AuthorSelectModal from '../components/AuthorSelectModal.vue';
import CombatScriptModals from '../components/CombatScriptModals.vue';
import PointExtParamsModal from '../components/PointExtParamsModal.vue';
import RouteSettingsModal from '../components/RouteSettingsModal.vue';
import PointCoordModals from '../components/PointCoordModals.vue';
import RouteMergeModal from '../components/RouteMergeModal.vue';
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue';
import {useEditorLifecycle} from '../composables/useEditorLifecycle';
import {loadLocal, saveLocal} from '../utils/storage';
import RouteList from "@/components/RouteList.vue";

// 路线列表的两种展示形态，二选一：常驻列表卡片 / 悬浮抽屉。
const listMode = ref(false);

// 已导入的路线数量由 RouteListCard 提供（v-model:route-count）。
const routeCount = ref(0);

// // 没有路线时不占用横向空间（退回悬浮抽屉）；导入出第一条路线后自动铺出常驻列表。
// watch(routeCount, (count, previousCount) => {
//   if (count === 0) {
//     listMode.value = false;
//     return;
//   }
//   if (previousCount === 0) listMode.value = true;
// }, {immediate: true});


// 左右拖动分隔条：列表卡片宽度
const LIST_WIDTH_KEY = '_routeListWidth';
const MIN_LIST_WIDTH = 220;
const MIN_TABLE_WIDTH = 420;
const RESIZER_HIT_WIDTH = 14;

const storedListWidth = readStoredWidth();
const listPanelWidth = ref(Number.isFinite(storedListWidth) ? storedListWidth : 360);
const editorMainElement = ref(null);
const listResizerElement = ref(null);
const isListResizing = ref(false);
const listResizeMax = ref(Number.MAX_SAFE_INTEGER);

const resizerStyle = computed(() => ({
  marginLeft: `${-RESIZER_HIT_WIDTH / 2}px`,
  marginRight: `${-RESIZER_HIT_WIDTH / 2}px`,
}));

let listResizeObserver = null;
let pointerGrabOffset = 0;
let previousBodyCursor = '';
let previousBodyUserSelect = '';

function getEditorMainElement() {
  return editorMainElement.value?.$el || editorMainElement.value;
}

// 存储被禁用（宿主 WebView 或隐私模式）时不值得让整个页面挂掉。
function readStoredWidth() {
  try {
    return loadLocal(LIST_WIDTH_KEY);
  } catch (error) {
    return null;
  }
}

function persistListWidth(value) {
  try {
    saveLocal(LIST_WIDTH_KEY, value);
  } catch (error) {
    // 忽略：宽度只是偏好，不写成功也不影响使用。
  }
}

function clampListWidth(width) {
  return Math.round(Math.min(listResizeMax.value, Math.max(MIN_LIST_WIDTH, width)));
}

function syncListResizeBounds() {
  const element = getEditorMainElement();
  if (!element) return;
  // 分隔条与表格左侧间距共 20px，其余留给点位表格。
  const max = Math.max(
      MIN_LIST_WIDTH,
      Math.floor(element.getBoundingClientRect().width - MIN_TABLE_WIDTH - 20),
  );
  listResizeMax.value = max;
  const next = clampListWidth(listPanelWidth.value);
  if (next !== listPanelWidth.value) listPanelWidth.value = next;
}

function startListResize(event) {
  if (event.button !== 0 || isListResizing.value) return;
  const left = getEditorMainElement()?.getBoundingClientRect().left || 0;
  pointerGrabOffset = event.clientX - left - listPanelWidth.value;
  isListResizing.value = true;
  listResizerElement.value?.setPointerCapture(event.pointerId);
  previousBodyCursor = document.body.style.cursor;
  previousBodyUserSelect = document.body.style.userSelect;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  window.addEventListener('pointermove', moveListResize);
  window.addEventListener('pointerup', stopListResize);
  window.addEventListener('pointercancel', stopListResize);
  window.addEventListener('blur', stopListResize);
  event.preventDefault();
}

function moveListResize(event) {
  if (!isListResizing.value) return;
  const left = getEditorMainElement()?.getBoundingClientRect().left || 0;
  listPanelWidth.value = clampListWidth(event.clientX - left - pointerGrabOffset);
}

function stopListResize(event = {}) {
  if (!isListResizing.value) return;
  isListResizing.value = false;
  if (typeof event.pointerId === 'number' && listResizerElement.value?.hasPointerCapture(event.pointerId)) {
    listResizerElement.value.releasePointerCapture(event.pointerId);
  }
  window.removeEventListener('pointermove', moveListResize);
  window.removeEventListener('pointerup', stopListResize);
  window.removeEventListener('pointercancel', stopListResize);
  window.removeEventListener('blur', stopListResize);
  document.body.style.cursor = previousBodyCursor;
  document.body.style.userSelect = previousBodyUserSelect;
}

function resizeListWithKeyboard(event) {
  const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
  if (!direction) return;
  listPanelWidth.value = clampListWidth(listPanelWidth.value + direction * (event.shiftKey ? 32 : 12));
  event.preventDefault();
}

watch(listPanelWidth, (value) => {
  persistListWidth(value);
});

onMounted(() => {
  nextTick(syncListResizeBounds);
  listResizeObserver = new ResizeObserver(syncListResizeBounds);
  const element = getEditorMainElement();
  if (element) listResizeObserver.observe(element);
});

onBeforeUnmount(() => {
  listResizeObserver?.disconnect();
  stopListResize();
});

useEditorLifecycle();
</script>

<template>
  <AppLayout>
    <template #map>
      <MapPane/>
    </template>
    <div class="editor-panels">
      <RouteListCard v-model:list-mode="listMode" v-model:route-count="routeCount"/>
      <div
          ref="editorMainElement"
          class="editor-main"
          :class="{'is-list-hidden': (!listMode || routeCount < 2)}"
      >
        <div v-if="listMode&&routeCount>1" class="route-list-panel" :style="{width: `${listPanelWidth}px`}">
          <RouteList/>
        </div>
        <div
            v-if="listMode&&routeCount>1"
            ref="listResizerElement"
            class="panel-resizer"
            :class="{'is-resizing': isListResizing}"
            :style="resizerStyle"
            role="separator"
            aria-label="调整路线列表与点位表格宽度"
            aria-orientation="vertical"
            :aria-valuemin="MIN_LIST_WIDTH"
            :aria-valuemax="listResizeMax"
            :aria-valuenow="listPanelWidth"
            tabindex="0"
            @pointerdown="startListResize"
            @lostpointercapture="stopListResize"
            @keydown="resizeListWithKeyboard"
        >
          <span class="panel-resizer-line" aria-hidden="true"/>
        </div>
        <PointTableCard class="point-table-panel"/>
      </div>
    </div>
  </AppLayout>
  <PointExtParamsModal/>
  <CombatScriptModals/>
  <RouteSettingsModal/>
  <PointCoordModals/>
  <RouteMergeModal/>
  <ExportModal/>
  <AuthorSelectModal/>
  <FileSelectModal/>
</template>

<style scoped>
.editor-panels {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  gap: 10px;
  min-height: 0;
}

.editor-main {
  display: grid;
  /* 显式定位 + 按“列表在不在”切换轨道数：
     列表在 = 列表 | 分隔条 | 表格；列表不在 = 表格独占一条轨道，
     此时不会残留空轨道和列间距，点位表格自然铺满整行。 */
  grid-template-columns: minmax(0, auto) minmax(0, auto) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  width: 100%;
  height: 100%;
  gap: 10px;
  min-width: 0;
  min-height: 0;
}

.editor-main.is-list-hidden {
  grid-template-columns: minmax(0, 1fr);
}

.editor-main > .route-list-panel {
  grid-column: 1;
  grid-row: 1;
  min-width: 280px;
}

.editor-main > .panel-resizer {
  grid-column: 2;
  grid-row: 1;
}

.editor-main > .point-table-panel {
  grid-column: 3;
  grid-row: 1;
  min-width: 0;
  min-height: 0;
}

/* 列表隐藏后点位表格接管第 1 列。 */
.editor-main.is-list-hidden > .point-table-panel {
  grid-column: 1;
}

.panel-resizer {
  position: relative;
  z-index: 4;
  align-self: stretch;
  min-width: 6px;
  touch-action: none;
  cursor: col-resize;
  outline: 0;
}

.panel-resizer-line {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  border-radius: 2px;
  background: transparent;
  transform: translateX(-50%);
  transition: background-color 120ms ease, box-shadow 120ms ease;
}

.panel-resizer:hover .panel-resizer-line,
.panel-resizer:focus-visible .panel-resizer-line,
.panel-resizer.is-resizing .panel-resizer-line {
  background: rgb(22 119 255 / 55%);
  box-shadow: 0 0 0 2px rgb(22 119 255 / 9%);
}

</style>
