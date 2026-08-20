<script setup>
/**
 * 编辑器工作区外壳。
 *
 * 左侧放地图，右侧放路线和点位面板，不拥有编辑状态。
 */
import {ref} from 'vue';
import {map} from '../stores/editor';

// 左侧地图栏初始像素宽度，对应原来的 45% 视口；Arco Sider 的 width 只接受数字
const siderWidth = ref(Math.floor(window.innerWidth * 0.45));

function refreshMapSize() {
  requestAnimationFrame(() => {
    if (map.value?._loaded) map.value.invalidateSize();
  });
}

function handleSiderWidth(width) {
  siderWidth.value = width;
  refreshMapSize();
}
</script>

<template>
  <a-layout class="layout">
    <a-layout-sider
        class="map-sider"
        :width="siderWidth"
        :resize-directions="['right']"
        @update:width="handleSiderWidth"
        @moving="refreshMapSize"
    >
      <slot name="map"/>
    </a-layout-sider>
    <a-layout-content class="workspace-content">
      <slot/>
    </a-layout-content>
  </a-layout>
</template>

<style scoped>
.layout {
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

.map-sider::after {
  position: absolute;
  top: 0;
  right: -3px;
  bottom: 0;
  width: 5px;
  content: "";
  cursor: col-resize;
}

.workspace-content {
  min-width: 0;
  min-height: 0;
  padding: 16px;
  background: var(--app-bg);
  overflow: auto;
}

@media (max-width: 960px) {
  .workspace-content {
    padding: 12px;
  }
}
</style>
