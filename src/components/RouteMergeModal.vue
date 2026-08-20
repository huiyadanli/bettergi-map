<script setup>
import {computed, ref, watch} from 'vue';
import {Message} from '@arco-design/web-vue';
import {
  polylines,
  selectedPolylineIndex,
  showRouteMergeModal,
} from '../stores/editor';
import {mergePolylines} from '../composables/useRoutes';

const mergeItems = ref([]);
const resultName = ref('');
const removeSources = ref(false);

const selectedItems = computed(() => mergeItems.value.filter((item) => item.selected));
const selectedCount = computed(() => selectedItems.value.length);
const totalPoints = computed(() => selectedItems.value.reduce(
  (total, item) => total + (item.route.positions?.length || 0),
  0,
));
const canMerge = computed(() => selectedCount.value >= 2 && resultName.value.trim().length > 0);

watch(showRouteMergeModal, (visible) => {
  if (!visible) return;
  const currentRoute = polylines.value[selectedPolylineIndex.value] || polylines.value[0];
  mergeItems.value = polylines.value.map((route, index) => ({
    route,
    selected: route === currentRoute,
    sourceIndex: index,
  }));
  resultName.value = currentRoute ? `${currentRoute.name}-合并` : '合并路线';
  removeSources.value = false;
});

function selectAll() {
  mergeItems.value.forEach((item) => item.selected = true);
}

function clearSelected() {
  mergeItems.value.forEach((item) => item.selected = false);
}

function selectedOrder(item) {
  return selectedItems.value.indexOf(item) + 1;
}

function moveSelected(item, offset) {
  const ordered = selectedItems.value;
  const selectedIndex = ordered.indexOf(item);
  const swapItem = ordered[selectedIndex + offset];
  if (!swapItem) return;

  const itemIndex = mergeItems.value.indexOf(item);
  const swapIndex = mergeItems.value.indexOf(swapItem);
  const nextItems = [...mergeItems.value];
  [nextItems[itemIndex], nextItems[swapIndex]] = [nextItems[swapIndex], nextItems[itemIndex]];
  mergeItems.value = nextItems;
}

function closeModal() {
  showRouteMergeModal.value = false;
}

function confirmMerge() {
  if (!canMerge.value) {
    Message.warning(selectedCount.value < 2 ? '请至少选择两条路线' : '请填写路线名称');
    return;
  }
  const merged = mergePolylines(
    selectedItems.value.map((item) => item.route),
    resultName.value,
    removeSources.value,
  );
  if (merged) closeModal();
}
</script>

<template>
  <a-modal
      v-model:visible="showRouteMergeModal"
      modal-class="route-merge-modal"
      title="合并路线"
      :width="720"
      :footer="false"
      :mask-closable="false"
  >
    <div class="merge-name-row">
      <label for="merge-route-name">结果名称</label>
      <a-input
          id="merge-route-name"
          v-model="resultName"
          allow-clear
          :max-length="80"
          placeholder="输入合并后的路线名称"
      />
    </div>

    <div class="merge-list-head">
      <strong>拼接顺序</strong>
      <span class="merge-count">已选 {{ selectedCount }} 条 · {{ totalPoints }} 个点位</span>
      <div class="merge-batch-actions">
        <a-button type="text" size="small" @click="selectAll">全选</a-button>
        <a-button type="text" size="small" @click="clearSelected">清空选择</a-button>
      </div>
    </div>

    <div class="merge-route-list" role="list" aria-label="待合并路线">
      <div
          v-for="item in mergeItems"
          :key="item.sourceIndex"
          class="merge-route-row"
          :class="{ selected: item.selected }"
          role="listitem"
      >
        <a-checkbox v-model="item.selected" :aria-label="`选择路线 ${item.route.name}`"/>
        <span v-if="item.selected" class="merge-order">{{ selectedOrder(item) }}</span>
        <span v-else class="merge-order muted">—</span>
        <div class="merge-route-info">
          <strong :title="item.route.name">{{ item.route.name }}</strong>
          <span>{{ item.route.positions?.length || 0 }} 点</span>
        </div>
        <div class="merge-order-actions">
          <a-tooltip content="向前拼接">
            <a-button
                type="text"
                class="merge-order-button"
                aria-label="向前拼接"
                :disabled="!item.selected || selectedOrder(item) <= 1"
                @click="moveSelected(item, -1)"
            >
              <template #icon><icon-arrow-up/></template>
            </a-button>
          </a-tooltip>
          <a-tooltip content="向后拼接">
            <a-button
                type="text"
                class="merge-order-button"
                aria-label="向后拼接"
                :disabled="!item.selected || selectedOrder(item) >= selectedCount"
                @click="moveSelected(item, 1)"
            >
              <template #icon><icon-arrow-down/></template>
            </a-button>
          </a-tooltip>
        </div>
      </div>
    </div>

    <div class="merge-options">
      <a-checkbox v-model="removeSources">合并后删除所选原路线</a-checkbox>
      <span v-if="removeSources" class="merge-warning">未选中的路线不会受影响</span>
    </div>

    <div class="merge-footer">
      <a-button size="large" @click="closeModal">取消</a-button>
      <a-button type="primary" size="large" :disabled="!canMerge" @click="confirmMerge">
        {{ removeSources ? `合并并替换 ${selectedCount} 条` : '创建合并路线' }}
      </a-button>
    </div>
  </a-modal>
