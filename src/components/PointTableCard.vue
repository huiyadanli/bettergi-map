<script setup>
/**
 * 当前路线的点位表格。
 *
 * 负责点位编辑、运行、合并拆分和打开相关弹窗。
 */
import {nextTick, onBeforeUnmount, onMounted, ref} from 'vue';
import {actionOptionsTree, COORDINATE_PRECISION, normalizeCoordinate} from '../constants/editor';
import ComfortSelect from './ComfortSelect.vue';
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
  handleChange as applyTableChange,
  selectPoint,
  setPositionRowClass,
  updatePosition,
  deletePosition,
  copyPosition,
  moreSelect,
  lockRowIndex,
  unlockRowIndex,
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
let mouseDrag = null;
let suppressRowClickUntil = 0;
let previousBodyCursor = '';
let previousBodyUserSelect = '';

const moveModeOptions = [
  {value: 'walk', label: '行走'},
  {value: 'dash', label: '间歇冲刺'},
  {value: 'run', label: '持续奔跑'},
  {value: 'fly', label: '飞行'},
  {value: 'swim', label: '游泳'},
  {value: 'climb', label: '攀爬'},
  {value: 'jump', label: '跳跃'},
];
const pointTypeOptions = [
  {value: 'teleport', label: '传送'},
  {value: 'path', label: '途经'},
  {value: 'target', label: '目标'},
  {value: 'orientation', label: '朝向'},
];

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

onBeforeUnmount(() => {
  tableResizeObserver?.disconnect();
  finishMouseDrag(false);
});

function handleRowClick(record, event) {
  if (performance.now() < suppressRowClickUntil) return;
  const target = event?.target;
  if (target instanceof Element && target.closest(
    'button, input, textarea, [role="button"], [role="combobox"], .arco-trigger, .arco-input-wrapper',
  )) return;
  selectPoint(record);
}

function handleCoordinateChange(record, rowIndex, key, value) {
  const coordinate = Number(value);
  if (!Number.isFinite(coordinate)) return;
  const normalizedCoordinate = normalizeCoordinate(coordinate);
  updatePosition(selectedPolylineIndex.value, rowIndex, key, normalizedCoordinate);
  if (selectedPointIndex.value === rowIndex) selectPoint(record);
}

function gadgetWaitValue(actionParams) {
  if (actionParams === '' || actionParams == null) return undefined;
  if (String(actionParams).toLowerCase().includes('not_wait')) return 0;
  const seconds = Number(actionParams);
  return Number.isFinite(seconds) ? seconds : undefined;
}

function handleGadgetWaitChange(record, value) {
  if (value === '' || value == null) {
    record.action_params = '';
    return;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds)) record.action_params = String(seconds);
}

function tableRows() {
  if (!tableWrapElement.value) return [];
  return [...tableWrapElement.value.querySelectorAll('tbody > .arco-table-tr.point-row')];
}

function clearDragPreview() {
  tableRows().forEach((row) => {
    row.style.removeProperty('--drag-shift');
    row.classList.remove('is-drag-source');
  });
}

function handleTableMouseDown(event) {
  if (event.button !== 0 || mouseDrag) return;
  const rows = tableRows();
  const target = event.target instanceof Element ? event.target : null;
  const row = target?.closest('.arco-table-tr') || null;
  const cell = target?.closest('.arco-table-td') || null;
  const cellIndex = row && cell ? [...row.children].indexOf(cell) : -1;
  const isInteractive = Boolean(target?.closest('button, input, textarea, [role="button"], [role="combobox"]'));
  const sourceIndex = rows.indexOf(row);
  if (sourceIndex < 0 || cellIndex < 0 || cellIndex >= 2 || isInteractive) return;

  mouseDrag = {
    sourceIndex,
    targetIndex: sourceIndex,
    startY: event.clientY,
    rowHeight: row.getBoundingClientRect().height,
    active: false,
  };
  window.addEventListener('mousemove', handleTableMouseMove);
  window.addEventListener('mouseup', handleTableMouseUp);
  window.addEventListener('blur', handleTableMouseCancel);
}

