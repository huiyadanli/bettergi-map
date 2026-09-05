/**
 * 地图路径编辑器的共享会话状态。
 *
 * 本模块只持有跨组件共享的响应式数据，不包含地图操作或文件 I/O。
 */
import {ref, computed} from 'vue';
import {CoordinateConverter} from '../utils/coordinateConverter';
import {MAPS} from '../config/mapConfig';
import {columnsBase, COMBAT_SCRIPT_KEY, defaultPointExtParams} from '../constants/editor';
import {loadLocal} from '../utils/storage';
import {isJsonFile} from '../utils/fileTypes';

// 构建模式：single 为 BGI 内嵌，其他为浏览器
export const mode = import.meta.env.VITE_MODE;

// 当前地图标识
export const currentMapName = ref('Teyvat');

// 当前地图的运行时配置
export const currentMapConfig = computed(() => MAPS[currentMapName.value]);

// 当前地图的坐标转换器
export const coordinateConverter = ref(new CoordinateConverter(MAPS.Teyvat));

// 当前底图像素宽
export const imageWidth = ref(0);

// 当前底图像素高
export const imageHeight = ref(0);

// Leaflet 地图实例
export const map = ref(null);

// 已加载的路线列表
export const polylines = ref([]);

// 当前选中的路线下标
export const selectedPolylineIndex = ref(0);

// 撤销重做快照栈
export const historyStack = ref([]);

// 当前历史指针
export const historyPointer = ref(-1);

// 是否还能撤销
export const canUndo = computed(() => historyPointer.value > 0);

// 是否还能重做
export const canRedo = computed(() => historyPointer.value < historyStack.value.length - 1);

// 添加/编辑点位弹窗中的 X
export const newPointX = ref(0);

// 添加/编辑点位弹窗中的 Y
export const newPointY = ref(0);

// 是否显示添加点位弹窗
export const showAddPointModal = ref(false);

// 新点位名称（当前创建逻辑未使用）
export const newPointName = ref('');

// 当前选中的点位下标
export const selectedPointIndex = ref(-1);

// 地图上的选中高亮标记
export const highlightMarker = ref(null);

// 地图点位 Hover 提示开关；首次使用默认开启，之后跟随本地偏好。
const storedRoutePointTooltipsEnabled = loadLocal('_routePointTooltipsEnabled');
export const routePointTooltipsEnabled = ref(storedRoutePointTooltipsEnabled !== false);

// fileAccessBridge 当前目录
export const currentPath = ref('');

// 目录浏览历史
export const pathHistory = ref([]);

// 当前目录条目
export const availableFiles = ref([]);

// 已勾选的文件相对路径
export const selectedFiles = ref([]);

// 是否显示文件选择弹窗
export const showFileSelectModal = ref(false);

// 导出弹窗中的作者列表
export const exportAuthors = ref([{name: '', links: ''}]);

// 导出弹窗中的版本号
export const exportVersion = ref('1.0');

// 导出弹窗中的描述
export const exportDescription = ref('');

// 是否显示导出弹窗
export const showExportModal = ref(false);

// 是否显示预设作者弹窗
export const showAuthorSelectModal = ref(false);

// 正在为第几行作者选择预设
export const selectedAuthorRowIndex = ref(-1);

// 本地保存的预设作者
export const preAuthors = ref((loadLocal('_preAuthors') || {}).preAuthors || [{name: '', links: '', def: false}]);

// 当前选中路线的浅拷贝视图，供表格绑定
export const selectedPolyline = computed(() => {
  const polyline = polylines.value[selectedPolylineIndex.value];
  return polyline ? {...polyline, positions: [...polyline.positions]} : {positions: []};
});

// 已选 JSON 文件数量
export const selectedJsonFileCount = computed(() => {
  return selectedFiles.value.filter((filePath) => {
    const item = availableFiles.value.find((entry) => entry.RelativePath === filePath);
    return item && isJsonFile(item);
  }).length;
});

// 当前目录 JSON 是否已全选
export const isAllSelected = computed(() => {
  const jsonFiles = availableFiles.value.filter((item) => isJsonFile(item));
  return jsonFiles.length > 0 && selectedJsonFileCount.value === jsonFiles.length;
});

// 点位表列定义；运行入口在开发页与 BetterGI 内保持一致。
export const columns = computed(() => [
  {title: '', dataIndex: 'drag', slotName: 'drag', width: 36, fixed: 'left'},
  ...columnsBase,
]);

// 战斗策略列表
export const combatScriptData = ref(loadLocal(COMBAT_SCRIPT_KEY) || []);

// 是否显示添加战斗策略弹窗
export const showAddCombatScript = ref(false);

// 是否显示战斗策略管理弹窗
export const showCombatScriptManagerModal = ref(false);

// 新战斗策略表单
export const newActionParams = ref({value: '', def: false});

// 当前编辑的点位扩展参数
export const pointExtParams = ref(Object.assign({}, defaultPointExtParams));

// 是否显示扩展参数弹窗
export const showPointExtConfig = ref(false);

// 路线其他设置表单
export const otherConfig = ref({
  commonTag: [],
  enableMonsterLootSplit: false,
  mapMatchMethod: ''
});

// 是否显示其他设置弹窗
export const showCommonTagManager = ref(false);

// 正在编辑其他设置的路线下标
export const polylineTagsSelectIndex = ref(-1);

// 是否显示路线合并面板
export const showRouteMergeModal = ref(false);
