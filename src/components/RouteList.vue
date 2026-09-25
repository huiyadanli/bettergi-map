<script setup>
/**
 * 路线列表卡片。
 *
 * 结构与 PointTableCard 一致：a-card 头部放标题和操作，卡片体放列表。
 *
 * 数据同步：本组件持有自己的列表存储（listRoutes / listActiveIndex），
 * 由编辑器状态单向同步进来——导入、新增、拆分、合并、删除、切换、换地图
 * 都会经由 watch 落到本组件的存储上，因此 RouteListCard 中「导入的路线」
 * 会实时出现在这张列表里。本组件只读这份存储，所有改动仍然调用编辑器动作，
 * 保证地图图层、历史快照等副作用不被绕过。
 */
import {computed, ref, watch} from 'vue';
import {Modal} from '@arco-design/web-vue';
import {MAPS} from '../config/mapConfig';
import {currentMapName, polylines, selectedPolylineIndex} from '../stores/editor';
import {switchMap} from '../composables/useMap';
import {deletePolyline, renamePolyline, selectPolyline} from '../composables/useRoutes';
import {importPositions} from '../composables/useFileAccess';
import {commonTagManagerModal} from '../composables/useRouteSettings';
import {exportPositions} from '../composables/useExport';
import ComfortSelect from './ComfortSelect.vue';
import RouteNameEditor from './RouteNameEditor.vue';

const listWrapElement = ref(null);
const selectedMapName = ref(currentMapName.value);

// 列表存储：编辑器状态的本地投影，deep 监听保证行内改名也能同步。
const listRoutes = ref([]);
const listActiveIndex = ref(-1);

const routeCount = computed(() => listRoutes.value.length);
const activeRouteIndex = computed(() => listActiveIndex.value);
const mapOptions = Object.entries(MAPS).map(([value, config]) => ({
  value,
  label: config.displayName,
}));

// 编辑器状态 → 列表存储。同一 watcher 同时盯住三件事，缺一就会漏同步：
// 1) 数组本身（换地图会整体替换），2) 长度（导入 push / 删除 splice 不换引用），
// 3) 深层字段（行内改名直接改对象属性）。回调里统一重新取值，不依赖回调参数。
// 路线数量的对外同步由 RouteListCard 负责，这里只维护自身的列表存储。
watch(
    [() => polylines.value, () => polylines.value.length],
    () => {
      listRoutes.value = polylines.value;
    },
    {immediate: true, deep: true},
);

watch(selectedPolylineIndex, (index) => {
  const valid = index >= 0 && index < listRoutes.value.length;
  listActiveIndex.value = valid ? index : (listRoutes.value.length ? 0 : -1);
}, {immediate: true});

// 路线数量变化（尤其是导入后）时，若还没有合法选中项则补选中第一条。
watch(() => listRoutes.value.length, (length) => {
  const valid = listActiveIndex.value >= 0 && listActiveIndex.value < length;
  if (!valid) listActiveIndex.value = length ? 0 : -1;
});

function formatRouteIndex(index) {
  return String(index + 1).padStart(2, '0');
}

function selectRoute(index) {
  if (index !== activeRouteIndex.value) selectPolyline(index);
}

watch(currentMapName, (value) => {
  selectedMapName.value = value;
});

let switchingMap = false;

