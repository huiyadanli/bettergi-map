<script setup>
/**
 * 宿主目录下的路线文件选择弹窗。
 *
 * 只负责目录浏览和勾选 JSON，实际导入由 useFileAccess 完成。
 */
import {isJsonFile, getFileIcon} from '../utils/fileTypes';
import {
  showFileSelectModal,
  currentPath,
  pathHistory,
  availableFiles,
  selectedFiles,
  selectedJsonFileCount,
  isAllSelected,
} from '../stores/editor';
import {
  confirmImportFiles,
  closeFileSelectModal,
  resetToRoot,
  goBack,
  selectAll,
  enterDirectory,
} from '../composables/useFileAccess';
</script>

<template>
  <a-modal
      v-model:visible="showFileSelectModal"
      title="选择要导入的路线文件"
      @ok="confirmImportFiles"
      @cancel="closeFileSelectModal"
      :width="800"
      :height="600"
  >
    <div style="height: 500px; display: flex; flex-direction: column;">
      <div style="margin-bottom: 16px; padding: 8px; background: #f5f5f5; border-radius: 4px;">
        <a-space>
          <a-button size="small" @click="resetToRoot" :disabled="!currentPath">
            <template #icon>🏠</template>
            根目录
          </a-button>
          <a-button size="small" @click="goBack" :disabled="pathHistory.length === 0">
            <template #icon>⬅️</template>
            返回
          </a-button>
          <span style="color: #666;">
            当前路径: {{ currentPath || '根目录' }}
          </span>
          <a-button
            size="small"
            @click="selectAll"
          >
            <template #icon>
              <span v-if="isAllSelected">☑️</span>
              <span v-else>☐</span>
            </template>
            {{ isAllSelected ? '取消全选' : '全选' }}
          </a-button>
        </a-space>
      </div>

      <div style="flex: 1; overflow-y: auto; border: 1px solid #e5e6e8; border-radius: 4px;">
        <a-list :data="availableFiles" :bordered="false">
          <template #item="{ item }">
            <a-list-item style="padding: 8px 16px;">
              <div style="display: flex; align-items: center; width: 100%;">
                <div style="flex: 1; display: flex; align-items: center;">
                  <span style="margin-right: 8px; font-size: 16px;">
                    {{ getFileIcon(item) }}
                  </span>
                  <a-button
                      v-if="item.IsDirectory"
                      type="text"
                      @click="enterDirectory(item.RelativePath)"
                      style="text-align: left; padding: 0;"
                  >
                    {{ item.Name }}
                  </a-button>
                  <span v-else>{{ item.Name }}</span>
                </div>
                <div style="color: #999; font-size: 12px; margin-right: 16px;">
                  {{ new Date(item.LastModified).toLocaleString() }}
                </div>
                <a-checkbox
                    v-if="isJsonFile(item)"
                    :model-value="selectedFiles.includes(item.RelativePath)"
                    @change="(checked) => {
                    if (checked) {
                      selectedFiles.push(item.RelativePath);
                    } else {
                      const index = selectedFiles.indexOf(item.RelativePath);
                      if (index > -1) {
                        selectedFiles.splice(index, 1);
                      }
                    }
                  }"
                />
                <span v-else-if="!item.IsDirectory" style="color: #ccc; font-size: 12px;">
                  不可导入
                </span>
              </div>
            </a-list-item>
          </template>
        </a-list>
      </div>

      <div style="margin-top: 16px; padding: 8px; background: #f0f2f5; border-radius: 4px;">
        <a-space>
          <span>已选择 {{ selectedJsonFileCount }} 个JSON文件</span>
          <a-button
              v-if="selectedFiles.length > 0"
              size="small"
              @click="selectedFiles = []"
          >
            清空选择
          </a-button>
        </a-space>
      </div>
    </div>

    <template #footer>
      <a-space>
        <a-button @click="closeFileSelectModal">取消</a-button>
        <a-button
            type="primary"
            @click="confirmImportFiles"
            :disabled="selectedJsonFileCount === 0"
        >
          导入选中的文件 ({{ selectedJsonFileCount }})
        </a-button>
      </a-space>
    </template>
  </a-modal>
</template>
