<script setup>
/**
 * 点位扩展参数弹窗。
 *
 * 编辑怪物标签和异常识别策略。
 */
import {showPointExtConfig, pointExtParams} from '../stores/editor';
import {savePointExtParams} from '../composables/usePointExtParams';
import ComfortSelect from './ComfortSelect.vue';

const monsterTagOptions = [
  {value: 'normal', label: '小怪'},
  {value: 'elite', label: '精英'},
  {value: 'legendary', label: '传奇'},
];
const misidentificationTypeOptions = [
  {value: 'unrecognized', label: '未识别'},
  {value: 'pathTooFar', label: '路径过远'},
];
const handlingModeOptions = [
  {value: 'previousDetectedPoint', label: '取上一个识别到的点位置'},
  {value: 'mapRecognition', label: '大地图识别'},
  {value: 'scheduledArrival', label: '按特定时间到达'},
];
</script>

<template>
  <a-modal
      v-model:visible="showPointExtConfig"
      title="扩展参数"
      @ok="savePointExtParams"
      @cancel="showPointExtConfig = false"
      width="min(720px, calc(100vw - 32px))"
  >
    <a-form class="ext-params-form" size="mini" :model="pointExtParams" auto-label-width>
      <a-form-item label="怪物标签"
                   tooltip="为此点位打上标签，后续可能根据怪物种类决定是否拾取设置等逻辑。">
        <ComfortSelect
            v-model="pointExtParams.monster_tag"
            :options="monsterTagOptions"
            placeholder="请选择怪物标签"
            aria-label="怪物标签"
            clearable
        />
      </a-form-item>

      <a-divider orientation="left">异常识别</a-divider>

      <a-form-item field="misidentification.type" label="触发条件"
                   tooltip="当小地图特征点较少时，可能无法识别点位或识别到错误位置。可在这里选择需要兜底处理的情况。">
        <ComfortSelect
            v-model="pointExtParams.misidentification.type"
            :options="misidentificationTypeOptions"
            placeholder="请选择触发条件"
            aria-label="异常识别触发条件"
            clearable
            multiple
        />
      </a-form-item>

      <a-form-item field="misidentification.handling_mode" label="处理方式"
                   tooltip="取上一个识别点：使用上一次正确识别的位置。大地图识别：打开大地图读取中心点坐标。特定时间到达：按设定时间行进，不读取小地图坐标。">
        <ComfortSelect
            v-model="pointExtParams.misidentification.handling_mode"
            :options="handlingModeOptions"
            placeholder="请选择处理方式"
            aria-label="异常识别处理方式"
            clearable
        />
      </a-form-item>

      <a-form-item v-if="pointExtParams.misidentification.handling_mode === 'scheduledArrival'"
                   field="misidentification.arrival_time" label="到达时间">
        <a-input-number v-model="pointExtParams.misidentification.arrival_time"
                        placeholder="请输入毫秒数" :min="0" allow-clear/>
      </a-form-item>

      <a-form-item field="description" label="描述">
        <a-textarea v-model="pointExtParams.description" placeholder="请输入描述"
                    :auto-size="{ minRows: 3, maxRows: 5 }"/>
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<style scoped>
.ext-params-form {
  padding-top: 4px;
}

.ext-params-form :deep(.arco-form-item-content),
.ext-params-form :deep(.comfort-select),
.ext-params-form :deep(.arco-input-number),
.ext-params-form :deep(.arco-textarea-wrapper) {
  min-width: 0;
  width: 100%;
}

.ext-params-form :deep(.arco-form-item) {
  margin-bottom: 14px;
}

.ext-params-form :deep(.arco-divider) {
  margin: 12px 0 20px;
  color: var(--color-text-2);
  font-size: 13px;
}

.ext-params-form :deep(.arco-form-item:last-child) {
  margin-bottom: 0;
}

@media (max-width: 600px) {
  .ext-params-form :deep(.arco-form-item) {
    display: block;
  }

  .ext-params-form :deep(.arco-form-item-label) {
    width: auto !important;
    margin-bottom: 6px;
  }
}
</style>
