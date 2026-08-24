<script setup>
/**
 * 当前路线的点位表格。
 *
 * 负责点位编辑、运行、合并拆分和打开相关弹窗。
 */
import {nextTick, onBeforeUnmount, onMounted, ref} from 'vue';
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
  showRouteMergeModal,
} from '../stores/editor';
import {
  handleChange,
  selectPoint,
  setPositionRowClass,
  updatePosition,
  deletePosition,
  copyPosition,
  moreSelect,
  lockRowIndex,
  unlockRowIndex,
  editPointModal,
  runFromPoint,
  clearSelection,
  clearPoints,
  splitPolyline,
  openAddPointModal,
} from '../composables/useRoutes';
import {undoStep, redoStep} from '../composables/useHistory';
import {actionChange, combatScriptManagerModal} from '../composables/useCombatScripts';
import {editPointExtParams, deletePointExtParams} from '../composables/usePointExtParams';

const tableWrapElement = ref(null);
const tableBodyHeight = ref(240);
let tableResizeObserver = null;

function syncTableBodyHeight() {
  const wrap = tableWrapElement.value;
  if (!wrap) return;
  const header = wrap.querySelector('.arco-table-header');
  const headerHeight = header?.getBoundingClientRect().height || 41;
  const nextHeight = Math.max(120, Math.floor(wrap.clientHeight - headerHeight - 2));
  if (tableBodyHeight.value !== nextHeight) tableBodyHeight.value = nextHeight;
}

onMounted(() => {
  nextTick(() => {
    syncTableBodyHeight();
    tableResizeObserver = new ResizeObserver(syncTableBodyHeight);
    if (tableWrapElement.value) tableResizeObserver.observe(tableWrapElement.value);
  });
});

onBeforeUnmount(() => tableResizeObserver?.disconnect());

function handleRowClick(record, event) {
  const target = event?.target;
  if (target instanceof Element && target.closest(
    'button, input, textarea, [role="button"], .arco-trigger, .arco-select, .arco-input-wrapper, .arco-cascader',
  )) return;
  selectPoint(record);
}
</script>

