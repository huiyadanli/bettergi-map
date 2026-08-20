<script setup>
/**
 * 宿主目录下的路线文件选择弹窗。
 *
 * 文件选择行为尽量贴近 Windows；实际导入仍由 useFileAccess 完成。
 */
import {computed, nextTick, onBeforeUnmount, ref, watch} from 'vue';
import {isJsonFile} from '../utils/fileTypes';
import {
  showFileSelectModal,
  currentPath,
  pathHistory,
  availableFiles,
  selectedFiles,
  selectedJsonFileCount,
} from '../stores/editor';
import {
  confirmImportFiles,
  closeFileSelectModal,
  resetToRoot,
  goBack,
  selectAll,
  enterDirectory,
  refreshCurrentDirectory,
} from '../composables/useFileAccess';

const fileList = ref(null);
const fileListViewport = ref(null);
const focusedIndex = ref(-1);
const selectionAnchorIndex = ref(-1);
const isMouseSelecting = ref(false);
const selectionBox = ref(null);

let mouseStartIndex = -1;
let mouseStartClientX = 0;
let mouseStartClientY = 0;
let mouseStartContentX = 0;
let mouseStartContentY = 0;
let mouseClientX = 0;
let mouseClientY = 0;
let mouseBaseSelection = [];
let mousePreservesSelection = false;
let mouseDidDrag = false;
let suppressRowClickUntil = 0;
let mouseAutoScrollFrame = 0;

const displayedFiles = computed(() => [...availableFiles.value].sort((left, right) => {
  if (left.IsDirectory !== right.IsDirectory) return left.IsDirectory ? -1 : 1;
  return left.Name.localeCompare(right.Name, 'zh-CN', {numeric: true, sensitivity: 'base'});
}));

