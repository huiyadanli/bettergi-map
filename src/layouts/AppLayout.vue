<script setup>
/**
 * 编辑器工作区外壳。
 *
 * 左侧放地图，右侧放路线和点位面板，不拥有编辑状态。
 */
import {ref} from 'vue';

// 左侧地图栏初始像素宽度，对应原来的 45% 视口；Arco Sider 的 width 只接受数字
const siderWidth = ref(Math.floor(window.innerWidth * 0.45));
</script>

<template>
  <a-layout class="layout">
    <a-layout-sider :width="siderWidth" :resize-directions="['right']">
      <slot name="map"/>
    </a-layout-sider>
    <a-layout-content>
      <slot/>
    </a-layout-content>
  </a-layout>
</template>

<style scoped>
.layout {
  height: 100vh;
}

.arco-layout-sider {
  background: #fff;
}

.arco-layout-content {
  padding: 16px;
  background: #f0f2f5;
  overflow-y: auto;
}
</style>
