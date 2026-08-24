/**
 * 路线文件导入导出桥接。
 *
 * 封装 fileAccessBridge 和浏览器文件选择，不修改点位编辑规则。
 */
import {Message, Modal} from '@arco-design/web-vue';
import {MAPS} from '../config/mapConfig';
import {JSONStringifyOrdered} from '../utils/json';
import {isJsonFile} from '../utils/fileTypes';
import {
  mode,
  currentMapName,
  currentPath,
  pathHistory,
  availableFiles,
  selectedFiles,
  showFileSelectModal,
  polylines,
  selectedPolylineIndex,
} from '../stores/editor';
import {switchMap} from './useMap';
import {addImportedPolyline, addImportedPolylineWithoutMapSwitch} from './useRoutes';

/**
 * 通过宿主桥列出当前目录并打开选择弹窗。
 */
export async function importFromFileAccessBridge() {
  try {
    const fileAccessBridge = chrome.webview.hostObjects.fileAccessBridge;

    let itemsJson = await fileAccessBridge.ListItems(currentPath.value);
    const items = JSON.parse(itemsJson);

    if (items.length === 0) {
      Message.warning('当前目录为空');
      return;
    }

    showFileSelectDialog(items);
  } catch (error) {
    console.error('导入路线失败:', error);
    Message.error('导入路线失败: ' + error.message);
  }
}

/**
 * 打开文件选择弹窗并重置勾选。
 */
export function showFileSelectDialog(items) {
  availableFiles.value = Array.isArray(items) ? items : [];
  selectedFiles.value = [];
  showFileSelectModal.value = true;
}

/**
 * 进入子目录并刷新列表。
 */
export async function enterDirectory(dirPath) {
  try {
    const fileAccessBridge = chrome.webview.hostObjects.fileAccessBridge;
    pathHistory.value.push(currentPath.value);
    currentPath.value = dirPath;

    const itemsJson = await fileAccessBridge.ListItems(currentPath.value);
    const items = JSON.parse(itemsJson);
    availableFiles.value = items;
    selectedFiles.value = [];
  } catch (error) {
    console.error('进入目录失败:', error);
    Message.error('进入目录失败: ' + error.message);
  }
}

/**
 * 重新列举当前目录，供文件选择器刷新快捷键使用。
 */
export async function refreshCurrentDirectory() {
  try {
    const fileAccessBridge = chrome.webview.hostObjects.fileAccessBridge;
    const itemsJson = await fileAccessBridge.ListItems(currentPath.value);
    availableFiles.value = JSON.parse(itemsJson);
    selectedFiles.value = [];
  } catch (error) {
    console.error('刷新目录失败:', error);
    Message.error('刷新目录失败: ' + error.message);
  }
}

/**
 * 返回上一级目录。
 */
export async function goBack() {
  if (pathHistory.value.length > 0) {
    currentPath.value = pathHistory.value.pop();
    try {
      const fileAccessBridge = chrome.webview.hostObjects.fileAccessBridge;
      const itemsJson = await fileAccessBridge.ListItems(currentPath.value);
      const items = JSON.parse(itemsJson);
      availableFiles.value = items;
      selectedFiles.value = [];
    } catch (error) {
      console.error('返回上级目录失败:', error);
      Message.error('返回上级目录失败: ' + error.message);
    }
  }
}

/**
 * 回到根目录并重新列举。
 */
export async function resetToRoot() {
  currentPath.value = '';
  pathHistory.value = [];
  await refreshCurrentDirectory();
}

/**
 * 全选当前目录内可导入的 JSON 文件。
 */
export function selectAll() {
  selectedFiles.value = availableFiles.value
    .filter(isJsonFile)
    .map((item) => item.RelativePath);
}

/**
 * 导入勾选的 JSON；多地图混选会拒绝，单地图不同则先确认切换。
 */
