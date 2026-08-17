<script setup>
/**
 * 添加和修改点位坐标弹窗。
 *
 * 只收集 X/Y，写入逻辑在 useRoutes。
 */
import {
  showAddPointModal,
  showEditPointModal,
  newPointX,
  newPointY,
} from '../stores/editor';
import {handleAddPointFromModal, updatePointModal} from '../composables/useRoutes';
</script>

<template>
  <a-modal
      v-model:visible="showAddPointModal"
      title="添加新点位"
      @ok="handleAddPointFromModal"
      @cancel="showAddPointModal = false"
  >
    <a-form :model="{ x: newPointX, y: newPointY }">
      <a-form-item field="x" label="X坐标">
        <a-input-number v-model="newPointX" placeholder="请输入X坐标"/>
      </a-form-item>
      <a-form-item field="y" label="Y坐标">
        <a-input-number v-model="newPointY" placeholder="请输入Y坐标"/>
      </a-form-item>
    </a-form>
  </a-modal>
  <a-modal
      v-model:visible="showEditPointModal"
      title="修改点位坐标"
      @ok="updatePointModal"
      @cancel="showEditPointModal = false"
  >
    <a-form :model="{ x: newPointX, y: newPointY }">
      <a-form-item field="x" label="X坐标">
        <a-input-number v-model="newPointX" placeholder="请输入X坐标"/>
      </a-form-item>
      <a-form-item field="y" label="Y坐标">
        <a-input-number v-model="newPointY" placeholder="请输入Y坐标"/>
      </a-form-item>
    </a-form>
  </a-modal>
</template>
