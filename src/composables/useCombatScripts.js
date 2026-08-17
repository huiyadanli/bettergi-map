/**
 * 战斗策略预设管理。
 *
 * 只维护本地策略列表和点位 action 默认值，不修改路线几何。
 */
import {saveLocal} from '../utils/storage';
import {COMBAT_SCRIPT_KEY} from '../constants/editor';
import {
  combatScriptData,
  showCombatScriptManagerModal,
  newActionParams,
} from '../stores/editor';

/**
 * 打开战斗策略管理弹窗。
 */
export function combatScriptManagerModal() {
  showCombatScriptManagerModal.value = true;
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
  } else {
    record.action_params = '';
  }
}

/**
 * 新增一条战斗策略，默认项互斥。
 */
export function addCombatScript() {
  const newActionParamsTemp = Object.assign({}, newActionParams.value);
  if (combatScriptData.value.find((item) => item.value === newActionParamsTemp.value)) {
    alert('不要重复添加！');
  } else {
    const temp = combatScriptData.value;
    if (newActionParamsTemp.def) {
      temp.forEach((item) => {
        item.def = false;
      });
    }
    newActionParams.value = {value: '', def: false};
    combatScriptData.value = [...temp, newActionParamsTemp];
    saveLocal(COMBAT_SCRIPT_KEY, combatScriptData.value);
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
