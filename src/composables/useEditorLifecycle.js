/**
 * 编辑器启动和全局快捷键。
 *
 * 编排瓦片加载、地图初始化和宿主加点和快捷键，不包含具体编辑规则。
 */
import {onMounted, onUnmounted} from 'vue';
import {bindMapRouteHandlers, loadTileMeta, applyMapFromUrl, initMap} from './useMap';
import {addPolyline, handleMapPointChange, exposeAddNewPoint} from './useRoutes';
import {watchRouteHistory, saveCurrentRoute, undoStep, redoStep} from './useHistory';

/**
 * 处理保存、撤销和重做快捷键。
 */
function handleKeyDown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveCurrentRoute();
  }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
    e.preventDefault();
    undoStep();
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
    e.preventDefault();
    redoStep();
  }
}

/**
 * 在页面根组件中启动编辑器会话。
 */
export function useEditorLifecycle() {
  bindMapRouteHandlers({
    onPolylineCreate: addPolyline,
    onMapPointChange: handleMapPointChange,
  });
  watchRouteHistory();
  exposeAddNewPoint();

  // 页面挂载后加载瓦片、解析地址栏并创建地图
  onMounted(async () => {
    document.addEventListener('keydown', handleKeyDown);
    await loadTileMeta();
    applyMapFromUrl();
    initMap();
  });

  // 页面卸载时移除全局快捷键
  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeyDown);
  });
}