function formatModified(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fileTypeLabel(item) {
  if (item.IsDirectory) return '文件夹';
  return isJsonFile(item) ? 'JSON 文件' : '文件';
}

function focusRow(index) {
  if (!displayedFiles.value.length) {
    focusedIndex.value = -1;
    return;
  }
  focusedIndex.value = Math.max(0, Math.min(index, displayedFiles.value.length - 1));
  nextTick(() => {
    const row = fileList.value?.querySelector(`[data-file-index="${focusedIndex.value}"]`);
    row?.focus({preventScroll: true});
    row?.scrollIntoView({block: 'nearest'});
  });
}

function jsonPathsBetween(fromIndex, toIndex) {
  const start = Math.min(fromIndex, toIndex);
  const end = Math.max(fromIndex, toIndex);
  return displayedFiles.value
    .slice(start, end + 1)
    .filter(isJsonFile)
    .map((item) => item.RelativePath);
}

function selectRange(toIndex, preserveSelection = false) {
  const anchor = selectionAnchorIndex.value >= 0 ? selectionAnchorIndex.value : toIndex;
  const rangePaths = jsonPathsBetween(anchor, toIndex);
  selectedFiles.value = preserveSelection
    ? [...new Set([...selectedFiles.value, ...rangePaths])]
    : rangePaths;
}

async function handleRowClick(item, index, event) {
  if (performance.now() < suppressRowClickUntil) {
    suppressRowClickUntil = 0;
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  focusedIndex.value = index;

  // 保留原有习惯：文件夹单击直接进入，不要求双击。
  if (item.IsDirectory) {
    await enterDirectory(item.RelativePath);
    selectionAnchorIndex.value = -1;
    focusRow(0);
    return;
  }

  if (!isJsonFile(item)) {
    if (!event.ctrlKey && !event.metaKey && !event.shiftKey) selectedFiles.value = [];
    selectionAnchorIndex.value = index;
    return;
  }

  if (event.shiftKey) {
    selectRange(index, event.ctrlKey || event.metaKey);
    return;
  }

  if (event.ctrlKey || event.metaKey) {
    const selected = new Set(selectedFiles.value);
    if (selected.has(item.RelativePath)) selected.delete(item.RelativePath);
    else selected.add(item.RelativePath);
    selectedFiles.value = [...selected];
  } else {
    selectedFiles.value = [item.RelativePath];
  }
  selectionAnchorIndex.value = index;
}

function updateMouseSelection() {
  if (!fileList.value) return;
  const rect = fileList.value.getBoundingClientRect();
  const currentContentX = mouseClientX - rect.left + fileList.value.scrollLeft;
  const currentContentY = mouseClientY - rect.top + fileList.value.scrollTop;
  const left = Math.min(mouseStartContentX, currentContentX);
  const top = Math.min(mouseStartContentY, currentContentY);
  const right = Math.max(mouseStartContentX, currentContentX);
  const bottom = Math.max(mouseStartContentY, currentContentY);
  const viewportRect = fileListViewport.value?.getBoundingClientRect() || rect;
  const startViewportX = Math.max(viewportRect.left, Math.min(mouseStartClientX, viewportRect.right));
  const startViewportY = Math.max(viewportRect.top, Math.min(mouseStartClientY, viewportRect.bottom));
  const currentViewportX = Math.max(viewportRect.left, Math.min(mouseClientX, viewportRect.right));
  const currentViewportY = Math.max(viewportRect.top, Math.min(mouseClientY, viewportRect.bottom));
  selectionBox.value = {
    left: `${Math.min(startViewportX, currentViewportX) - viewportRect.left}px`,
    top: `${Math.min(startViewportY, currentViewportY) - viewportRect.top}px`,
    width: `${Math.max(2, Math.abs(currentViewportX - startViewportX))}px`,
    height: `${Math.max(2, Math.abs(currentViewportY - startViewportY))}px`,
  };

  const paths = [];
  let lastIndex = mouseStartIndex;
  fileList.value.querySelectorAll('[data-file-index]').forEach((row) => {
    const rowRect = row.getBoundingClientRect();
    const rowLeft = rowRect.left - rect.left + fileList.value.scrollLeft;
    const rowTop = rowRect.top - rect.top + fileList.value.scrollTop;
    const intersects = right >= rowLeft
      && left <= rowLeft + rowRect.width
      && bottom >= rowTop
      && top <= rowTop + rowRect.height;
    if (!intersects) return;
    const index = Number(row.dataset.fileIndex);
    const item = displayedFiles.value[index];
    if (item && isJsonFile(item)) paths.push(item.RelativePath);
    lastIndex = index;
  });
  selectedFiles.value = mousePreservesSelection
    ? [...new Set([...mouseBaseSelection, ...paths])]
    : paths;
  focusedIndex.value = lastIndex;
}

function runMouseAutoScroll() {
  mouseAutoScrollFrame = 0;
  if (!isMouseSelecting.value || !mouseDidDrag || !fileList.value) return;
  const rect = fileList.value.getBoundingClientRect();
  const edgeSize = 34;
  const scrollStep = mouseClientY < rect.top + edgeSize
    ? -12
    : mouseClientY > rect.bottom - edgeSize ? 12 : 0;
  if (!scrollStep) return;
  fileList.value.scrollTop += scrollStep;
  updateMouseSelection();
  mouseAutoScrollFrame = requestAnimationFrame(runMouseAutoScroll);
}

function handleMouseMove(event) {
  if (!isMouseSelecting.value) return;
  mouseClientX = event.clientX;
  mouseClientY = event.clientY;
  if (!mouseDidDrag) {
    mouseDidDrag = Math.hypot(event.clientX - mouseStartClientX, event.clientY - mouseStartClientY) >= 4;
  }
  if (!mouseDidDrag) return;
  event.preventDefault();
  updateMouseSelection();
  if (!mouseAutoScrollFrame) mouseAutoScrollFrame = requestAnimationFrame(runMouseAutoScroll);
}

function finishMouseSelection() {
  if (!isMouseSelecting.value) return;
  isMouseSelecting.value = false;
  if (mouseDidDrag) selectionAnchorIndex.value = mouseStartIndex;
  suppressRowClickUntil = mouseDidDrag ? performance.now() + 500 : 0;
  selectionBox.value = null;
  if (mouseAutoScrollFrame) cancelAnimationFrame(mouseAutoScrollFrame);
  mouseAutoScrollFrame = 0;
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('mouseup', finishMouseSelection);
}

function handleListMouseDown(event) {
  if (event.button !== 0) return;
  const rect = fileList.value.getBoundingClientRect();
  if (event.clientX >= rect.left + fileList.value.clientWidth) return;
  const row = event.target.closest('[data-file-index]');
  suppressRowClickUntil = 0;
  isMouseSelecting.value = true;
  mouseStartIndex = row ? Number(row.dataset.fileIndex) : -1;
  mouseStartClientX = event.clientX;
  mouseStartClientY = event.clientY;
  mouseClientX = event.clientX;
  mouseClientY = event.clientY;
  mouseStartContentX = event.clientX - rect.left + fileList.value.scrollLeft;
  mouseStartContentY = event.clientY - rect.top + fileList.value.scrollTop;
  mouseBaseSelection = [...selectedFiles.value];
  mousePreservesSelection = event.ctrlKey || event.metaKey;
  mouseDidDrag = false;
  selectionBox.value = null;
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', finishMouseSelection, {once: true});
}

function handleListClick(event) {
  if (event.target !== event.currentTarget) return;
  if (performance.now() < suppressRowClickUntil) {
    suppressRowClickUntil = 0;
    event.preventDefault();
    return;
  }
  clearSelection();
}

async function activateItem(item, index) {
  if (item.IsDirectory) {
    await enterDirectory(item.RelativePath);
    selectionAnchorIndex.value = -1;
    focusRow(0);
    return;
  }
  if (!isJsonFile(item)) return;
  if (!selectedFiles.value.includes(item.RelativePath)) {
    selectedFiles.value = [item.RelativePath];
    selectionAnchorIndex.value = index;
  }
  await confirmImportFiles();
}

function moveFocus(offset, event) {
  const nextIndex = focusedIndex.value < 0
    ? (offset > 0 ? 0 : displayedFiles.value.length - 1)
    : focusedIndex.value + offset;
  focusRow(nextIndex);
  if (event.shiftKey) {
    selectRange(focusedIndex.value, event.ctrlKey || event.metaKey);
  } else if (!event.ctrlKey && !event.metaKey) {
    const item = displayedFiles.value[focusedIndex.value];
    selectedFiles.value = item && isJsonFile(item) ? [item.RelativePath] : [];
    selectionAnchorIndex.value = focusedIndex.value;
  }
}

function toggleFocusedItem() {
  const item = displayedFiles.value[focusedIndex.value];
  if (!item || !isJsonFile(item)) return;
  const selected = new Set(selectedFiles.value);
  if (selected.has(item.RelativePath)) selected.delete(item.RelativePath);
  else selected.add(item.RelativePath);
  selectedFiles.value = [...selected];
  selectionAnchorIndex.value = focusedIndex.value;
}

async function handleListKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
    event.preventDefault();
    await selectAll();
    return;
  }

  if ((event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowUp')) || event.key === 'Backspace') {
    if (!pathHistory.value.length) return;
    event.preventDefault();
    await navigateBack();
    return;
  }

  if (event.key === 'F5') {
    event.preventDefault();
    await refreshFiles();
    return;
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    moveFocus(event.key === 'ArrowDown' ? 1 : -1, event);
    return;
  }

  if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    const nextIndex = event.key === 'Home' ? 0 : displayedFiles.value.length - 1;
    focusRow(nextIndex);
    if (event.shiftKey) selectRange(focusedIndex.value, event.ctrlKey || event.metaKey);
    else if (!event.ctrlKey && !event.metaKey) {
      const item = displayedFiles.value[focusedIndex.value];
      selectedFiles.value = item && isJsonFile(item) ? [item.RelativePath] : [];
      selectionAnchorIndex.value = focusedIndex.value;
    }
    return;
  }

  if (event.key === ' ') {
    event.preventDefault();
    toggleFocusedItem();
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    const item = displayedFiles.value[focusedIndex.value];
    if (item) await activateItem(item, focusedIndex.value);
  }
}

