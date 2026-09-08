<script setup>
/**
 * 路线其他设置弹窗。
 *
 * 编辑标签、怪物拾取区分和地图匹配方法。
 */
import {showCommonTagManager, otherConfig} from '../stores/editor';
import {saveCommonTagManagerModal, commonTagChange} from '../composables/useRouteSettings';
import ComfortSelect from './ComfortSelect.vue';

const mapMatchOptions = [
  {value: 'SIFT', label: '特征匹配'},
  {value: 'TemplateMatch', label: '模板匹配（支持分层地图）'},
];
</script>

<template>
  <a-modal
      v-model:visible="showCommonTagManager"
      title="其他设置"
      @ok="saveCommonTagManagerModal"
      @cancel="showCommonTagManager = false"
      width="min(600px, calc(100vw - 32px))"
      okText="保存"
      cancelText="关闭"
  >
    <a-form class="settings-form" size="mini" :model="otherConfig" auto-label-width>
      <a-form-item label="标签" tooltip="为此点位打上标签，可供js等筛选。">
        <a-input-tag v-model="otherConfig.commonTag" @change="commonTagChange"
                     placeholder="输入文本后按 Enter；包含逗号时会拆分为多个标签" allow-clear/>
      </a-form-item>
      <a-form-item label="区分怪物拾取"
                   tooltip="只有启用此配置，在调度中的只拾取精英配置才会生效，如果该脚本无精英怪，则无脑开启即可（和调度器配置同时开启后，没有标记精英的点位，将不再拾取）。">
        <a-checkbox :value="true" v-model="otherConfig.enableMonsterLootSplit"></a-checkbox>
      </a-form-item>
      <a-form-item label="地图匹配方法"
                   tooltip="选择地图匹配的方法，SIFT特征匹配适用于一般情况，TemplateMatch模板匹配支持分层地图。">
        <ComfortSelect
            v-model="otherConfig.mapMatchMethod"
            :options="mapMatchOptions"
            placeholder="请选择地图匹配方法"
            aria-label="地图匹配方法"
            clearable
        />
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<style scoped>
.settings-form {
  padding-top: 4px;
}

.settings-form :deep(.arco-input-tag),
.settings-form :deep(.comfort-select) {
  width: 100%;
}

.settings-form :deep(.arco-form-item-content) {
  min-width: 0;
}

.settings-form :deep(.arco-form-item:last-child) {
  margin-bottom: 0;
}

@media (max-width: 560px) {
  .settings-form :deep(.arco-form-item) {
    display: block;
  }

  .settings-form :deep(.arco-form-item-label) {
    width: auto !important;
    margin-bottom: 6px;
  }
}
</style>
