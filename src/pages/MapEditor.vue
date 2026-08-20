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
import {useEditorLifecycle} from '../composables/useEditorLifecycle';

useEditorLifecycle();
</script>

<template>
  <AppLayout>
    <template #map>
      <MapPane/>
    </template>
    <div class="editor-panels">
      <RouteListCard/>
      <PointTableCard/>
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
</style>
