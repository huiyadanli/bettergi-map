<script setup>
/**
 * 当前路线的点位表格。
 *
 * 负责点位编辑、运行、合并拆分和打开相关弹窗。
 */
import {actionOptionsTree} from '../constants/editor';
import {formatNumber} from '../utils/format';
import {
  columns,
  selectedPolyline,
  selectedPolylineIndex,
  selectedPointIndex,
  canUndo,
  canRedo,
  polylines,
  combatScriptData,
} from '../stores/editor';
import {
  handleChange,
  selectPoint,
  setPositionRowClass,
  updatePosition,
  deletePosition,
  moreSelect,
  copyPosition,
  lockRowIndex,
  unlockRowIndex,
  editPointModal,
  runFromPoint,
  clearSelection,
  clearPoints,
  mergedPolyline,
  splitPolyline,
  openAddPointModal,
} from '../composables/useRoutes';
import {undoStep, redoStep} from '../composables/useHistory';
import {actionChange, combatScriptManagerModal} from '../composables/useCombatScripts';
import {editPointExtParams, deletePointExtParams} from '../composables/usePointExtParams';
</script>

<template>
  <a-card :title="`点位信息 - ${selectedPolyline.name || '未选择路径'}`">
    <a-table
        :columns="columns"
        :data="selectedPolyline.positions"
        :pagination="false"
        :draggable="{ type: 'handle', width: 40 }"
        @change="handleChange"
        @row-click="selectPoint"
        :row-class="setPositionRowClass"
    >
      <template #drag-handle-icon>
        <icon-drag-dot-vertical/>
      </template>
      <template #play="{ rowIndex }">
        <a-tooltip content="从此处运行">
          <a-button type="text" size="mini" class="play-btn" @click="runFromPoint(rowIndex)">
            <icon-play-arrow/>
          </a-button>
        </a-tooltip>
      </template>
      <template #id="{ record }">
        <span :style="{color:(record.point_ext_params?'blue':'')}">{{ record.id }}</span>
      </template>
      <template #xy="{ record, rowIndex }">
        <div class="coord-cell" @click="editPointModal(record,rowIndex)">
          <span class="coord-x">{{ formatNumber(record.x) }}</span> <span class="coord-y">{{ formatNumber(record.y) }}</span>
        </div>
      </template>
      <template #x="{ record, rowIndex }">
        <a-input-number
            v-model="record.x"
            @change="(value) => updatePosition(selectedPolylineIndex, rowIndex, 'x', value)"
        />
      </template>
      <template #y="{ record, rowIndex }">
        <a-input-number
            v-model="record.y"
            @change="(value) => updatePosition(selectedPolylineIndex, rowIndex, 'y', value)"
        />
      </template>
      <template #move_mode="{ record }">
        <a-select v-model="record.move_mode">
          <a-option value="walk">行走</a-option>
          <a-option value="dash">间歇冲刺</a-option>
          <a-option value="run">持续奔跑</a-option>
          <a-option value="fly">飞行</a-option>
          <a-option value="swim">游泳</a-option>
          <a-option value="climb">攀爬</a-option>
          <a-option value="jump">跳跃</a-option>
        </a-select>
      </template>
      <template #action="{ record }">
        <a-cascader
            v-model="record.action"
            :options="actionOptionsTree"
            placeholder="请选择动作"
            @change="actionChange(record)"
            style="min-width: 100px"
            :field-names="{ label: 'label', value: 'value', children: 'children' }"
        />
        <a-input allow-clear v-if="record.action==='log_output'" v-model="record.action_params"
                 :disabled="record.type === 'teleport'" placeholder="录入需要输出的日志" strict/>
        <a-input allow-clear v-if="record.action==='stop_flying'" v-model="record.action_params"
                 placeholder="录入下落攻击等待时间(毫秒)" strict/>
        <a-input allow-clear v-if="record.action==='set_time'" v-model="record.action_params"
                 placeholder="录入需要设置的时间 HH:MM" strict/>
        <a-input allow-clear v-if="record.action==='linnea_mining'" v-model="record.action_params"
                 placeholder="射箭次数,旋转寻矿次数 默认1,5" strict/>
        <a-auto-complete allow-clear :data="combatScriptData" v-if="record.action==='combat_script'"
                         v-model="record.action_params" placeholder="录入或清空后选择策略" strict/>
      </template>
      <template #type="{ record }">
        <a-select v-model="record.type">
          <a-option value="teleport">传送</a-option>
          <a-option value="path">途经</a-option>
          <a-option value="target">目标</a-option>
          <a-option value="orientation">朝向</a-option>
        </a-select>
      </template>
      <template #operations="{ record, rowIndex }">
        <a-button
            @click="deletePosition(rowIndex)"
            status="danger"
            size="small"
        >
          删除
        </a-button>
        <a-dropdown @select="moreSelect">
          <a-button style="margin-left: 10px" status="success">更多</a-button>
          <template #content>
            <a-doption :value="{ onclick: copyPosition,record,rowIndex}">复制</a-doption>
            <a-doption :value="{ onclick: editPointExtParams,record,rowIndex}">
              {{ (record.point_ext_params ? "修改" : "新增") + "扩展参数" }}
            </a-doption>
            <a-doption :value="{ onclick: deletePointExtParams,record,rowIndex}" v-if="record.point_ext_params">
              清除扩展参数
            </a-doption>
            <a-doption :value="{ onclick: lockRowIndex,record,rowIndex}" v-if="!record.locked">锁定行</a-doption>
            <a-doption :value="{ onclick: unlockRowIndex,record,rowIndex}" v-if="record.locked">解锁行</a-doption>
          </template>
        </a-dropdown>
        <span style="color:red" v-if="record.locked">↑↑↑</span>
      </template>
    </a-table>

    <template #extra>
      <a-tooltip content="撤销 (Ctrl+Z)">
        <a-button @click="undoStep" :disabled="!canUndo" type="text" size="small">
          <icon-undo/>
        </a-button>
      </a-tooltip>
      <a-tooltip content="前进 (Ctrl+Shift+Z)">
        <a-button @click="redoStep" :disabled="!canRedo" type="text" size="small">
          <icon-redo/>
        </a-button>
      </a-tooltip>
      <a-button @click="clearSelection" :disabled="selectedPointIndex === -1" type="primary" size="small">取消选中</a-button>
      <a-button @click="clearPoints" type="primary" style="margin-left: 20px;" size="small">清空</a-button>
      <a-popconfirm content="是否确认合并！" @ok="mergedPolyline" okText="确认" cancelText="关闭">
        <a-button type="primary" style="margin-left: 20px;" size="small" v-if="polylines.length > 1">合并
        </a-button>
      </a-popconfirm>
      <a-popconfirm content="是否确认按传送点进行拆分！" @ok="splitPolyline" okText="确认" cancelText="关闭">
        <a-button type="primary" style="margin-left: 20px;" size="small"
                  v-if="polylines.length == 1  && polylines[selectedPolylineIndex].positions.filter(item=>item.type=='teleport').length>1">
          拆分
        </a-button>
      </a-popconfirm>
      <a-button @click="combatScriptManagerModal" type="primary" style="margin-left: 20px;" size="small">
        战斗策略管理
      </a-button>
      <a-button @click="openAddPointModal" type="primary" size="small" style="margin-left: 20px;">添加点位
      </a-button>
    </template>
  </a-card>
</template>

<style scoped>
:deep(.arco-table-tr.locked td) {
  border-top: 2px red solid;
}

:deep(.arco-table-tr.selected-row td) {
  background-color: #e4edff;
}

:deep(.arco-table-hover:not(.arco-table-dragging) .arco-table-tr:not(.arco-table-tr-empty):not(.arco-table-tr-summary):hover .arco-table-td) {
  background-color: #e4edff !important;
}

:deep(.arco-table-tr) {
  cursor: pointer;
}

.arco-table-tr-active {
  background-color: #e6f7ff;
}

:deep(.arco-table .arco-table-cell) {
  padding: 8px 8px !important;
}
</style>
