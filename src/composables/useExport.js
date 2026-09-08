/**
 * 路线导出和作者信息。
 *
 * 负责导出弹窗数据、预设作者和最终 JSON 写出，不编辑点位本身。
 */
import {Message} from '@arco-design/web-vue';
import {JSONStringifyOrdered, deepMerge} from '../utils/json';
import {saveLocal, loadLocal} from '../utils/storage';
import {
  mode,
  currentMapName,
  polylines,
  selectedPolylineIndex,
  exportAuthors,
  exportVersion,
  exportDescription,
  showExportModal,
  showAuthorSelectModal,
  selectedAuthorRowIndex,
  preAuthors,
} from '../stores/editor';
import {saveToFileAccessBridge} from './useFileAccess';
import {snapshotPolyline} from './useHistory';
import {normalizeCoordinate} from '../constants/editor';

/**
 * 在导出表单中追加一个空作者。
 */
export function addAuthor() {
  exportAuthors.value.push({name: '', links: ''});
}

/**
 * 删除导出表单中的一个作者，至少保留一行。
 */
export function removeAuthor(index) {
  if (exportAuthors.value.length > 1) {
    exportAuthors.value.splice(index, 1);
  }
}

/**
 * 处理预设作者弹窗的打开、增删、保存和选用。
 */
export function handlePresetAuthor(action, payload) {
  if (action === 'open') {
    const storedPreAuthors = (loadLocal('_preAuthors') || {}).preAuthors || [];
    preAuthors.value = storedPreAuthors.length > 0 ? storedPreAuthors : [{name: '', links: '', def: false}];
    selectedAuthorRowIndex.value = payload;
    showAuthorSelectModal.value = true;
  } else if (action === 'add') {
    preAuthors.value.push({name: '', links: '', def: false});
  } else if (action === 'delete') {
    preAuthors.value.length > 1
      ? preAuthors.value.splice(payload, 1)
      : preAuthors.value = [{name: '', links: '', def: false}];
  } else if (action === 'save') {
    saveLocal('_preAuthors', {preAuthors: preAuthors.value});
    Message.success('预设作者已保存');
  } else if (action === 'select') {
    if (selectedAuthorRowIndex.value >= 0 && exportAuthors.value[selectedAuthorRowIndex.value]) {
      saveLocal('_preAuthors', {preAuthors: preAuthors.value});
      exportAuthors.value[selectedAuthorRowIndex.value] = {
        name: payload.name || '',
        links: payload.links || ''
      };
    }
    showAuthorSelectModal.value = false;
  }
}

/**
 * 打开导出弹窗，并回填该路线已有的作者和版本。
 */
export function exportPositions(index) {
  const polyline = polylines.value[index];
  const info = polyline.info || {};

  if (info.authors && Array.isArray(info.authors) && info.authors.length > 0) {
    exportAuthors.value = [...info.authors];
  } else if (info.author && info.author.trim() !== '') {
    exportAuthors.value = [{name: info.author, links: ''}];
  } else {
    exportAuthors.value = [{name: '', links: ''}];
  }

  exportVersion.value = info.version || '';
  exportDescription.value = info.description || '';
  showExportModal.value = true;
  selectedPolylineIndex.value = index;
}

/**
 * 组装导出 JSON，空作者时回退默认预设，再按模式保存或下载。
 */
export function handleExport() {
  const polyline = polylines.value[selectedPolylineIndex.value];

  const info = polyline.info || {};
  const hasRouteAuthors = info.authors && Array.isArray(info.authors) && info.authors.length > 0 && info.authors.some((author) => author.name.trim() !== '');

  if (!hasRouteAuthors) {
    const inputHasAuthor = exportAuthors.value.some((author) => author.name.trim() !== '');
    if (!inputHasAuthor) {
      const storedPreAuthors = (loadLocal('_preAuthors') || {}).preAuthors || [];
      const defaultAuthors = storedPreAuthors.filter((author) => author.def && author.name);
      if (defaultAuthors.length > 0) {
        exportAuthors.value = defaultAuthors.map((author) => ({
          name: author.name || '',
          links: author.links || ''
        }));
        const authorsList = defaultAuthors.map((author) => author.name).join('、');
        Message.info(`当前作者信息为空，使用默认作者：${authorsList}`);
      }
    }
  }

  const validAuthors = exportAuthors.value.filter((author) => author.name.trim() !== '');

  let data = {
    info: {
      name: polyline.name,
      type: 'collect',
      authors: validAuthors,
      version: exportVersion.value,
      description: exportDescription.value,
      map_name: currentMapName.value,
      bgi_version: import.meta.env.VITE_BGI_VERSION,
      tags: polyline.tags || [],
      last_modified_time: Date.now(),
      enable_monster_loot_split: !!polyline.enable_monster_loot_split,
      map_match_method: polyline.map_match_method || ''
    },
    positions: polyline.positions.map((pos) => ({
      ...pos,
      x: normalizeCoordinate(pos.x),
      y: normalizeCoordinate(pos.y)
    }))
  };

  if (polyline.oldFileData?.info?.bgi_version) {
    data.info.bgi_version = polyline.oldFileData.info.bgi_version;
  }
  data = deepMerge(polyline.oldFileData || {}, data);

  if (!polyline.info) {
    polyline.info = {};
  }
  polyline.info.version = exportVersion.value;
  polyline.info.description = exportDescription.value;
  polyline.info.authors = validAuthors;

  if (mode === 'single') {
    saveToFileAccessBridge(data, polyline.name);
  } else {
    const json = JSONStringifyOrdered(data, 2);
    const blob = new Blob([json], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${polyline.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  showExportModal.value = false;
  snapshotPolyline();
}
