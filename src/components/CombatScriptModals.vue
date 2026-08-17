<script setup>
/**
 * 战斗策略管理与新增弹窗。
 *
 * 只编辑本地策略列表，不改路线点位。
 */
import {combatScriptColumns} from '../constants/editor';
import {
  showCombatScriptManagerModal,
  showAddCombatScript,
  combatScriptData,
  newActionParams,
} from '../stores/editor';
import {
  saveCombatScript,
  addCombatScript,
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
          <a-button @click="showAddCombatScript = true" type="primary" size="small" style="margin-left: 20px;">添加
          </a-button>
        </template>
      </a-card>
    </a-space>
  </a-modal>
  <a-modal
      v-model:visible="showAddCombatScript"
      title="添加战斗策略"
      @ok="addCombatScript"
      @cancel="showAddCombatScript = false"
  >
    <a-form :model="newActionParams">
      <a-form-item label="策略参数">
        <a-input v-model="newActionParams.value" allow-clear/>
      </a-form-item>
      <a-form-item label="是否默认">
        <a-checkbox :value="true" v-model="newActionParams.def"></a-checkbox>
      </a-form-item>
    </a-form>
  </a-modal>
</template>