</template>

<style>
.route-merge-modal .arco-modal-header {
  padding: 18px 22px 12px;
  border-bottom: 0;
}

.route-merge-modal .arco-modal-title {
  color: #1f2d3d;
  font-size: 17px;
  font-weight: 650;
}

.route-merge-modal .arco-modal-body {
  padding: 6px 22px 20px;
}

.merge-name-row {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.merge-name-row label,
.merge-list-head strong {
  color: #27364a;
  font-size: 13px;
  font-weight: 600;
}

.merge-name-row .arco-input-wrapper {
  min-height: 40px;
  background: #f3f7fc;
  border-color: transparent;
}

.merge-list-head {
  display: flex;
  align-items: center;
  min-height: 36px;
  gap: 10px;
}

.merge-count {
  color: #5e7189;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.merge-batch-actions {
  display: flex;
  margin-left: auto;
  gap: 2px;
}

.merge-batch-actions .arco-btn {
  min-height: 34px;
}

.merge-route-list {
  max-height: min(48dvh, 430px);
  overflow-y: auto;
  padding: 4px;
  border-radius: 10px;
  background: #f4f7fb;
  scrollbar-gutter: stable;
}

.merge-route-row {
  display: grid;
  grid-template-columns: 28px 28px minmax(0, 1fr) auto;
  align-items: center;
  min-height: 48px;
  padding: 4px 6px 4px 10px;
  border-radius: 7px;
  color: #52657c;
  transition: background-color 120ms ease;
}

.merge-route-row + .merge-route-row {
  margin-top: 2px;
}

.merge-route-row:hover {
  background: #eaf1fa;
}

.merge-route-row.selected {
  background: #e3effc;
}

.merge-order {
  color: #2369b6;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.merge-order.muted {
  color: #aab5c3;
}

.merge-route-info {
  display: flex;
  align-items: baseline;
  min-width: 0;
  gap: 8px;
}

.merge-route-info strong {
  overflow: hidden;
  color: #26374b;
  font-size: 13px;
  font-weight: 550;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.merge-route-info span {
  flex: none;
  color: #788aa0;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.merge-order-actions {
  display: flex;
  gap: 3px;
}

.merge-order-button {
  width: 36px;
  min-width: 36px;
  height: 36px;
  padding: 0;
  color: #47637f;
  font-size: 16px;
}

.merge-order-button:not(.arco-btn-disabled):hover {
  color: #176dc1;
  background: #d3e6f9;
}

.merge-options {
  display: flex;
  align-items: center;
  min-height: 44px;
  gap: 10px;
  color: #73859a;
  font-size: 12px;
}

.merge-warning {
  color: #d46b08;
}

.merge-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 8px;
}

.merge-footer .arco-btn {
  min-width: 112px;
  min-height: 40px;
}

@media (max-width: 760px) {
  .route-merge-modal {
    width: calc(100vw - 24px) !important;
  }

  .route-merge-modal .arco-modal-body {
    padding-right: 14px;
    padding-left: 14px;
  }

  .merge-route-info span {
    display: none;
  }
}
</style>
