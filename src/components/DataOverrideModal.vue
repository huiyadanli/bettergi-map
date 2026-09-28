<script setup>
/**
 * 点位数据覆盖弹窗。
 *
 * 从当前路线的其他点位选择数据源，并指定要覆盖的字段。
 */
import {computed, ref, watch} from 'vue';
import {actionOptionsTree, moveModeOptions, pointTypeOptions} from '../constants/editor';
import {
  dataOverrideTarget,
  selectedPolyline,
  showDataOverrideModal,
} from '../stores/editor';
import {applyDataOverride, closeDataOverrideModal} from '../composables/useDataOverride';
import ComfortSelect from './ComfortSelect.vue';

const sourceId = ref('');
const fields = ref(createDefaultFields());

const sourceOptions = computed(() => (selectedPolyline.value?.positions || [])
  .map((position) => ({
    value: position.id,
    label: formatPointSummary(position),
    position,
  }))
  .filter((item) => item.position !== dataOverrideTarget.value));

watch(showDataOverrideModal, (visible) => {
  if (!visible) return;
  sourceId.value = '';
  fields.value = createDefaultFields();
});

function createDefaultFields() {
  return {
    coordinate: true,
    type: true,
    moveMode: true,
    action: true,
  };
}

function formatPointSummary(position) {
  const type = pointTypeOptions.find((item) => item.value === position.type)?.label || position.type || '无类型';
  const moveMode = moveModeOptions.find((item) => item.value === position.move_mode)?.label
    || position.move_mode
    || '无移动方式';
  const actionOption = actionOptionsTree
    .flatMap((item) => item.children || [item])
    .find((item) => item.value === position.action);
  const action = position.action ? actionOption?.label || position.action : '无动作';
  return `#${position.id}（${type}，${moveMode}，${action}）`;
}

function confirmOverride() {
  return applyDataOverride(sourceId.value, fields.value);
}
</script>

<template>
  <a-modal
      v-model:visible="showDataOverrideModal"
      title="数据覆盖"
      width="min(520px, calc(100vw - 32px))"
      :on-before-ok="confirmOverride"
      @cancel="closeDataOverrideModal"
  >
    <a-form class="data-override-form" size="mini" :model="fields" auto-label-width>
      <a-form-item label="当前点位">
        <span class="data-override-target">
          {{ dataOverrideTarget ? formatPointSummary(dataOverrideTarget) : '—' }}
        </span>
      </a-form-item>
      <a-form-item label="数据源" required>
        <ComfortSelect
            v-model="sourceId"
            class="data-override-source"
            :options="sourceOptions"
            placeholder="请选择其他点位"
            aria-label="数据覆盖的数据源"
        />
      </a-form-item>
      <a-form-item label="覆盖内容" required>
        <a-space class="data-override-fields" wrap>
          <a-checkbox v-model="fields.coordinate">坐标</a-checkbox>
          <a-checkbox v-model="fields.type">类型</a-checkbox>
          <a-checkbox v-model="fields.moveMode">移动方式</a-checkbox>
          <a-checkbox v-model="fields.action">动作</a-checkbox>
        </a-space>
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<style scoped>
.data-override-form {
  padding-top: 4px;
}

.data-override-form :deep(.arco-form-item) {
  margin-bottom: 14px;
}

.data-override-form :deep(.arco-form-item-content),
.data-override-source {
  min-width: 0;
  width: 100%;
}

.data-override-target {
  color: var(--text-secondary);
  font-size: 13px;
}

.data-override-fields {
  min-height: 36px;
}

.data-override-form :deep(.arco-form-item:last-child) {
  margin-bottom: 0;
}

@media (max-width: 600px) {
  .data-override-form :deep(.arco-form-item) {
    display: block;
  }

  .data-override-form :deep(.arco-form-item-label) {
    width: auto !important;
    margin-bottom: 6px;
  }

  .data-override-form :deep(.arco-form-item-label-col) {
    justify-content: flex-start;
  }
}
</style>