function activateMouseDrag() {
  if (!mouseDrag || mouseDrag.active) return;
  mouseDrag.active = true;
  previousBodyCursor = document.body.style.cursor;
  previousBodyUserSelect = document.body.style.userSelect;
  document.body.style.cursor = 'grabbing';
  document.body.style.userSelect = 'none';
  tableRows()[mouseDrag.sourceIndex]?.classList.add('is-drag-source');
}

function handleTableMouseMove(event) {
  if (!mouseDrag) return;
  const deltaY = event.clientY - mouseDrag.startY;
  if (!mouseDrag.active && Math.abs(deltaY) < 4) return;
  activateMouseDrag();
  event.preventDefault();

  const rows = tableRows();
  if (!rows.length) return;
  let targetIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  rows.forEach((row, index) => {
    const shift = Number.parseFloat(row.style.getPropertyValue('--drag-shift')) || 0;
    const rect = row.getBoundingClientRect();
    const baseCenter = rect.top - shift + rect.height / 2;
    const distance = Math.abs(event.clientY - baseCenter);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      targetIndex = index;
    }
  });

  mouseDrag.targetIndex = targetIndex;

  rows.forEach((item, index) => {
    let shift = 0;
    if (index === mouseDrag.sourceIndex) {
      shift = deltaY;
    } else if (targetIndex > mouseDrag.sourceIndex && index > mouseDrag.sourceIndex && index <= targetIndex) {
      shift = -mouseDrag.rowHeight;
    } else if (targetIndex < mouseDrag.sourceIndex && index >= targetIndex && index < mouseDrag.sourceIndex) {
      shift = mouseDrag.rowHeight;
    }
    item.style.setProperty('--drag-shift', `${shift}px`);
  });
}

function removeMouseDragListeners() {
  window.removeEventListener('mousemove', handleTableMouseMove);
  window.removeEventListener('mouseup', handleTableMouseUp);
  window.removeEventListener('blur', handleTableMouseCancel);
}

function finishMouseDrag(commit) {
  if (!mouseDrag) return;
  const drag = mouseDrag;
  mouseDrag = null;
  removeMouseDragListeners();
  clearDragPreview();
  if (drag.active) {
    document.body.style.cursor = previousBodyCursor;
    document.body.style.userSelect = previousBodyUserSelect;
    suppressRowClickUntil = performance.now() + 350;
  }

  if (!commit || !drag.active || drag.targetIndex === drag.sourceIndex) return;
  const nextData = [...selectedPolyline.value.positions];
  const [moved] = nextData.splice(drag.sourceIndex, 1);
  nextData.splice(drag.targetIndex, 0, moved);
  applyTableChange(nextData);
}

function handleTableMouseUp() {
  finishMouseDrag(true);
}

