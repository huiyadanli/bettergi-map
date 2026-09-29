<script setup>
/**
 * 战斗策略管理弹窗。
 *
 * 只编辑本地策略列表；新增操作交给共享脚本编辑弹窗。
 */
import {combatScriptColumns} from '../constants/editor';
import {
  showCombatScriptManagerModal,
  combatScriptData,
} from '../stores/editor';
import {
  saveCombatScript,
  openCombatScriptPresetEditor,
  deleteCombatScriptPosition,
  changeCombatScriptDef,
} from '../composables/useCombatScripts';
</script>

<template>
  <a-modal
      v-model:visible="showCombatScriptManagerModal"
      title="战斗策略管理"
      @ok="saveCombatScript"
      @cancel="showCombatScriptManagerModal = false"
      width="50%" height="50%"
      hideCancel
      okText="关闭"
  >
    <a-space direction="vertical" size="large" fill>
      <a-card>
        <a-table :columns="combatScriptColumns" :data="combatScriptData" :pagination="false">
          <template #def="{ record, rowIndex }">
            <a-checkbox :value="true" v-model="record.def" @change="changeCombatScriptDef(rowIndex)"></a-checkbox>
          </template>
          <template #operations="{ rowIndex }">
            <a-button
                @click="deleteCombatScriptPosition(rowIndex)"
                status="danger"
                size="small"
            >
              删除
            </a-button>
          </template>
        </a-table>
        <template #extra>
          <a-button @click="openCombatScriptPresetEditor" type="primary" size="small" style="margin-left: 20px;">添加
          </a-button>
        </template>
      </a-card>
    </a-space>
  </a-modal>
</template>
