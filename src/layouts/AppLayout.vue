<script setup>
/**
 * 编辑器工作区外壳。
 *
 * 左侧放地图，右侧放路线和点位面板，不拥有编辑状态。
 */
import {computed, nextTick, onBeforeUnmount, onMounted, ref} from 'vue';
import {map} from '../stores/editor';

// 左侧地图栏初始像素宽度，对应原来的 45% 视口；Arco Sider 的 width 只接受数字
const siderWidth = ref(Math.floor(window.innerWidth * 0.45));
const layoutElement = ref(null);
const resizerElement = ref(null);
const isResizing = ref(false);

const RESIZER_HIT_WIDTH = 14;
const MIN_MAP_WIDTH = 280;
const MIN_WORKSPACE_WIDTH = 420;

const resizerMax = ref(Math.max(MIN_MAP_WIDTH, window.innerWidth - MIN_WORKSPACE_WIDTH));
const resizerStyle = computed(() => ({
  left: `${siderWidth.value - RESIZER_HIT_WIDTH / 2}px`,
}));

let resizeObserver = null;
let mapResizeFrame = 0;
let pointerGrabOffset = 0;
let previousBodyCursor = '';
let previousBodyUserSelect = '';

function getLayoutElement() {
  return layoutElement.value?.$el || layoutElement.value;
}

function refreshMapSize() {
  if (mapResizeFrame) return;
  mapResizeFrame = requestAnimationFrame(() => {
    mapResizeFrame = 0;
    if (map.value?._loaded) {
      map.value.invalidateSize({pan: false, animate: false});
    }
  });
}

function clampSiderWidth(width) {
  return Math.round(Math.min(resizerMax.value, Math.max(MIN_MAP_WIDTH, width)));
}

function syncResizeBounds() {
  const layoutWidth = getLayoutElement()?.getBoundingClientRect().width || window.innerWidth;
  resizerMax.value = Math.max(MIN_MAP_WIDTH, Math.floor(layoutWidth - MIN_WORKSPACE_WIDTH));
  const nextWidth = clampSiderWidth(siderWidth.value);
  if (nextWidth !== siderWidth.value) siderWidth.value = nextWidth;
  refreshMapSize();
}

function startResize(event) {
  if (event.button !== 0 || isResizing.value) return;
  const layoutLeft = getLayoutElement()?.getBoundingClientRect().left || 0;
  pointerGrabOffset = event.clientX - layoutLeft - siderWidth.value;
  isResizing.value = true;
  resizerElement.value?.setPointerCapture(event.pointerId);
  previousBodyCursor = document.body.style.cursor;
  previousBodyUserSelect = document.body.style.userSelect;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  window.addEventListener('pointermove', moveResize);
  window.addEventListener('pointerup', stopResize);
  window.addEventListener('pointercancel', stopResize);
  window.addEventListener('mousemove', moveResize);
  window.addEventListener('mouseup', stopResize);
  window.addEventListener('blur', stopResize);
  event.preventDefault();
}

function moveResize(event) {
  if (!isResizing.value) return;
  const layoutLeft = getLayoutElement()?.getBoundingClientRect().left || 0;
  siderWidth.value = clampSiderWidth(event.clientX - layoutLeft - pointerGrabOffset);
  refreshMapSize();
}

function stopResize(event = {}) {
  if (!isResizing.value) return;
  isResizing.value = false;
  if (typeof event.pointerId === 'number' && resizerElement.value?.hasPointerCapture(event.pointerId)) {
    resizerElement.value.releasePointerCapture(event.pointerId);
  }
  window.removeEventListener('pointermove', moveResize);
  window.removeEventListener('pointerup', stopResize);
  window.removeEventListener('pointercancel', stopResize);
  window.removeEventListener('mousemove', moveResize);
  window.removeEventListener('mouseup', stopResize);
  window.removeEventListener('blur', stopResize);
  document.body.style.cursor = previousBodyCursor;
  document.body.style.userSelect = previousBodyUserSelect;
  refreshMapSize();
}

function resizeWithKeyboard(event) {
  const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
  if (!direction) return;
  siderWidth.value = clampSiderWidth(siderWidth.value + direction * (event.shiftKey ? 32 : 12));
  refreshMapSize();
  event.preventDefault();
}

onMounted(() => {
  nextTick(syncResizeBounds);
  resizeObserver = new ResizeObserver(syncResizeBounds);
  const element = getLayoutElement();
  if (element) resizeObserver.observe(element);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  if (mapResizeFrame) cancelAnimationFrame(mapResizeFrame);
  stopResize();
});
</script>

<template>
  <a-layout ref="layoutElement" class="layout">
    <a-layout-sider
        class="map-sider"
        :width="siderWidth"
    >
      <slot name="map"/>
    </a-layout-sider>
    <div
        ref="resizerElement"
        class="map-resizer"
        :class="{'is-resizing': isResizing}"
        :style="resizerStyle"
        role="separator"
        aria-label="调整地图与工作区宽度"
        aria-orientation="vertical"
        :aria-valuemin="MIN_MAP_WIDTH"
        :aria-valuemax="resizerMax"
        :aria-valuenow="siderWidth"
        tabindex="0"
        @pointerdown="startResize"
        @lostpointercapture="stopResize"
        @keydown="resizeWithKeyboard"
    >
      <span class="map-resizer-line" aria-hidden="true"/>
    </div>
    <a-layout-content class="workspace-content">
      <slot/>
    </a-layout-content>
  </a-layout>
</template>

<style scoped>
.layout {
  position: relative;
  height: 100vh;
  height: 100dvh;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.map-sider {
  position: relative;
  min-width: 0;
  overflow: visible;
  background: #fff;
  border-right: 1px solid #dfe5ee;
  box-shadow: 4px 0 18px rgb(31 35 41 / 6%);
  z-index: 2;
}

.map-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 6;
  width: 14px;
  touch-action: none;
  cursor: col-resize;
  outline: 0;
}

.map-resizer-line {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  background: transparent;
  transform: translateX(-50%);
  transition: background-color 120ms ease, box-shadow 120ms ease;
}

.map-resizer:hover .map-resizer-line,
.map-resizer:focus-visible .map-resizer-line,
.map-resizer.is-resizing .map-resizer-line {
  background: rgb(22 119 255 / 55%);
  box-shadow: 0 0 0 2px rgb(22 119 255 / 9%);
}

.workspace-content {
  display: flex;
  min-width: 0;
  min-height: 0;
  padding: 16px;
  background: var(--app-bg);
  overflow: hidden;
}

@media (max-width: 960px) {
  .workspace-content {
    padding: 12px;
  }
}
</style>