async function navigateBack() {
  await goBack();
  selectionAnchorIndex.value = -1;
  focusRow(0);
}

async function navigateRoot() {
  await resetToRoot();
  selectionAnchorIndex.value = -1;
  focusRow(0);
}

async function refreshFiles() {
  await refreshCurrentDirectory();
  selectionAnchorIndex.value = -1;
  focusRow(0);
}

function clearSelection() {
  selectedFiles.value = [];
  selectionAnchorIndex.value = -1;
}

watch(showFileSelectModal, (visible) => {
  if (!visible) {
    finishMouseSelection();
    return;
  }
  selectionAnchorIndex.value = -1;
  nextTick(() => focusRow(0));
});

onBeforeUnmount(finishMouseSelection);
</script>

<template>
  <a-modal
      v-model:visible="showFileSelectModal"
      modal-class="file-select-modal"
      title="导入路线"
      :width="880"
      :footer="false"
      :mask-closable="false"
      @cancel="closeFileSelectModal"
  >
    <div class="file-dialog">
      <div class="file-toolbar" aria-label="目录操作">
        <a-tooltip content="返回上一级（Backspace / Alt+↑）">
          <a-button
              class="file-toolbar-button"
              type="text"
              aria-label="返回上一级"
              :disabled="pathHistory.length === 0"
              @click="navigateBack"
          >
            <template #icon><icon-arrow-left/></template>
          </a-button>
        </a-tooltip>
        <a-tooltip content="根目录">
          <a-button
              class="file-toolbar-button"
              type="text"
              aria-label="回到根目录"
              :disabled="!currentPath"
              @click="navigateRoot"
          >
            <template #icon><icon-home/></template>
          </a-button>
        </a-tooltip>
        <div class="file-address" :title="currentPath || '根目录'">
          <icon-folder class="file-address-icon"/>
          <span>{{ currentPath || '根目录' }}</span>
        </div>
        <a-tooltip content="刷新（F5）">
          <a-button class="file-toolbar-button" type="text" aria-label="刷新当前目录" @click="refreshFiles">
            <template #icon><icon-refresh/></template>
          </a-button>
        </a-tooltip>
      </div>

      <div class="file-list-header" aria-hidden="true">
        <span>名称</span>
        <span>修改日期</span>
        <span>类型</span>
      </div>

      <div ref="fileListViewport" class="file-list-viewport">
        <div
            ref="fileList"
            class="file-list"
            role="listbox"
            aria-label="路线文件"
            aria-multiselectable="true"
            :class="{ 'is-mouse-selecting': isMouseSelecting }"
            @keydown="handleListKeydown"
            @mousedown="handleListMouseDown"
            @click="handleListClick"
        >
          <button
              v-for="(item, index) in displayedFiles"
              :key="item.RelativePath"
              type="button"
              class="file-row"
              :class="{
                selected: selectedFiles.includes(item.RelativePath),
                focused: focusedIndex === index,
                directory: item.IsDirectory,
                selectable: isJsonFile(item),
                unavailable: !item.IsDirectory && !isJsonFile(item),
              }"
              :data-file-index="index"
              role="option"
              :aria-selected="selectedFiles.includes(item.RelativePath)"
              :tabindex="focusedIndex === index ? 0 : -1"
              @focus="focusedIndex = index"
              @dragstart.prevent
              @click="handleRowClick(item, index, $event)"
              @dblclick="!item.IsDirectory && activateItem(item, index)"
          >
            <span class="file-name" :title="item.Name">
              <icon-folder v-if="item.IsDirectory" class="file-entry-icon folder"/>
              <icon-file v-else class="file-entry-icon"/>
              <span>{{ item.Name }}</span>
            </span>
            <span class="file-date">{{ formatModified(item.LastModified) }}</span>
            <span class="file-type">{{ fileTypeLabel(item) }}</span>
          </button>

          <div v-if="displayedFiles.length === 0" class="file-empty">
            此文件夹为空
          </div>
        </div>
        <div v-if="selectionBox" class="file-selection-box" :style="selectionBox" aria-hidden="true"/>
      </div>

      <div class="file-dialog-footer">
        <div class="file-status">
          <strong>{{ selectedJsonFileCount ? `已选择 ${selectedJsonFileCount} 个文件` : '选择 JSON 路线文件' }}</strong>
          <span>空白处拖框 / Ctrl / Shift 多选 · Ctrl+A 全选</span>
        </div>
        <div class="file-footer-actions">
          <a-button v-if="selectedJsonFileCount" type="text" @click="clearSelection">清除选择</a-button>
          <a-button @click="closeFileSelectModal">取消</a-button>
          <a-button type="primary" :disabled="selectedJsonFileCount === 0" @click="confirmImportFiles">
            导入{{ selectedJsonFileCount ? `（${selectedJsonFileCount}）` : '' }}
          </a-button>
        </div>
      </div>
    </div>
  </a-modal>