<template>
  <a-card class="point-table-card" :bordered="false">
    <template #title>
      <div class="section-heading">
        <span class="section-heading-main">点位编辑</span>
      </div>
    </template>

    <template #extra>
      <div class="point-header-actions">
        <a-button @click="openAddPointModal" type="primary" size="small">
          <template #icon><icon-plus/></template>
          添加点位
        </a-button>
        <a-button @click="combatScriptManagerModal" type="secondary" size="small">
          <template #icon><icon-code-block/></template>
          战斗策略
        </a-button>
        <a-tooltip content="撤销（Ctrl+Z）">
          <a-button
              @click="undoStep"
              :disabled="!canUndo"
              type="text"
              size="small"
              aria-label="撤销"
          >
            <template #icon><icon-undo/></template>
          </a-button>
        </a-tooltip>
        <a-tooltip content="重做（Ctrl+Shift+Z）">
          <a-button
              @click="redoStep"
              :disabled="!canRedo"
              type="text"
              size="small"
              aria-label="重做"
          >
            <template #icon><icon-redo/></template>
          </a-button>
        </a-tooltip>
        <a-button
            v-if="selectedPointIndex !== -1"
            @click="clearSelection"
            type="text"
            size="small"
        >
          取消选中
        </a-button>
        <a-button @click="clearPoints" :disabled="!polylines.length" status="danger" type="text" size="small">
          <template #icon><icon-delete/></template>
          清空
        </a-button>
        <a-button v-if="polylines.length > 1" @click="showRouteMergeModal = true" type="text" size="small">
          <template #icon><icon-swap/></template>
          合并路线
        </a-button>
        <a-popconfirm
            v-if="polylines.length === 1 && selectedPolyline.positions.filter(item => item.type === 'teleport').length > 1"
            content="确定按传送点拆分当前路线吗？"
            @ok="splitPolyline"
            okText="确认拆分"
            cancelText="取消"
        >
          <a-button type="text" size="small">
            <template #icon><icon-unordered-list/></template>
            拆分
          </a-button>
        </a-popconfirm>
      </div>
    </template>

    <div ref="tableWrapElement" class="table-wrap">
      <a-table
          :columns="columns"
          :data="selectedPolyline.positions"
          :pagination="false"
          :scroll="{ x: 900, y: tableBodyHeight }"
          :sticky-header="true"
          size="small"
          :draggable="{ type: 'row' }"
          @change="handleChange"
          @row-click="handleRowClick"
          :row-class="setPositionRowClass"
      >
        <template #play="{ rowIndex }">
          <a-tooltip content="从此处运行">
            <a-button type="text" size="small" class="play-btn" aria-label="从此处运行" @click.stop="runFromPoint(rowIndex)">
              <template #icon><icon-play-arrow/></template>
            </a-button>
          </a-tooltip>
        </template>
        <template #id="{ record }">
          <a-tooltip v-if="record.point_ext_params" content="已配置扩展参数">
            <span class="point-id has-extension">
              {{ record.id }}<icon-info-circle/>
            </span>
          </a-tooltip>
          <span v-else class="point-id">{{ record.id }}</span>
        </template>
        <template #xy="{ record, rowIndex }">
          <button
              type="button"
              class="coord-cell"
              :aria-label="`编辑第 ${rowIndex + 1} 个点位坐标`"
              @click.stop="editPointModal(record, rowIndex)"
          >
            <span class="coord-line coord-x"><small>X</small><strong>{{ formatNumber(record.x) }}</strong></span>
            <span class="coord-line coord-y"><small>Y</small><strong>{{ formatNumber(record.y) }}</strong></span>
          </button>
        </template>
        <template #x="{ record, rowIndex }">
          <a-input-number
              v-model="record.x"
              @click.stop
              @change="(value) => updatePosition(selectedPolylineIndex, rowIndex, 'x', value)"
          />
        </template>
        <template #y="{ record, rowIndex }">
          <a-input-number
              v-model="record.y"
              @click.stop
              @change="(value) => updatePosition(selectedPolylineIndex, rowIndex, 'y', value)"
          />
        </template>
        <template #move_mode="{ record }">
          <a-select v-model="record.move_mode" @click.stop>
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
          <div class="action-cell" @click.stop>
            <a-cascader
                v-model="record.action"
                :options="actionOptionsTree"
                placeholder="请选择动作"
                @change="actionChange(record)"
                :field-names="{ label: 'label', value: 'value', children: 'children' }"
            />
            <a-input allow-clear v-if="record.action === 'log_output'" v-model="record.action_params"
                     :disabled="record.type === 'teleport'" placeholder="录入需要输出的日志"/>
            <a-input allow-clear v-if="record.action === 'stop_flying'" v-model="record.action_params"
                     placeholder="下落攻击等待时间（毫秒）"/>
            <a-input allow-clear v-if="record.action === 'set_time'" v-model="record.action_params"
                     placeholder="设置时间 HH:MM"/>
            <a-input allow-clear v-if="record.action === 'linnea_mining'" v-model="record.action_params"
                     placeholder="射箭次数，旋转寻矿次数"/>
            <a-auto-complete allow-clear :data="combatScriptData" v-if="record.action === 'combat_script'"
                             v-model="record.action_params" placeholder="录入或选择策略"/>
          </div>
        </template>
        <template #type="{ record }">
          <a-select v-model="record.type" @click.stop>
            <a-option value="teleport">传送</a-option>
            <a-option value="path">途经</a-option>
            <a-option value="target">目标</a-option>
            <a-option value="orientation">朝向</a-option>
          </a-select>
        </template>
        <template #operations="{ record, rowIndex }">
          <div class="row-actions" @click.stop>
            <a-popconfirm
                :content="`确定删除第 ${rowIndex + 1} 个点位吗？`"
                okText="删除"
                cancelText="取消"
                @ok="deletePosition(rowIndex)"
            >
              <a-button class="row-icon-button danger" type="text" status="danger" size="small" aria-label="删除点位">
                <template #icon><icon-delete/></template>
              </a-button>
            </a-popconfirm>
            <a-dropdown @select="moreSelect">
              <a-button class="row-icon-button" type="text" size="small" aria-label="更多点位操作">
                <template #icon><icon-more-vertical/></template>
              </a-button>
              <template #content>
                <a-doption :value="{ onclick: copyPosition, record, rowIndex }">复制点位</a-doption>
                <a-doption :value="{ onclick: editPointExtParams, record, rowIndex }">
                  {{ record.point_ext_params ? '修改扩展参数' : '新增扩展参数' }}
                </a-doption>
                <a-doption v-if="record.point_ext_params" :value="{ onclick: deletePointExtParams, record, rowIndex }">
                  清除扩展参数
                </a-doption>
                <a-doption v-if="!record.locked" :value="{ onclick: lockRowIndex, record, rowIndex }">锁定插入位置</a-doption>
                <a-doption v-else :value="{ onclick: unlockRowIndex, record, rowIndex }">解除锁定</a-doption>
              </template>
            </a-dropdown>
            <a-tooltip v-if="record.locked" content="已锁定：新点位会插入到此处">
              <icon-lock class="locked-icon"/>
            </a-tooltip>
          </div>
        </template>
        <template #empty>
          <div class="table-empty">
            <icon-location class="table-empty-icon"/>
            <strong>{{ polylines.length ? '当前路线还没有点位' : '请先选择一条路线' }}</strong>
            <span>{{ polylines.length ? '可以在地图绘制，或点击“添加点位”输入坐标' : '导入路线后即可开始编辑点位' }}</span>
            <a-button v-if="polylines.length" @click="openAddPointModal" type="primary" size="small">
              <template #icon><icon-plus/></template>
              添加第一个点位
            </a-button>
          </div>
        </template>
      </a-table>
    </div>
  </a-card>