export async function confirmImportFiles() {
  try {
    const fileAccessBridge = chrome.webview.hostObjects.fileAccessBridge;

    const jsonFiles = selectedFiles.value.filter((filePath) => {
      const item = availableFiles.value.find((entry) => entry.RelativePath === filePath);
      return item && isJsonFile(item);
    });

    if (jsonFiles.length === 0) {
      Message.warning('请选择至少一个JSON文件');
      return;
    }

    const fileDataList = [];
    for (const filePath of jsonFiles) {
      try {
        const content = await fileAccessBridge.ReadFile(filePath);
        const data = JSON.parse(content);
        fileDataList.push({filePath, data});
      } catch (error) {
        console.error(`读取文件 ${filePath} 失败:`, error);
      }
    }

    const mapNames = [...new Set(fileDataList.map((item) => item.data.info.map_name || 'Teyvat'))];
    const needSwitchMap = mapNames.some((mapName) => mapName !== currentMapName.value);

    if (needSwitchMap && mapNames.length > 1) {
      Message.warning('选中的文件包含多个不同地图的脚本，请分批导入同一地图的脚本');
      return;
    } else if (needSwitchMap) {
      const targetMapName = mapNames[0];
      const mapDisplayName = MAPS[targetMapName]?.displayName || targetMapName;
      const currentMapDisplayName = MAPS[currentMapName.value].displayName;
      try {
        await new Promise((resolve, reject) => {
          Modal.confirm({
            title: '需要切换地图',
            content: `选中的脚本属于 ${mapDisplayName}，当前地图为 ${currentMapDisplayName}，需要切换地图后批量导入。`,
            okText: '确认切换',
            cancelText: '取消导入',
            onOk: () => resolve(),
            onCancel: () => reject(new Error('用户取消导入'))
          });
        });

        await switchMap(targetMapName);
      } catch (error) {
        console.log('用户取消批量导入');
        return;
      }
    }

    let successCount = 0;
    let errorCount = 0;

    for (const {filePath, data} of fileDataList) {
      try {
        await addImportedPolylineWithoutMapSwitch(data, filePath);
        successCount++;
      } catch (error) {
        console.error(`导入文件 ${filePath} 失败:`, error);
        errorCount++;
      }
    }

    showFileSelectModal.value = false;

    if (successCount > 0) {
      Message.success(`成功导入 ${successCount} 个路线文件`);
    }
    if (errorCount > 0) {
      Message.error(`${errorCount} 个文件导入失败`);
    }
  } catch (error) {
    console.error('导入文件失败:', error);
    Message.error('导入文件失败: ' + error.message);
  }
}

/**
 * 关闭文件选择弹窗并清空浏览状态。
 */
export function closeFileSelectModal() {
  showFileSelectModal.value = false;
  currentPath.value = '';
  pathHistory.value = [];
  selectedFiles.value = [];
}

/**
 * 通过宿主桥把路线写到原目录或当前目录。
 */
export async function saveToFileAccessBridge(data, fileName) {
  try {
    const fileAccessBridge = chrome.webview.hostObjects.fileAccessBridge;
    const json = JSONStringifyOrdered(data, 2);
    const safeFileName = fileName.replace(/[<>:"/\\|?*]/g, '_') + '.json';

    const currentPolyline = polylines.value[selectedPolylineIndex.value];
    let savePath = '';

    if (currentPolyline.savedPath) {
      const pathSeparator = currentPolyline.savedPath.includes('/') ? '/' : '\\';
      const lastSeparatorIndex = currentPolyline.savedPath.lastIndexOf(pathSeparator);
      const dirPath = lastSeparatorIndex !== -1
        ? currentPolyline.savedPath.substring(0, lastSeparatorIndex + 1)
        : '';

      savePath = dirPath + safeFileName;
      currentPolyline.savedPath = savePath;
    } else {
      const pathSeparator = currentPath.value.includes('/') ? '/' : '\\';
      savePath = currentPath.value
        ? `${currentPath.value}${pathSeparator}${safeFileName}`
        : safeFileName;
      currentPolyline.savedPath = savePath;
    }

    await fileAccessBridge.WriteFile(savePath, json);
    Message.success(`路线已保存到: ${savePath}`);
  } catch (error) {
    console.error('保存路线失败:', error);
    Message.error('保存路线失败: ' + error.message);
  }
}

/**
 * 按当前模式选择宿主桥导入或浏览器多文件导入。
 */
export function importPositions() {
  if (mode === 'single') {
    importFromFileAccessBridge();
  } else {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.multiple = true;
    input.onchange = (event) => {
      [...event.target.files].forEach((file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const data = JSON.parse(e.target.result);
          addImportedPolyline(data);
        };
        reader.readAsText(file);
      });
    };
    input.click();
  }
}
