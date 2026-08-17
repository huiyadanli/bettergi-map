<script setup>
/**
 * 路径列表卡片。
 *
 * 展示已加载路线，并提供导入、选择、设置、删除和导出入口。
 */
import {MAPS} from '../config/mapConfig';
import {currentMapName, polylines} from '../stores/editor';
import {switchMap} from '../composables/useMap';
import {selectPolyline, deletePolyline, renamePolyline} from '../composables/useRoutes';
import {importPositions} from '../composables/useFileAccess';
import {commonTagManagerModal} from '../composables/useRouteSettings';
import {exportPositions} from '../composables/useExport';
</script>

<template>
  <a-card title="路径列表" style="max-height: 400px;overflow-y: auto">
    <template #extra>
      <a-space>
        <a-select v-model="currentMapName" @change="switchMap" style="width: 160px; margin-right: 10px">
          <a-option v-for="(config, name) in MAPS" :key="name" :value="name">
            {{ config.displayName }}
          </a-option>
        </a-select>
        <a-button @click="importPositions" type="primary" size="small">导入路径</a-button>
      </a-space>
    </template>
    <a-list :data="polylines" :bordered="false">
      <template #item="{ item, index }">
        <a-list-item>
          <a-space>
            <a-input
                v-model="item.name"
                @change="(value) => renamePolyline(index, value)"
                style="width: 300px;"
            />
            <a-button @click="selectPolyline(index)" type="primary" size="small">选择</a-button>
            <a-button @click="commonTagManagerModal(index)" type="secondary" size="small">其他设置</a-button>
            <a-button @click="deletePolyline(index)" status="danger" size="small">删除</a-button>
            <a-button @click="exportPositions(index)" type="secondary" size="small">导出</a-button>
          </a-space>
        </a-list-item>
      </template>
    </a-list>
  </a-card>
</template>