</template>

<style scoped>
.point-table-card {
  position: relative;
  z-index: 0;
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.point-table-card :deep(.arco-card-body) {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.point-table-card :deep(.arco-card-header) {
  height: 48px;
  min-height: 48px;
  padding: 0 14px;
  background: linear-gradient(100deg, #f1f6ff 0%, #ffffff 72%);
}

.point-table-card :deep(.arco-card-header-title),
.point-table-card :deep(.arco-card-header-extra) {
  height: 100%;
}

.point-table-card :deep(.arco-card-header-title) {
  display: flex;
  align-items: center;
}

.point-header-actions {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  justify-content: flex-end;
  height: 100%;
  gap: 4px;
}

.point-header-actions :deep(.arco-btn) {
  min-height: 36px;
  height: 36px;
  padding-right: 12px;
  padding-left: 12px;
  transition: color 130ms ease, background-color 130ms ease, transform 100ms ease;
}

.point-header-actions :deep(.arco-btn-only-icon) {
  width: 36px;
  padding: 0;
}

.point-header-actions :deep(.arco-btn-text:not(.arco-btn-disabled):hover) {
  color: var(--brand);
  background: var(--brand-soft);
}

.point-header-actions :deep(.arco-btn-status-danger:not(.arco-btn-disabled):hover) {
  color: #e84646;
  background: var(--danger-soft);
}

.point-header-actions :deep(.arco-btn:not(.arco-btn-disabled):active) {
  transform: scale(0.95);
}

.table-wrap {
  flex: 1 1 0;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid #edf1f6;
  border-radius: var(--radius-md);
  background: #f7faff;
}

.table-wrap :deep(.arco-table-container) {
  border: 0;
}

.table-wrap :deep(.arco-table-th) {
  padding: 0 !important;
  color: #3f5570;
  background: #deebfa;
  font-size: 13px;
  font-weight: 650;
}

.table-wrap :deep(.arco-table-td) {
  padding: 0 !important;
  background: #fff;
}

.table-wrap :deep(.arco-table-th .arco-table-cell) {
  display: flex;
  align-items: center;
  min-height: 40px;
  padding: 0 8px;
  white-space: nowrap;
}

.table-wrap :deep(.arco-table-td .arco-table-cell) {
  padding: 5px 8px;
}

.table-wrap :deep(.arco-table-td-content),
.table-wrap :deep(.arco-table-td-content > .arco-select),
.table-wrap :deep(.arco-table-td-content > .arco-cascader) {
  width: 100%;
  min-width: 0;
}

.table-wrap :deep(.arco-table-tbody .arco-table-tr:nth-child(even) .arco-table-td) {
  background: #fbfdff;
}

.table-wrap :deep(.arco-table-tr:hover .arco-table-td) {
  background: #f7fbff;
}

.table-wrap :deep(.arco-table-tr-draggable) {
  cursor: grab;
}

.table-wrap :deep(.arco-table-tr-draggable:active),
.table-wrap :deep(.arco-table-tr-drag) {
  cursor: grabbing;
}

.table-wrap :deep(.arco-table-tr-draggable input),
.table-wrap :deep(.arco-table-tr-draggable textarea) {
  cursor: text;
}

.table-wrap :deep(.arco-table-tr-draggable button:not(:disabled)),
.table-wrap :deep(.arco-table-tr-draggable .arco-select:not(.arco-select-disabled)),
.table-wrap :deep(.arco-table-tr-draggable .arco-cascader:not(.arco-cascader-disabled)) {
  cursor: pointer;
}

.table-wrap :deep(.arco-table-tr.selected-row .arco-table-td) {
  background: #dcecff;
}

.point-id {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 28px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.point-id.has-extension {
  color: var(--brand);
}

.coord-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0;
  width: 100%;
  padding: 0;
  border: 0;
  color: var(--text-primary);
  background: transparent;
  cursor: pointer;
  font-variant-numeric: tabular-nums;
  line-height: 1.28;
  text-align: left;
}

.coord-cell span {
  white-space: nowrap;
}

.coord-cell small {
  display: inline-block;
  width: 14px;
  margin-right: 3px;
  font-size: 10px;
  font-weight: 600;
}

.coord-line {
  font-weight: 600;
  letter-spacing: 0.01em;
}

.coord-cell .coord-x {
  color: #2468b4;
}

.coord-cell .coord-y {
  color: #12805c;
}

.coord-line strong {
  font-weight: 600;
}

.coord-cell:hover .coord-x {
  color: #135598;
}

.coord-cell:hover .coord-y {
  color: #096c4c;
}

.action-cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 230px;
}

.action-cell :deep(.arco-input-wrapper),
.action-cell :deep(.arco-select-view),
.action-cell :deep(.arco-cascader) {
  width: 100%;
}

.table-wrap :deep(.arco-input-wrapper),
.table-wrap :deep(.arco-select-view-single) {
  min-height: 28px;
  height: 28px;
}

.row-actions {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 5px;
}

.row-icon-button {
  width: 36px;
  min-width: 36px;
  min-height: 34px;
  height: 34px;
  padding: 0;
  color: var(--text-secondary);
  font-size: 17px;
}

.row-icon-button:hover {
  color: var(--brand);
  background: var(--brand-soft);
}

.row-icon-button.danger:hover {
  color: #f53f3f;
  background: var(--danger-soft);
}

.locked-icon {
  color: #ff7d00;
  font-size: 14px;
}

.play-btn {
  width: 36px;
  min-width: 36px;
  min-height: 36px;
  height: 36px;
  padding: 0 !important;
  color: var(--brand);
  font-size: 17px !important;
}

.table-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 48px 16px;
  color: var(--text-secondary);
}

.table-empty strong {
  color: var(--text-primary);
  font-size: 14px;
}

.table-empty span {
  font-size: 12px;
}

.table-empty-icon {
  margin-bottom: 2px;
  color: #b8c4d6;
  font-size: 28px;
}

@media (max-width: 720px) {
  .point-header-actions {
    justify-content: flex-start;
  }
}
</style>