function handleTableMouseCancel() {
  finishMouseDrag(false);
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

    <div
        ref="tableWrapElement"
        class="table-wrap"
        @mousedown.capture="handleTableMouseDown"
        @dragstart.capture.prevent
    >
      <a-table
          :columns="columns"
          :data="selectedPolyline.positions"
          :pagination="false"
          :scroll="{ x: 924, y: tableBodyHeight }"
          :sticky-header="true"
          size="small"
          @row-click="handleRowClick"
          :row-class="setPositionRowClass"
      >
        <template #drag>
          <span class="drag-handle" title="按住此行拖动排序" aria-hidden="true">
            <icon-drag-dot-vertical/>
          </span>
        </template>
        <template #id="{ record, rowIndex }">
          <div class="point-index-cell">
            <a-tooltip v-if="record.point_ext_params" content="已配置扩展参数">
              <span class="point-id has-extension">
                {{ record.id }}<icon-info-circle/>
              </span>
            </a-tooltip>
            <span v-else class="point-id">{{ record.id }}</span>
            <a-tooltip content="从此处运行">
              <a-button type="text" size="small" class="play-btn" aria-label="从此处运行" @click.stop="runFromPoint(rowIndex)">
                <template #icon><icon-play-arrow/></template>
              </a-button>
            </a-tooltip>
          </div>
        </template>
        <template #xy="{ record, rowIndex }">
          <div class="coord-editor" @click.stop @mousedown.stop @dragstart.stop.prevent>
            <label class="coord-input coord-x">
              <span>X</span>
              <a-input-number
                  :model-value="record.x"
                  :step="0.0001"
                  :precision="COORDINATE_PRECISION"
                  hide-button
                  :aria-label="`第 ${rowIndex + 1} 个点位 X 坐标`"
                  @focus="selectPoint(record)"
                  @change="(value) => handleCoordinateChange(record, rowIndex, 'x', value)"
              />
            </label>
            <label class="coord-input coord-y">
              <span>Y</span>
              <a-input-number
                  :model-value="record.y"
                  :step="0.0001"
                  :precision="COORDINATE_PRECISION"
                  hide-button
                  :aria-label="`第 ${rowIndex + 1} 个点位 Y 坐标`"
                  @focus="selectPoint(record)"
                  @change="(value) => handleCoordinateChange(record, rowIndex, 'y', value)"
              />
            </label>
          </div>
        </template>
        <template #move_mode="{ record }">
          <ComfortSelect
              v-model="record.move_mode"
              class="point-select"
              size="compact"
              :options="moveModeOptions"
              aria-label="移动方式"
          />
        </template>
        <template #action="{ record }">
          <div class="action-cell" @click.stop>
            <ComfortSelect
                v-model="record.action"
                class="action-select"
                size="compact"
                :options="actionOptionsTree"
                placeholder="请选择动作"
                aria-label="点位动作"
                @change="actionChange(record)"
            />
            <a-input allow-clear v-if="record.action === 'log_output'" v-model="record.action_params"
                     :disabled="record.type === 'teleport'" placeholder="录入需要输出的日志"/>
            <a-input allow-clear v-if="record.action === 'stop_flying'" v-model="record.action_params"
                     placeholder="下落攻击等待时间（毫秒）"/>
            <a-input allow-clear v-if="record.action === 'set_time'" v-model="record.action_params"
                     placeholder="设置时间 HH:MM"/>
            <a-input allow-clear v-if="record.action === 'linnea_mining'" v-model="record.action_params"
                     placeholder="射箭次数，旋转寻矿次数"/>
            <a-input-number
                v-if="record.action === 'use_gadget'"
                :model-value="gadgetWaitValue(record.action_params)"
                placeholder="冷却等待上限"
                :min="0"
                :max="100"
                :step="0.5"
                hide-button
                aria-label="小道具最大等待冷却时间（秒）"
                @change="(value) => handleGadgetWaitChange(record, value)"
            >
              <template #suffix>秒</template>
            </a-input-number>
            <a-auto-complete allow-clear :data="combatScriptData" v-if="record.action === 'combat_script'"
                             v-model="record.action_params" placeholder="录入或选择策略"/>
          </div>
        </template>
        <template #type="{ record }">
          <ComfortSelect
              v-model="record.type"
              class="point-select"
              size="compact"
              :options="pointTypeOptions"
              aria-label="点位类型"
          />
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
            <a-tooltip v-if="record.locked" content="点击解除插入位置锁定">
              <a-button
                  class="locked-toggle"
                  type="text"
                  size="small"
                  aria-label="解除插入位置锁定"
                  @click.stop="unlockRowIndex(record)"
              >
                <template #icon><icon-lock/></template>
              </a-button>
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

.table-wrap :deep(.arco-table-td-content) {
  width: 100%;
  min-width: 0;
}

.table-wrap :deep(.arco-table-tbody .arco-table-tr:nth-child(even) .arco-table-td) {
  background: #fbfdff;
}

.table-wrap :deep(.arco-table-tr:hover .arco-table-td) {
  background: #f7fbff;
}

.table-wrap :deep(.arco-table-tr.point-row) {
  cursor: default;
  transform: translateY(var(--drag-shift, 0));
  transform-origin: center;
  transition: transform 160ms cubic-bezier(.22, .8, .3, 1), filter 160ms ease, opacity 120ms ease;
}

.table-wrap :deep(.arco-table-tr.point-row .arco-table-td:nth-child(-n + 2)) {
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.table-wrap :deep(.arco-table-tr.point-row.is-drag-source) {
  position: relative;
  cursor: grabbing;
  z-index: 3;
  filter: drop-shadow(0 7px 8px rgb(31 48 76 / 16%));
  opacity: 0.92;
  transition: filter 140ms ease, opacity 100ms ease;
}

.table-wrap :deep(.arco-table-tr.point-row.is-drag-source),
.table-wrap :deep(.arco-table-tr.point-row[style*="--drag-shift"]) {
  will-change: transform;
}

.table-wrap :deep(.arco-table-tr.point-row input),
.table-wrap :deep(.arco-table-tr.point-row textarea) {
  cursor: text;
}

.table-wrap :deep(.arco-table-tr.point-row button:not(:disabled)),
.table-wrap :deep(.arco-table-tr.point-row .comfort-select:not(.is-disabled)) {
  cursor: pointer;
}

.table-wrap :deep(.arco-table-tr.selected-row .arco-table-td) {
  background: #dcecff;
}

.table-wrap :deep(.arco-table-tr.locked .arco-table-td) {
  background: #fff3d6 !important;
}

.table-wrap :deep(.arco-table-tr.locked:hover .arco-table-td) {
  background: #ffe9b9 !important;
}

.table-wrap :deep(.arco-table-tr.locked.selected-row .arco-table-td) {
  background: #ffe2a3 !important;
}

.drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  color: #94a3b8;
  cursor: grab;
  font-size: 19px;
  transition: color 140ms ease, transform 160ms cubic-bezier(.22, .8, .3, 1);
}

.table-wrap :deep(.arco-table-tr:hover) .drag-handle {
  color: #587493;
}

.table-wrap :deep(.arco-table-tr.point-row.is-drag-source) .drag-handle {
  color: var(--brand);
  cursor: grabbing;
  transform: scale(1.14);
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

.point-index-cell {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.coord-editor {
  display: grid;
  grid-template-columns: 1fr;
  gap: 3px;
  width: 100%;
}

.coord-input {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr);
  align-items: center;
  gap: 3px;
  min-width: 0;
  font-variant-numeric: tabular-nums;
}

.coord-input > span {
  font-size: 10px;
  font-weight: 700;
  text-align: center;
}

.coord-input :deep(.arco-input-number) {
  width: 100%;
  min-width: 0;
}

.coord-input :deep(.arco-input-wrapper) {
  padding-right: 6px;
  padding-left: 6px;
  background: var(--coord-bg);
  border-color: transparent;
}

.coord-input :deep(.arco-input-wrapper:hover),
.coord-input :deep(.arco-input-wrapper.arco-input-focus) {
  background: var(--coord-focus-bg);
  border-color: var(--coord-border);
}

.coord-input :deep(.arco-input) {
  font-size: 12px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.coord-input.coord-x :deep(.arco-input) {
  color: #2468b4 !important;
  -webkit-text-fill-color: #2468b4;
}

.coord-input.coord-y :deep(.arco-input) {
  color: #12805c !important;
  -webkit-text-fill-color: #12805c;
}

.coord-x {
  --coord-bg: #edf5ff;
  --coord-focus-bg: #e2efff;
  --coord-border: #8cb8e9;
  color: #2468b4;
}

.coord-y {
  --coord-bg: #eaf8f2;
  --coord-focus-bg: #ddf3e9;
  --coord-border: #7bc3a8;
  color: #12805c;
}

.coord-editor :deep(.arco-input-wrapper) {
  min-height: 25px !important;
  height: 25px !important;
}

.action-cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 230px;
}

.action-cell :deep(.arco-input-wrapper),
.action-cell :deep(.arco-input-number) {
  width: 100%;
}

.table-wrap :deep(.arco-input-wrapper) {
  min-height: 28px;
  height: 28px;
}

.row-actions {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
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

.locked-toggle {
  width: 28px;
  min-width: 28px;
  min-height: 30px;
  height: 30px;
  padding: 0;
  color: #d46b08;
  font-size: 15px;
}

.point-select {
  width: 100%;
  --comfort-select-height: 32px;
}

.action-select {
  width: 100%;
  --comfort-select-height: 32px;
}

.locked-toggle:hover {
  color: #b45309;
  background: #ffd994;
}

.play-btn {
  width: 30px;
  min-width: 30px;
  min-height: 30px;
  height: 30px;
  padding: 0 !important;
  color: var(--brand);
  font-size: 15px !important;
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

@media (prefers-reduced-motion: reduce) {
  .table-wrap :deep(.arco-table-tr.point-row),
  .drag-handle {
    transition: none;
  }
}
</style>