</template>

<style>
.file-select-modal .arco-modal-header {
  padding: 17px 20px 12px;
  border-bottom: 0;
}

.file-select-modal .arco-modal-title {
  color: #223247;
  font-size: 17px;
  font-weight: 650;
}

.file-select-modal .arco-modal-body {
  padding: 4px 20px 18px;
  overflow: hidden;
}

.file-dialog {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.file-toolbar {
  display: grid;
  grid-template-columns: 40px 40px minmax(0, 1fr) 40px;
  align-items: center;
  gap: 5px;
  margin-bottom: 10px;
}

.file-toolbar-button.arco-btn {
  width: 40px;
  min-width: 40px;
  height: 38px;
  padding: 0;
  color: #516880;
  font-size: 17px;
  transition: color 130ms ease, background-color 130ms ease, transform 100ms ease;
}

.file-toolbar-button.arco-btn:not(.arco-btn-disabled):hover {
  color: #126fd1;
  background: #e5f1ff;
}

.file-toolbar-button.arco-btn:not(.arco-btn-disabled):active {
  transform: scale(0.94);
}

.file-address {
  display: flex;
  align-items: center;
  min-width: 0;
  height: 38px;
  gap: 8px;
  padding: 0 12px;
  border-radius: 7px;
  color: #31465e;
  background: #f0f4f9;
  font-size: 13px;
}

.file-address span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-address-icon {
  flex: none;
  color: #e0a43b;
  font-size: 16px;
}

.file-list-header,
.file-row {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 172px 100px;
  align-items: center;
  column-gap: 14px;
}

.file-list-header {
  min-height: 31px;
  padding: 0 12px;
  color: #687b91;
  background: #edf2f8;
  border-radius: 7px 7px 0 0;
  font-size: 12px;
  font-weight: 600;
}

.file-list-viewport {
  position: relative;
  height: clamp(290px, 52dvh, 460px);
  overflow: hidden;
  background: #f8fafc;
  border-radius: 0 0 8px 8px;
}

.file-list {
  width: 100%;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 4px;
  background: transparent;
  border-radius: inherit;
  scrollbar-gutter: stable;
  outline: 0;
  -webkit-user-select: none;
  user-select: none;
}

.file-row.directory,
.file-row.selectable {
  cursor: pointer;
}

.file-row.unavailable {
  cursor: not-allowed;
}

.file-list.is-mouse-selecting {
  cursor: default;
}

.file-selection-box {
  position: absolute;
  z-index: 3;
  border-radius: 4px;
  background: rgb(22 119 255 / 13%);
  pointer-events: none;
}

.file-row {
  width: 100%;
  min-height: 39px;
  padding: 0 8px;
  border: 0;
  border-radius: 5px;
  color: #354a61;
  background: transparent;
  cursor: default;
  font-size: 13px;
  text-align: left;
  transition: color 100ms ease, background-color 100ms ease;
  -webkit-user-select: none;
  user-select: none;
}

.file-row + .file-row {
  margin-top: 1px;
}

.file-row:hover {
  background: #eaf2fb;
}

.file-row.selected {
  color: #163f6c;
  background: #d9eaff;
}

.file-row.selected:hover,
.file-row.selected.focused {
  background: #cfe4ff;
}

.file-row:focus-visible {
  outline: 0;
  background: #e1edfb;
}

.file-row.selected:focus-visible {
  background: #cfe4ff;
}

.file-row.unavailable {
  color: #9aa7b5;
}

.file-name {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 9px;
}

.file-name span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-entry-icon {
  flex: none;
  color: #7792ad;
  font-size: 18px;
}

.file-entry-icon.folder {
  color: #dda63f;
}

.file-date,
.file-type {
  overflow: hidden;
  color: #718398;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-empty {
  display: grid;
  min-height: 260px;
  place-items: center;
  color: #91a0b0;
  font-size: 13px;
}

.file-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 58px;
  gap: 16px;
  padding-top: 10px;
}

.file-status {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

.file-status strong {
  color: #334a63;
  font-size: 12px;
  font-weight: 600;
}

.file-status span {
  color: #8998a9;
  font-size: 11px;
}

.file-footer-actions {
  display: flex;
  align-items: center;
  flex: none;
  gap: 8px;
}

.file-footer-actions .arco-btn {
  min-width: 88px;
  min-height: 38px;
}

.file-footer-actions .arco-btn-text {
  min-width: auto;
}

@media (max-width: 720px) {
  .file-select-modal {
    width: calc(100vw - 24px) !important;
  }

  .file-list-header,
  .file-row {
    grid-template-columns: minmax(180px, 1fr) 92px;
  }

  .file-list-header span:nth-child(2),
  .file-date {
    display: none;
  }

  .file-dialog-footer {
    align-items: flex-end;
  }

  .file-status span {
    display: none;
  }
}
</style>
