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
import {useEditorLifecycle} from '../composables/useEditorLifecycle';

useEditorLifecycle();
</script>

<template>
  <AppLayout>
    <template #map>
      <MapPane/>
    </template>
    <a-space direction="vertical" size="large" fill>
      <RouteListCard/>
      <PointTableCard/>
    </a-space>
  </AppLayout>
  <PointExtParamsModal/>
  <CombatScriptModals/>
  <RouteSettingsModal/>
  <PointCoordModals/>
  <ExportModal/>
  <AuthorSelectModal/>
  <FileSelectModal/>
</template>