async function handleMapChange(nextMapName) {
  if (nextMapName === currentMapName.value || switchingMap) return;

  if (polylines.value.length) {
    const shouldSwitch = await new Promise((resolve) => {
      Modal.confirm({
        title: '切换地图？',
        content: '切换地图会清空当前已加载的路线，建议先导出保存。',
        okText: '继续切换',
        cancelText: '留在当前地图',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
    if (!shouldSwitch) {
      selectedMapName.value = currentMapName.value;
      return;
    }
  }

  switchingMap = true;
  try {
    await switchMap(nextMapName);
  } finally {
    switchingMap = false;
  }
}
</script>

<template>
  <a-card class="route-list-card" :bordered="false">
    <template #title>
      <div class="section-heading">
        <span class="section-heading-main">路线列表</span>
        <span v-if="routeCount" class="section-heading-count">{{ routeCount }}</span>
      </div>
    </template>

    <div ref="listWrapElement" class="list-wrap">
      <ul v-if="listRoutes.length" class="route-list" aria-label="路线列表">
        <li
            v-for="(item, index) in listRoutes"
            :key="`route-${index}`"
            class="route-row"
            :class="{'is-active': index === activeRouteIndex}"
        >
          <div class="route-row-head">
            <button
                class="route-row-select"
                type="button"
                :aria-current="index === activeRouteIndex ? 'true' : undefined"
                :aria-label="`切换到路线 ${item.name}`"
                @click="selectRoute(index)"
            >
              <span class="option-number">{{ formatRouteIndex(index) }}</span>
            </button>

            <RouteNameEditor
                :name="item.name"
                class="option-name"
                :label="`路线 ${index + 1} 名称`"
                @click.stop
                @confirm="(value) => renamePolyline(index, value)"
            />

            <span class="route-count">{{ item.positions.length }} 点</span>
          </div>

          <div class="route-row-actions">
            <a-button class="row-locate" type="text" size="small" @click.stop="selectPolyline(index)">
              <template #icon>
                <icon-location/>
              </template>
              定位
            </a-button>
            <a-tooltip content="其他设置">
              <a-button class="row-icon-action" type="text" size="small" aria-label="其他设置"
                        @click.stop="commonTagManagerModal(index)">
                <template #icon>
                  <icon-settings/>
                </template>
              </a-button>
            </a-tooltip>
            <a-tooltip content="导出路线">
              <a-button class="row-icon-action" type="text" size="small" aria-label="导出路线"
                        @click.stop="exportPositions(index)">
                <template #icon>
                  <icon-export/>
                </template>
              </a-button>
            </a-tooltip>
            <a-tooltip content="删除路线">
              <a-button
                  class="row-icon-action danger"
                  type="text"
                  status="danger"
                  size="small"
                  aria-label="删除路线"
                  @click.stop="deletePolyline(index)"
              >
                <template #icon>
                  <icon-delete/>
                </template>
              </a-button>
            </a-tooltip>
          </div>
        </li>
      </ul>
    </div>
  </a-card>
</template>

<style scoped>
.route-list-card {
  position: relative;
  z-index: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  height: 100%;
}

.route-list-card :deep(.arco-card-body) {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.route-list-card :deep(.arco-card-header) {
  height: 48px;
  min-height: 48px;
  padding: 0 14px;
  background: linear-gradient(100deg, #f1f6ff 0%, #ffffff 72%);
}

.route-list-card :deep(.arco-card-header-title),
.route-list-card :deep(.arco-card-header-extra) {
  height: 100%;
}

.route-list-card :deep(.arco-card-header-title) {
  display: flex;
  align-items: center;
}

.section-heading-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 20px;
  padding: 0 6px;
  color: #2468b4;
  background: #e5f0ff;
  border-radius: 6px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.point-header-actions {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  justify-content: flex-end;
  height: 100%;
  gap: 6px;
}

.point-header-actions :deep(.arco-btn) {
  min-height: 30px;
  height: 30px;
  padding-right: 12px;
  padding-left: 12px;
}

.map-select {
  width: 132px;
  --comfort-select-height: 30px;
}

/* 列表区与 PointTableCard 的 .table-wrap 保持同一套外观。 */
.list-wrap {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid #edf1f6;
  border-radius: var(--radius-md);
  background: #f7faff;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
}

.route-list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
  gap: 2px;
  margin: 0;
  padding: 6px;
  list-style: none;
}

/* 行内允许换行：列宽很窄时操作按钮自动落到第二行，不横向溢出。 */
.route-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  min-height: 44px;
  gap: 4px 6px;
  padding: 4px 6px;
  border-radius: 8px;
  background: #fff;
  transition: background-color 0.14s ease;
}

.route-row:hover {
  background: #edf5ff;
}

.route-row.is-active {
  background: #dcecff;
}

.route-row-head {
  display: flex;
  align-items: center;
  flex: 1 1 140px;
  gap: 6px;
  min-width: 0;
}

.route-row-select {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}

.route-row-select:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
  border-radius: 6px;
}

.option-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 22px;
  color: #7b8798;
  border-radius: 6px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.route-row.is-active .option-number {
  color: #2468b4;
  background: #e5f0ff;
}

.option-name {
  min-width: 0;
}

.route-row.is-active .option-name :deep(.name-text) {
  color: #1d5fa8;
}

.route-count {
  flex: none;
  color: var(--text-secondary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.route-row-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex: 0 1 auto;
  margin-left: auto;
  gap: 2px;
}

.row-locate,
.row-icon-action {
  min-height: 32px;
  height: 32px;
}

.row-locate {
  min-width: 68px;
  padding: 0 9px;
  color: #2468b4;
}

.row-icon-action {
  width: 32px;
  min-width: 32px;
  padding: 0;
  color: #5b6f89;
  font-size: 15px;
}

.row-icon-action:hover {
  color: var(--brand);
  background: var(--brand-soft);
}

.row-icon-action.danger:hover {
  color: #e84646;
  background: var(--danger-soft);
}

.list-empty {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 48px 16px;
  color: var(--text-secondary);
}

.list-empty strong {
  color: var(--text-primary);
  font-size: 14px;
}

.list-empty span {
  font-size: 12px;
}

.list-empty-icon {
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
  .route-row {
    transition: none;
  }
}
</style>
