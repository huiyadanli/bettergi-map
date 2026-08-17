<script setup>
/**
 * 预设作者列表弹窗。
 *
 * 维护本地作者预设，供导出表单选用。
 */
import {showAuthorSelectModal, preAuthors} from '../stores/editor';
import {handlePresetAuthor} from '../composables/useExport';
</script>

<template>
  <a-modal
      v-model:visible="showAuthorSelectModal"
      title="预设作者列表"
      @ok="handlePresetAuthor('save')"
      @cancel="showAuthorSelectModal = false"
      :width="500"
      okText="保存"
  >
    <a-space direction="vertical" fill>
      <template v-for="(author, index) in preAuthors" :key="index">
        <div style="margin-bottom: 12px;">
          <div style="display: flex; gap: 8px; margin-bottom: 4px;">
            <a-input v-model="author.name" :placeholder="`作者 ${index + 1} 姓名`" size="small" style="flex: 1;"/>
            <a-checkbox :value="true" v-model="author.def">默认</a-checkbox>
            <a-button @click="handlePresetAuthor('select', author)" size="small" :disabled="!author.name">选择</a-button>
            <a-button
                @click="handlePresetAuthor('delete', index)"
                size="small"
                status="danger"
                :disabled="preAuthors.length === 1 && !preAuthors[0].name && !preAuthors[0].links"
            >
              删除
            </a-button>
          </div>
          <a-input v-model="author.links" :placeholder="`作者 ${index + 1} 链接（可选）`" size="small"/>
        </div>
      </template>
      <a-button @click="handlePresetAuthor('add')" type="dashed" size="small" style="width: 100%;">
        + 添加作者
      </a-button>
    </a-space>
  </a-modal>
</template>
