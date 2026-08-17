<script setup>
/**
 * 路线导出弹窗。
 *
 * 收集作者、版本和描述，确认后交给 useExport 写出。
 */
import {
  showExportModal,
  exportAuthors,
  exportVersion,
  exportDescription,
} from '../stores/editor';
import {addAuthor, removeAuthor, handlePresetAuthor, handleExport} from '../composables/useExport';
</script>

<template>
  <a-modal
      v-model:visible="showExportModal"
      title="导出路径"
      @ok="handleExport"
      @cancel="showExportModal = false"
      :width="600"
  >
    <a-form :model="{ authors: exportAuthors, version: exportVersion }">
      <a-form-item label="作者信息" style="width: 100%;">
        <div style="width: 100%;">
          <template v-for="(author, index) in exportAuthors" :key="index">
            <div style="margin-bottom: 4px; display: flex; width: 100%; gap: 8px;">
              <a-input
                  v-model="author.name"
                  :placeholder="`作者 ${index + 1} 姓名`"
                  size="small"
                  style="flex: 1;"
              />
              <a-button
                  @click="handlePresetAuthor('open', index)"
                  size="small"
              >
                选择作者
              </a-button>
              <a-button
                  @click="removeAuthor(index)"
                  size="small"
                  status="danger"
                  :disabled="exportAuthors.length === 1"
              >
                删除
              </a-button>
            </div>
            <div style="margin-bottom: 12px; width: 100%;">
              <a-input
                  v-model="author.links"
                  :placeholder="`作者 ${index + 1} 链接（可选）`"
                  size="small"
                  style="width: 100%;"
              />
            </div>
          </template>
          <a-button @click="addAuthor" type="dashed" size="small" style="width: 100%;">
            + 添加作者
          </a-button>
        </div>
      </a-form-item>

      <a-form-item field="version" label="版本">
        <a-input v-model="exportVersion" placeholder="请输入版本号,从1.0开始"/>
      </a-form-item>
      <a-form-item field="description" label="描述">
        <a-textarea v-model="exportDescription" placeholder="请输入描述" :auto-size="{ minRows: 3, maxRows: 5 }"/>
      </a-form-item>
    </a-form>
  </a-modal>
</template>
