/**
 * 战斗策略预设管理。
 *
 * 只维护本地策略列表和点位 action 默认值，不修改路线几何。
 */
import {saveLocal} from '../utils/storage';
import {Message} from '@arco-design/web-vue';
import {COMBAT_SCRIPT_KEY} from '../constants/editor';
import {
  combatScriptData,
  showCombatScriptManagerModal,
  combatScriptEditorValue,
  combatScriptEditorMode,
  showCombatScriptEditorModal,
} from '../stores/editor';

let editingCombatScriptRecord = null;

/**
 * 打开战斗策略管理弹窗。
 */
export function combatScriptManagerModal() {
  showCombatScriptManagerModal.value = true;
}

/**
 * 用点位当前参数打开独立脚本编辑器。
 */
export function openCombatScriptEditor(record) {
  editingCombatScriptRecord = record;
  combatScriptEditorMode.value = 'point';
  combatScriptEditorValue.value = record?.action_params || '';
  showCombatScriptEditorModal.value = true;
}

/**
 * 使用同一个代码编辑弹窗新增策略预设。
 */
export function openCombatScriptPresetEditor() {
  editingCombatScriptRecord = null;
  combatScriptEditorMode.value = 'preset';
  combatScriptEditorValue.value = '';
  showCombatScriptEditorModal.value = true;
}

/**
 * 按弹窗用途保存脚本；新增的策略始终不是默认策略。
 */
export function saveCombatScriptEditor(value) {
  if (combatScriptEditorMode.value === 'preset') {
    if (combatScriptData.value.find((item) => item.value === value)) {
      Message.warning('该战斗策略已存在，请勿重复添加');
      return false;
    }
    combatScriptData.value = [...combatScriptData.value, {value, def: false}];
    saveLocal(COMBAT_SCRIPT_KEY, combatScriptData.value);
    return true;
  }

  if (editingCombatScriptRecord) editingCombatScriptRecord.action_params = value;
  return true;
}

/**
 * 关闭编辑器并释放当前点位引用。
 */
export function closeCombatScriptEditor() {
  showCombatScriptEditorModal.value = false;
  editingCombatScriptRecord = null;
}

/**
 * 关闭管理弹窗时的占位保存。
 *
 * 原逻辑把实际写入放在增删和改默认里，这里保持空实现。
 */
export function saveCombatScript() {
}

/**
 * 动作变更时落到叶子值，并给战斗策略填默认参数。
 */
export function actionChange(record) {
  if (Array.isArray(record.action)) {
    record.action = record.action[record.action.length - 1];
  }
  if (record.action === 'combat_script') {
    record.action_params = (combatScriptData.value.find((item) => item.def) || {}).value;
  } else if (record.action === 'use_gadget') {
    // BetterGI UseGadgetHandler 将该参数解释为最大等待冷却时间，单位秒。
    record.action_params = '100';
  } else {
    record.action_params = '';
  }
}

/**
 * 删除一条战斗策略。
 */
export function deleteCombatScriptPosition(index) {
  combatScriptData.value.splice(index, 1);
  saveLocal(COMBAT_SCRIPT_KEY, combatScriptData.value);
}

/**
 * 把指定行设为唯一默认策略。
 */
export function changeCombatScriptDef(rowindex) {
  if (combatScriptData.value[rowindex].def) {
    combatScriptData.value.forEach((item, index) => {
      if (index !== rowindex) {
        item.def = false;
      }
    });
  }
  saveLocal(COMBAT_SCRIPT_KEY, combatScriptData.value);
}
