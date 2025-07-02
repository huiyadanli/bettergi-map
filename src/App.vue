<script setup>
import { onMounted, ref, computed } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import { CoordinateConverter } from './utils/coordinateConverter';
import {Message, Modal} from '@arco-design/web-vue';
import {setPosition} from "leaflet/src/dom/DomUtil.js";


// 地图配置
const mapConfigs = {
  Teyvat: {
    gameMapRows: 13,
    gameMapCols: 18,
    gameMapUpRows: 5,
    gameMapLeftCols: 11,
    gameMapBlockWidth: 1024,
    mapImage: './1024_map.jpg',
    displayName: '提瓦特大陆',
  },
  TheChasm: {
    gameMapRows: 2,
    gameMapCols: 2,
    gameMapUpRows: 1,
    gameMapLeftCols: 1,
    gameMapBlockWidth: 1024,
    mapImage: './thechasm_1024_map.jpg',
    displayName: '层岩巨渊',
  },
  Enkanomiya: {
    gameMapRows: 3,
    gameMapCols: 3,
    gameMapUpRows: 1,
    gameMapLeftCols: 1,
    gameMapBlockWidth: 1024,
    mapImage: './enkanomiya_1024_map.jpg',
    displayName: '渊下宫',
  },
};

// 当前地图相关变量
const currentMapName = ref('Teyvat');
const currentMapConfig = computed(() => mapConfigs[currentMapName.value]);
const coordinateConverter = ref(new CoordinateConverter(currentMapConfig.value));
const mapImage = ref(currentMapConfig.value.mapImage);
const isMapLoaded = ref(false);


// 修改这一行
const imageWidth = ref(0);
const imageHeight = ref(0);
const map = ref(null);
const polylines = ref([]);
const selectedPolylineIndex = ref(0);

// 添加新的响应式变量
const newPointX = ref(0);
const newPointY = ref(0);
const showAddPointModal = ref(false);
const newPointName = ref('');
const selectedPointIndex = ref(-1);
const highlightMarker = ref(null);

// 导出
const exportAuthor = ref('');
const exportVersion = ref('1.0');
const exportDescription = ref('');
const showExportModal = ref(false);

//本地存储
const saveLocal = (k,v) => {
  localStorage.setItem("bgiMap"+k, JSON.stringify(v));
}
const loadLocal = (k) => {
  const  val=localStorage.getItem("bgiMap"+k);
  if(!val) return val;
  return JSON.parse(val) ;
}

onMounted(() => {
  const urlParams = new URLSearchParams(window.location.search);
  const mapParam = urlParams.get('map');

  if (mapParam && mapConfigs[mapParam]) {
    currentMapName.value = mapParam;
    currentMapConfig.value = mapConfigs[mapParam];
    coordinateConverter.value = new CoordinateConverter(currentMapConfig.value);
    mapImage.value = currentMapConfig.value.mapImage;
  }

  // Remove the map parameter from the URL
  urlParams.delete('map');
  let p = urlParams.toString();
  let newUrl = `${window.location.pathname}?${p}`;
  if (p.length === 0){
    newUrl = `${window.location.pathname}`;
  }
  window.history.replaceState(null, '', newUrl);

  loadMapImageAndInit(mapImage.value);
});

function loadMapImageAndInit(mapImageSrc) {
  isMapLoaded.value = false; // 地图加载开始
  const img = new Image();
  img.onload = function () {
    imageWidth.value = this.width;
    imageHeight.value = this.height;
    initMap();
    isMapLoaded.value = true; // 地图加载完成
  };
  img.src = mapImageSrc;
}

function initMap() {
  // Check if the map instance already exists
  if (map.value) {
    map.value.remove(); // Destroy the existing map instance
    map.value = null;   // Reset the map reference
  }

  map.value = L.map('map', {
    attributionControl: false,
    crs: L.CRS.Simple,
    minZoom: -4,  // 允许缩小
    maxZoom: 5    // 允许放大
  });

  const bounds = [[0, 0], [imageHeight.value, imageWidth.value]];
  L.imageOverlay(mapImage.value, bounds).addTo(map.value);

  map.value.fitBounds(bounds);
  map.value.setZoom(0);

  // 初始化 Geoman 控件
  map.value.pm.addControls({
    position: 'topleft',
    drawMarker: false,
    drawCircleMarker: false,
    drawPolygon: false,
    drawRectangle: false,
    drawCircle: false,
    drawText: false,
    drawPolyline: true,
    editMode: true,
    dragMode: false,
    cutPolygon: false,
    removalMode: false,
    rotateMode: false,
  });

  map.value.pm.setLang("zh");

  // 设置绘制折线的颜色为红色
  map.value.pm.setGlobalOptions({
    pathOptions: {
      color: 'red',
      weight: 3
    }
  });

  map.value.on('pm:create', (e) => {
    if (e.layer instanceof L.Polyline) {
      addPolyline(e.layer);
      // 为新创建的折线添加事件监听
      e.layer.on("pm:edit", handleMapPointChange);
    }
  });
}

// 切换地图
function switchMap(mapName) {
  return new Promise((resolve) => {
    changeBgiMapSettingsName(mapName);

    currentMapName.value = mapName;
    currentMapConfig.value = mapConfigs[mapName];
    coordinateConverter.value = new CoordinateConverter(currentMapConfig.value);
    mapImage.value = currentMapConfig.value.mapImage;

    // 清空地图上的折线和点位
    polylines.value = [];
    if (map.value) {
      map.value.eachLayer((layer) => {
        if (layer instanceof L.Polyline || layer instanceof L.Marker) {
          map.value.removeLayer(layer);
        }
      });
    }

    // 重新加载地图
    loadMapImageAndInit(mapImage.value);

    // 使用轮询检查地图是否加载完成
    const checkMapLoaded = () => {
      if (isMapLoaded.value) {
        resolve();
      } else {
        requestAnimationFrame(checkMapLoaded); // 继续检查
      }
    };

    checkMapLoaded(); // 开始检查
  });
}

function changeBgiMapSettingsName(mapName) {
  try {
    const mapEditorWebBridge = chrome.webview.hostObjects.mapEditorWebBridge;
    const jsonString = mapEditorWebBridge.ChangeMapName(mapName);
    return JSON.parse(jsonString);
  } catch (e) {
    console.log("切换bgi地图配置失败，如果是在线版，请无视这个提示。");
  }
}

function removeHighlightMarker() {
  if (highlightMarker.value) {
    map.value.removeLayer(highlightMarker.value);
    highlightMarker.value = null;
  }
}

function handleMapPointChange(e) {
  removeHighlightMarker();
  updatePolyline(e.target);
}

// 保持原有的 addPolyline 函数不变
function addPolyline(layer, name = "未命名路径") {
  const newPolyline = {
    name: name,
    layer: layer,
    positions: layer.getLatLngs().map((latlng, index) => {
      const gamePos = coordinateConverter.value.main1024ToGame(latlng.lng, latlng.lat);
      return {
        id: index + 1,
        action: "",
        move_mode: "walk",
        type: index === 0 ? "teleport" : "path",
        x: gamePos.x,
        y: gamePos.y,
        action_params:""
      };
    }),
    info: { // 初始化 info 属性
      name: name,
      author: '',
      version: '1.0',
      description: ''
    }
  };
  polylines.value.push(newPolyline);
  selectedPolylineIndex.value = polylines.value.length - 1;
  selectPolyline(selectedPolylineIndex.value);
}

// 处理导入的数据
async function addImportedPolyline(importedData) {
  const mapName = importedData.info.map_name || 'Teyvat'; // 默认地图为 Teyvat
  if (mapName !== currentMapName.value && mapConfigs[mapName]) {
    await switchMap(mapName); // 仅在地图不一致时切换
  }
  const positions = importedData.positions.map((pos) => {
    const main1024Pos = coordinateConverter.value.gameToMain1024(pos.x, pos.y);
    return L.latLng(main1024Pos.y, main1024Pos.x);
  });
  const layer = L.polyline(positions, {
    color: 'red',
    weight: 3,
  }).addTo(map.value);
  layer.on('pm:edit', handleMapPointChange);

  const newPolyline = {
    name: importedData.info.name,
    tags: importedData.info.tags || [],
    enable_monster_loot_split:!!importedData.info.enable_monster_loot_split,
    layer: layer,
    positions: importedData.positions.map((pos, index) => ({
      id: index + 1,
      x: pos.x,
      y: pos.y,
      action: pos.action || '',
      move_mode: pos.move_mode || 'walk',
      action_params: pos.action_params,
      type: pos.type || 'path',
      point_ext_params: pos.point_ext_params || undefined
    })),
    info: importedData.info,
  };
  polylines.value.push(newPolyline);
  selectedPolylineIndex.value = polylines.value.length - 1;
  selectPolyline(selectedPolylineIndex.value);
}

// 修改 importPositions 函数
function importPositions() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.multiple = true;
  input.onchange = (event) => {
    [...event.target.files].forEach(file=>{
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = JSON.parse(e.target.result);
        addImportedPolyline(data);
      };
      reader.readAsText(file);
    })

  };
  input.click();
}

// 添加重命名函数
function renamePolyline(index, newName) {
  polylines.value[index].name = newName;
}

function updatePolyline(layer) {
  const index = polylines.value.findIndex(p => p.layer === layer);
  if (index !== -1) {
    const currentPositions = polylines.value[index].positions;
    const newLatLngs = layer.getLatLngs();

    if (currentPositions.length === newLatLngs.length) {
      // 如果长度没有变化，直接更新对应索引下的 x, y 数据
      currentPositions.forEach((pos, idx) => {
        const gamePos = coordinateConverter.value.main1024ToGame(newLatLngs[idx].lng, newLatLngs[idx].lat);
        pos.x = gamePos.x;
        pos.y = gamePos.y;
      });
    } else {
      // 如果长度发生变化，进行匹配更新
      const updatedPositions = newLatLngs.map((latlng, idx) => {
        const gamePos = coordinateConverter.value.main1024ToGame(latlng.lng, latlng.lat);
        const existingPosition = currentPositions.find(pos => pos.x === gamePos.x && pos.y === gamePos.y);
        return {
          ...existingPosition, // 保留原有数据
          id: idx + 1,
          x: gamePos.x,
          y: gamePos.y
        };
      });
      polylines.value[index].positions = updatedPositions;
    }
  }
}
let preAuthor=(loadLocal("_preAuthor") || {}).preAuthor;
function exportPositions(index) {
  const polyline = polylines.value[index];
  // 检查 polyline.info 是否存在
  const info = polyline.info || {};
  exportAuthor.value = info.author|| preAuthor || '' ; // 回填作者信息
  exportVersion.value = info.version || ''; // 回填版本信息
  showExportModal.value = true;
  selectedPolylineIndex.value = index;
}

function handleExport() {
  const polyline = polylines.value[selectedPolylineIndex.value];
  const data = {
    info: {
      name: polyline.name,
      type: "collect",
      author: exportAuthor.value, // 使用用户输入的作者信息
      version: exportVersion.value, // 使用用户输入的版本信息
      description: exportDescription.value, // 添加描述信息
      map_name: currentMapName.value, // 添加地图名字
      bgi_version: import.meta.env.VITE_BGI_VERSION // 添加BGI版本信息
      ,tags:polyline.tags || []
      ,last_modified_time:Date.now() //导出时间
      ,enable_monster_loot_split:!!polyline.enable_monster_loot_split //区分怪物拾取
      
    },
    positions: polyline.positions // 已经是游戏坐标，无需转换
  };
  if (!(polyline.info && polyline.info.author)){
    preAuthor = exportAuthor.value;
    saveLocal("_preAuthor",{preAuthor})
  }
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${polyline.name}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showExportModal.value = false;
}

const selectedPolyline = computed(() => {
  const polyline = polylines.value[selectedPolylineIndex.value];
  return polyline ? { ...polyline, positions: [...polyline.positions] } : { positions: [] };
});

function selectPolyline(index) {
  selectedPolylineIndex.value = index;
  map.value.fitBounds(polylines.value[index].layer.getBounds());
  map.value.setZoom(2);
}

function deletePolyline(index) {
  Modal.confirm({
    title: '确认删除',
    content: '确定要删除该路线吗？此操作不可撤销。',
    okText: '删除',
    okButtonProps: { status: 'danger' },
    cancelText: '取消',
    onOk: () => {
      map.value.removeLayer(polylines.value[index].layer);
      polylines.value.splice(index, 1);
      if (selectedPolylineIndex.value >= polylines.value.length) {
        selectedPolylineIndex.value = Math.max(0, polylines.value.length - 1);
      }
    }
  });
}

function updateMapFromTable(polylineIndex, positionIndex) {
  const polyline = polylines.value[polylineIndex];
  const position = polyline.positions[positionIndex];
  const main1024Pos = coordinateConverter.value.gameToMain1024(position.x, position.y);
  const latlngs = polyline.layer.getLatLngs();
  latlngs[positionIndex] = L.latLng(main1024Pos.y, main1024Pos.x);
  polyline.layer.setLatLngs(latlngs);
}

function updatePosition(polylineIndex, positionIndex, key, value) {
  const polyline = polylines.value[polylineIndex];
  polyline.positions[positionIndex][key] = value;
  updateMapFromTable(polylineIndex, positionIndex);
}

// 添加动作选项
const actionOptions = [
  { label: '无', value: '' },
  { label: '战斗', value: 'fight' },
  { label: '简易策略脚本', value: 'combat_script' },
  { label: '纳西妲长E收集', value: 'nahida_collect' },
  { label: '下落攻击', value: 'stop_flying' },
  { label: '强制传送', value: 'force_tp' },
  { label: '四叶印', value: 'up_down_grab_leaf' },
  { label: '挖矿', value: 'mining' },
  { label: '钓鱼', value: 'fishing' },
  { label: '设置时间', value: 'set_time'},
  { label: '在附近拾取', value: 'pick_around' },
  { label: '水元素力采集', value: 'hydro_collect' },
  { label: '雷元素力采集', value: 'electro_collect' },
  { label: '风元素力采集', value: 'anemo_collect' },
  { label: '火元素力采集', value: 'pyro_collect' },
  { label: '输出日志', value: 'log_output' },
  { label: '退出重新登录', value: 'exit_and_relogin' },
];


const actionOptionsTree = [
  { label: '无', value: '' },
  { label: '战斗', value: 'fight' },
  { label: '简易策略脚本', value: 'combat_script' },
  { label: '纳西妲长E收集', value: 'nahida_collect' },
  { label: '下落攻击', value: 'stop_flying' },
  { label: '强制传送', value: 'force_tp' },
  { label: '四叶印', value: 'up_down_grab_leaf' },
  { label: '挖矿', value: 'mining' },
  { label: '钓鱼', value: 'fishing' },

  { label: '在附近拾取', value: 'pick_around' },
  {
    label: '元素力采集',
    value: 'element',
    children: [
      { label: '水元素力采集', value: 'hydro_collect' },
      { label: '雷元素力采集', value: 'electro_collect' },
      { label: '风元素力采集', value: 'anemo_collect' },
      { label: '火元素力采集', value: 'pyro_collect' },
    ]
  },
  {
    label: '其他',
    value: 'system',
    children: [
      { label: '输出日志', value: 'log_output' },
      { label: '退出重新登录', value: 'exit_and_relogin' },
      { label: '设置时间', value: 'set_time'},
    ]
  }
];

function handleChange(newData) {
  const polyline = polylines.value[selectedPolylineIndex.value];

  // 更新位置数据
  polyline.positions = newData.map((item, index) => ({
    ...item,
    id: index + 1
  }));

  // 更新地图上的折线
  const latlngs = newData.map(pos => {
    const main1024Pos = coordinateConverter.value.gameToMain1024(pos.x, pos.y);
    return L.latLng(main1024Pos.y, main1024Pos.x);
  });
  polyline.layer.setLatLngs(latlngs);
}
function moreSelect(v){
  v.onclick.call(null,v.record,v.rowIndex);
}
function copyPosition(record,rowIndex){
  const polyline = polylines.value[selectedPolylineIndex.value];
  polyline.positions.splice(rowIndex, 0,Object.assign({},record,{locked:false}));
  updateMapFromPolyLine(polyline);
}
function lockRowIndex(record,rowIndex){
  polylines.value[selectedPolylineIndex.value].positions.forEach((item,index)=>{item.locked=false;});
  record.locked=true;
}
function unlockRowIndex(record,rowIndex){
  record.locked=false;
}

const setPositionRowClass=(record,rowIndex)=>{

  if (record.locked){
    return "locked";
  }
  return "";
}
// 添加删除点位的函数
function deletePosition(index) {
  const polyline = polylines.value[selectedPolylineIndex.value];
  polyline.positions.splice(index, 1);
  updateMapFromPolyLine(polyline);

}
// 更新地图上的折线
const updateMapFromPolyLine=(polyline)=>{
  //更新序号
  polyline.positions.forEach((item,index)=>item.id=index+1);
  //更新折线图
  const latlngs = polyline.positions.map(pos => {
    const main1024Pos = coordinateConverter.value.gameToMain1024(pos.x, pos.y);
    return L.latLng(main1024Pos.y, main1024Pos.x);
  });
  polyline.layer.setLatLngs(latlngs);
}

function openAddPointModal() {
  showAddPointModal.value = true;
  newPointX.value = 0;
  newPointY.value = 0;
  newPointName.value = '';
}
function clearPoints(){
  Modal.confirm({
    title: '请确认',
    content: '确定要清除所有点位吗，此操作不可逆？',
    okText: '确认',
    cancelText: '取消',
    onOk: () => {
      if (polylines.value[selectedPolylineIndex.value]){
        polylines.value[selectedPolylineIndex.value].positions=[];
      }
    },
    onCancel: () => {

    },
  });

}
function addNewPoint(x, y) {
  const main1024Pos = coordinateConverter.value.gameToMain1024(x, y);
  const newPoint = {
    id: 1,
    x: x,
    y: y,
    type: 'path',
    move_mode: 'walk',
    action: '',
    action_params:''
  };

  if (selectedPolylineIndex.value === -1 || polylines.value.length === 0) {
    // 如果没有选中的路径或没有路径，创建新路径
    const layer = L.polyline([L.latLng(main1024Pos.y, main1024Pos.x)], {
      color: 'red',
      weight: 3
    }).addTo(map.value);
    map.value.setZoom(2);
    layer.on("pm:edit", handleMapPointChange);
    addPolyline(layer, "未命名路径");  // 使用默认名称 "未命名路径"
  } else {
    // 添加新点位到现有路径
    const polyline = polylines.value[selectedPolylineIndex.value];
    newPoint.id = polyline.positions.length + 1;
    if(polyline.positions.length===0){
      newPoint.type="teleport";
    }
    let lockedIndex=polyline.positions.findIndex(item=>item.locked);
    if (lockedIndex>-1){
      polyline.positions.splice(lockedIndex,0,newPoint);
    }else{
      polyline.positions.push(newPoint);
    }


    // 更新地图上的折线
    updateMapFromPolyLine(polyline)
/*    const latlngs = polyline.layer.getLatLngs();
    latlngs.push(L.latLng(main1024Pos.y, main1024Pos.x));
    polyline.layer.setLatLngs(latlngs);*/
  }
}

window.addNewPoint = (x, y) => {
  addNewPoint(x, y);
};


function handleAddPointFromModal() {
  addNewPoint(newPointX.value, newPointY.value);
  showAddPointModal.value = false;
}

function selectPoint(record, rowIndex) {
  // 清除之前的高亮标记
  if (highlightMarker.value) {
    map.value.removeLayer(highlightMarker.value);
    highlightMarker.value = null;
  }

  // 高亮选中的点
  const main1024Pos = coordinateConverter.value.gameToMain1024(record.x, record.y);

  // 创建新的高亮标记
  highlightMarker.value = L.marker([main1024Pos.y, main1024Pos.x], {
    icon: L.divIcon({
      className: 'highlight-marker',
      html: '<div style="background-color: #ff3333; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    })
  }).addTo(map.value);

  selectedPointIndex.value = rowIndex;

  // 将地图视图居中到选中的点
  map.value.setView([main1024Pos.y, main1024Pos.x], map.value.getZoom());
}


//战斗策略管理
console.log('vue')
const combatScriptKey="_combatScriptData";
const getCombatScriptByLocal=()=>{
  return (loadLocal(combatScriptKey)||[]);
}
const showAddCombatScript =ref(false);
const combatScriptData=ref(getCombatScriptByLocal());
const showCombatScriptManagerModal=ref(false);
const combatScriptManagerModal=()=>{
  showCombatScriptManagerModal.value=true;
}

const saveCombatScript=()=>{
  //const val=[{value:"钟离 e(hold);坎蒂丝 e(hold);雷泽 e(hold);卡齐娜 e;凝光 attack(0.2),attack(0.2),attack(0.2),attack(0.2),attack(0.2)",def:true}];
 // saveLocal(combatScriptKey,val);
  //combatScriptData.value=getCombatScriptByLocal();

}
//默认战斗策略赋值
const actionChange = (record) => {
  // 确保 action 字段值是最终叶子节点的值
  if (Array.isArray(record.action)) {
    record.action = record.action[record.action.length - 1];
  }
  if (record.action === "combat_script"){
    record.action_params=(combatScriptData.value.find(item=>item.def) || {}).value;
  }else{
    record.action_params="";
  }
}
const newActionParams=ref({value:"",def:false});
const addCombatScript=()=>{
 const newActionParamsTemp=Object.assign({},newActionParams.value);
  if (combatScriptData.value.find(item=>item.value === newActionParamsTemp.value )){
    alert("不要重复添加！");
  }else{
     const temp=combatScriptData.value;
     //只能一个默认
     if (newActionParamsTemp.def){
       temp.forEach((item,index)=>{
         item.def = false;
       })
     }
    newActionParams.value={value:"",def:false};
    combatScriptData.value=[...temp,newActionParamsTemp];
    saveLocal(combatScriptKey,combatScriptData.value);

  }

}
const deleteCombatScriptPosition=index=>{
  combatScriptData.value.splice(index,1);
  saveLocal(combatScriptKey,combatScriptData.value);
}
const changeCombatScriptDef=(rowindex)=>{
  if (combatScriptData.value[rowindex].def){
    combatScriptData.value.forEach((item,index)=>{
      if (index!==rowindex){
        item.def=false;
      }
    })
  }
  saveLocal(combatScriptKey,combatScriptData.value);
}
const combatScriptColumns = [
  {
    title: '策略参数',
    dataIndex: 'value',
  },
  {
    title: '是否默认',
    dataIndex: 'def',
    slotName:'def'
  },
  {
    title: '操作',
    dataIndex: 'operations',
    slotName:'operations'
  }]

//点位扩展参数 
//monster_tag  normal,elite,legendary
//未识别，路径过远，所有
//unrecognized,pathTooFar,all
//取上一个识别到的点位置，大地图识别，特定时间到达
//previousDetectedPoint,mapRecognition,scheduledArrival
const defaultPointExtParams={misidentification:{type:["unrecognized"],handling_mode:"previousDetectedPoint",arrival_time:0},description:"",monster_tag:""};

const pointExtParams=ref(Object.assign({},defaultPointExtParams));
const showPointExtConfig=ref(false);
let curPointRecord;
const  editPointExtParams = (record,rowIndex)=>{
  pointExtParams.value = record.point_ext_params || Object.assign({},JSON.parse(JSON.stringify(defaultPointExtParams)));
  showPointExtConfig.value = true;
  curPointRecord=record;
}
const  savePointExtParams = ()=>{
 if (curPointRecord){
   curPointRecord.point_ext_params= JSON.parse(JSON.stringify(pointExtParams.value));
 }

}
const  deletePointExtParams = (record,rowIndex)=>{
  delete record.point_ext_params;
}


//标签管理
const commonTagKey="_commonTag";
//const commonTag = ref([]);
const otherConfig = ref({
  commonTag:[]
  ,enableMonsterLootSplit:false
})
const showCommonTagManager = ref(false);
const polylineTagsSelectIndex=ref(-1);
const commonTagManagerModal = (index)=>{
  otherConfig.value.commonTag = polylines.value[index].tags || [];
  otherConfig.value.enableMonsterLootSplit= !!polylines.value[index].enable_monster_loot_split;
  polylineTagsSelectIndex.value=index;
  showCommonTagManager.value = true;
}
const saveCommonTagManagerModal = ()=>{
  polylines.value[polylineTagsSelectIndex.value].tags=otherConfig.value.commonTag;
  polylines.value[polylineTagsSelectIndex.value].enable_monster_loot_split = otherConfig.value.enableMonsterLootSplit;
}
const commonTagChange = () => {
  let tags=otherConfig.value.commonTag;
  const newTags=[];
  for (let i = 0; i < tags.length; i++) {
    let tag=tags[i];
    tag=tag.replaceAll("，",",");
    tag.split(",").filter(t=>t).forEach(t=>newTags[newTags.length]=t);
  }
  otherConfig.value.commonTag=newTags;
}

//合并
const mergedPolyline=()=>{

  const newPos=[];
  polylines.value.forEach(polyline=>{
    polyline.positions.forEach(p=>{
      newPos[newPos.length]=p;
    });
  });
  polylines.value[0].positions=newPos;
  for (let i = 1; i < polylines.value.length; i++) {
    map.value.removeLayer(polylines.value[i].layer);
  }
  polylines.value=[polylines.value[0]];
  updateMapFromPolyLine(polylines.value[0]);
  selectPolyline(0);
}
//拆分
const splitPolyline=()=>{

  const  positions=polylines.value[selectedPolylineIndex.value].positions;
  const result = [];

  let currentGroup = [];

  for (const position of positions) {
    if (position.type === 'teleport') {
      if (currentGroup.length > 0) {
        result.push(currentGroup);
        currentGroup = [];
      }
      currentGroup.push(position);
    } else {
      currentGroup.push(position);
    }
  }

  if (currentGroup.length > 0) {
    result.push(currentGroup);
  }


  polylines.value[0].positions=result[0];
  updateMapFromPolyLine(polylines.value[0]);
  selectPolyline(0);
  for (let i = 1; i < result.length; i++) {
    let pl=Object.assign({},polylines.value[0],{positions:result[i]});
    delete pl.layer;
    pl=JSON.parse(JSON.stringify(pl));
    pl.name = pl.name+"_"+(i+1);
    addSpliePolyline(pl);
    updateMapFromPolyLine(polylines.value[i]);
    selectPolyline(i);
  }

}
function addSpliePolyline(importedData) {
  const layer = L.polyline(importedData.positions.map((pos) => {
    const main1024Pos = coordinateConverter.value.gameToMain1024(pos.x, pos.y);
    return L.latLng(main1024Pos.y, main1024Pos.x);
  }), {
    color: 'red',
    weight: 3,
  }).addTo(map.value);
  layer.on('pm:edit', handleMapPointChange);
  importedData.layer=layer;
  polylines.value.push(importedData);
}
const showEditPointModal=ref(false);
const curUpdatePosition=ref({});
const curUpdatrowIndex=ref({});

const editPointModal=(record,rowIndex)=>{
  newPointX.value=record.x;
  newPointY.value=record.y;
  curUpdatePosition.value=record;
  curUpdatrowIndex.value=rowIndex;
  showEditPointModal.value = true;
  selectPoint(record,rowIndex);
};
const updatePointModal=()=>{
  curUpdatePosition.value.x=newPointX.value;
  curUpdatePosition.value.y=newPointY.value;
  showEditPointModal.value = false;
  updateMapFromTable(selectedPolylineIndex.value,curUpdatrowIndex.value);
  selectPoint(curUpdatePosition.value,curUpdatrowIndex.value);
};
function formatNumber(num) {
  // 保留两位小数，但去掉多余的 0
  let str = num.toFixed(2);
  if (str.endsWith('.00')) {
    return str.slice(0, -3);
  } else if (str.endsWith('0')) {
    return str.slice(0, -1);
  } else {
    return str;
  }
}
</script>

<template>
  <a-layout class="layout">
    <a-layout-sider width="45%" :resize-directions="['right']">
      <div id="map"></div>
    </a-layout-sider>
    <a-layout-content>
      <a-space direction="vertical" size="large" fill>
        <a-card title="路径列表" style="max-height: 400px;overflow-y: auto">
          <template #extra>
            <a-space>
              <!-- 地图选择框 -->
              <a-select v-model="currentMapName" @change="switchMap" style="width: 160px; margin-right: 10px">
                <a-option v-for="(config, name) in mapConfigs" :key="name" :value="name">
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
                    style="width: 150px;"
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
        <a-card :title="`点位信息 - ${selectedPolyline.name || '未选择路径'}`">
          <a-table
            :columns="columns"
            :data="selectedPolyline.positions"
            :pagination="false"
            :draggable="{ type: 'handle', width: 40 }"
            @change="handleChange"
            @row-click="selectPoint"
            :row-class="setPositionRowClass"
          >
            <template #drag-handle-icon>
              <icon-drag-dot-vertical />
            </template>
            <template #id="{ record, rowIndex }" >
              <span :style="{color:(record.point_ext_params?'blue':'')}">{{record.id}}</span>
            </template>
            <template #xy="{ record, rowIndex }" >
              <a-button type="text" @click="editPointModal(record,rowIndex)">{{formatNumber(record.x)}}, {{formatNumber(record.y)}}</a-button>
            </template>
           <template #x="{ record, rowIndex }">
              <a-input-number
                v-model="record.x"
                @change="(value) => updatePosition(selectedPolylineIndex, rowIndex, 'x', value)"
              />
            </template>
            <template #y="{ record, rowIndex }">
              <a-input-number
                v-model="record.y"
                @change="(value) => updatePosition(selectedPolylineIndex, rowIndex, 'y', value)"
              />
            </template>
            <template #move_mode="{ record }">
              <a-select v-model="record.move_mode">
                <a-option value="walk">行走</a-option>
                <a-option value="dash">间歇冲刺</a-option>
                <a-option value="run">持续奔跑</a-option>
                <a-option value="fly">飞行</a-option>
                <a-option value="swim">游泳</a-option>
                <a-option value="climb">攀爬</a-option>
                <a-option value="jump">跳跃</a-option>
              </a-select>
            </template>
            <template #action="{ record }">
<!--              <a-select v-model="record.action" @change="actionChange(record)" style="min-width: 120px">
                <a-option v-for="option in actionOptions" :key="option.value" :value="option.value" >
                  {{ option.label }}
                </a-option>
              </a-select>-->
              <a-cascader
                  v-model="record.action"
                  :options="actionOptionsTree"
                  placeholder="请选择动作"
                  @change="actionChange(record)"
                  style="min-width: 120px"
                  :field-names="{ label: 'label', value: 'value', children: 'children' }"
              />
              <a-input allow-clear v-if="record.action==='log_output'" v-model="record.action_params" :disabled="record.type === 'teleport'" placeholder="录入需要输出的日志" strict />
              <a-input allow-clear v-if="record.action==='stop_flying'" v-model="record.action_params"  placeholder="录入下落攻击等待时间(毫秒)" strict />
              <a-input allow-clear v-if="record.action==='set_time'" v-model="record.action_params"  placeholder="录入需要设置的时间 HH:MM" strict />
              <a-auto-complete allow-clear :data="combatScriptData" v-if="record.action==='combat_script'" v-model="record.action_params"  placeholder="录入或清空后选择策略" strict />

            </template>
            <template #type="{ record }">
              <a-select v-model="record.type">
                <a-option value="teleport">传送</a-option>
                <a-option value="path">途经</a-option>
                <a-option value="target">目标</a-option>
                <a-option value="orientation">朝向</a-option>
              </a-select>
            </template>
            <template #operations="{ record, rowIndex }">
              <a-button
                @click="deletePosition(rowIndex)"
                status="danger"
                size="small"
              >
                删除
              </a-button>


              <a-dropdown @select="moreSelect" >
                <a-button style="margin-left: 10px"  status="success" >更多</a-button>
                <template #content>
                  <a-doption :value="{ onclick: copyPosition,record,rowIndex}">复制</a-doption>
                  <a-doption :value="{ onclick: editPointExtParams,record,rowIndex}" >{{(record.point_ext_params?"修改":"新增") + "扩展参数"}}</a-doption>
                  <a-doption :value="{ onclick: deletePointExtParams,record,rowIndex}"  v-if="record.point_ext_params">清除扩展参数</a-doption>
                  <a-doption :value="{ onclick: lockRowIndex,record,rowIndex}" v-if="!record.locked">锁定行</a-doption>
                  <a-doption :value="{ onclick: unlockRowIndex,record,rowIndex}"  v-if="record.locked">解锁行</a-doption>
                </template>
              </a-dropdown>
              <sapn style="color:red"  v-if="record.locked">↑↑↑</sapn>
            </template>
          </a-table>

          <template #extra>
            <a-button @click="clearPoints" type="primary" size="small" >清空</a-button>
            <a-popconfirm  content="是否确认合并！"  @ok="mergedPolyline" okText="确认" cancelText="关闭">
              <a-button  type="primary" style="margin-left: 20px;" size="small" v-if="polylines.length > 1">合并</a-button>
            </a-popconfirm>
            <a-popconfirm  content="是否确认按传送点进行拆分！"  @ok="splitPolyline" okText="确认" cancelText="关闭">
              <a-button  type="primary" style="margin-left: 20px;" size="small" v-if="polylines.length == 1  && polylines[selectedPolylineIndex].positions.filter(item=>item.type=='teleport').length>1">拆分</a-button>
            </a-popconfirm>

            <a-button @click="combatScriptManagerModal" type="primary" style="margin-left: 20px;" size="small">战斗策略管理</a-button>
            <a-button @click="openAddPointModal" type="primary" size="small" style="margin-left: 20px;">添加点位</a-button>
          </template>
        </a-card>
      </a-space>
    </a-layout-content>
  </a-layout>
  <!-- 战斗策略管理 -->
  <!-- 添加战斗策略 -->
  <a-modal
      v-model:visible="showPointExtConfig"
      title="扩展参数"
      @ok="savePointExtParams"
      @cancel="showPointExtConfig = false"
      :width="800"
  >
    <a-form size="mini">
      <a-row :gutter="24">
        <a-col :span="24">
          <a-form-item label="怪物标签：" size="mini"  tooltip="为此点位打上标签，后续可能根据怪物种类决定是否拾取设置等逻辑。">
            <a-select v-model="pointExtParams.monster_tag" allow-clear> 
              <a-option value="normal">小怪</a-option>
              <a-option value="elite">精英</a-option>
              <a-option value="legendary">传奇</a-option>
            </a-select>
          </a-form-item>
        </a-col>

      </a-row>
      <a-row :gutter="24">
        <a-col :span="24">
          <a-form-item label="异常识别：" size="mini" :content-flex="false" :merge-props="false" allow-clear  tooltip="当遇到点位无法识别时，用其他方式来解决无法识别的情况，编辑器如果无法识别点位，可以用编辑线的方式加点位。">

            <a-space direction="vertical" fill>
              <a-form-item field="misidentification.type" label="类型" tooltip="当小地图特征点比较少时，会出现点位无法识别或识别到其他位置的问题，
              此选项决定在什么情况下处理。
              未识别：算出坐标为0，即明面意思。
              路径过远：识别到其他的坐标，从而算出路径过远。">
                <a-select v-model="pointExtParams.misidentification.type" allow-clear multiple>
                  <a-option value="unrecognized">未识别</a-option>
                  <a-option value="pathTooFar">路径过远</a-option>
                </a-select>
              </a-form-item>
              <a-row :gutter="8">
                <a-col :span="12">
                  <a-form-item field="misidentification.handling_mode" label="处理方式"  label-col-flex="100px" tooltip="
取上一个识别到的点位置:即当未识别时，拿上一次能正确识别的点。
大地图识别：即当未识别时，打开大地图，取中心点坐标，当中心点也识别不到时，取上一个识别到的点位。
特定时间到达：自行估算到达时间，不会尝试获取从小地图获取坐标，适用于纯平地，最好时最后一个点位。
">
                    <a-select v-model="pointExtParams.misidentification.handling_mode" allow-clear>
                      <a-option value="previousDetectedPoint">取上一个识别到的点位置</a-option>
                      <a-option value="mapRecognition">大地图识别</a-option>
<!--                      <a-option value="scheduledArrival">特定时间到达</a-option>-->
                    </a-select>
                  </a-form-item>
                </a-col>
                <a-col :span="12">
                  <a-form-item field="misidentification.arrival_time" >
                    <a-input-number v-model="pointExtParams.misidentification.arrival_time" v-if="pointExtParams.misidentification.handling_mode === 'scheduledArrival'" placeholder="毫秒" class="input-demo" :min="0" allow-clear/>
                  </a-form-item>
                </a-col>
              </a-row>
            </a-space>
          </a-form-item>
        </a-col>
      </a-row>
      <a-row :gutter="24">
        <a-col :span="24">
          <a-form-item field="description" label="描述：">
            <a-textarea v-model="pointExtParams.description" placeholder="请输入描述" :auto-size="{ minRows: 3, maxRows: 5 }" />
          </a-form-item>
        </a-col>
      </a-row>




      
<!--      <a-form-item label="策略参数">
        <a-input v-model="pointExtParams.enable"  allow-clear />
      </a-form-item>
      <a-form-item   label="是否默认">
        <a-checkbox :value="true" v-model="pointExtParams.def"></a-checkbox>
      </a-form-item>-->
    </a-form>
  </a-modal>
  <a-modal
      v-model:visible="showCombatScriptManagerModal"
      title="战斗策略管理"
      @ok="saveCombatScript"
      @cancel="showCombatScriptManagerModal = false"
      width="50%" height="50%"
      hideCancel
      okText="关闭"
  >

    <a-space direction="vertical" size="large" fill>
      <a-card >

        <a-table :columns="combatScriptColumns" :data="combatScriptData"  :pagination="false">
          <template #def="{ record, rowIndex }">
            <a-checkbox :value="true" v-model="record.def"  @change="changeCombatScriptDef(rowIndex)"></a-checkbox>
          </template>
          <template #operations="{ record, rowIndex }">
            <a-button
                @click="deleteCombatScriptPosition(rowIndex)"
                status="danger"
                size="small"
            >
              删除
            </a-button>
          </template>

        </a-table>
        <template #extra>
          <a-button @click="showAddCombatScript = true" type="primary" size="small" style="margin-left: 20px;">添加</a-button>
        </template>
      </a-card>
    </a-space>

  </a-modal>
  <!-- 添加战斗策略 -->
  <a-modal
      v-model:visible="showAddCombatScript"
      title="添加战斗策略"
      @ok="addCombatScript"
      @cancel="showAddCombatScript = false"
  >
    <a-form >
      <a-form-item label="策略参数">
        <a-input v-model="newActionParams.value"  allow-clear />
      </a-form-item>
      <a-form-item   label="是否默认">
        <a-checkbox :value="true" v-model="newActionParams.def"></a-checkbox>
      </a-form-item>
    </a-form>
  </a-modal>
  <!-- 标签管理 -->
  <a-modal
      v-model:visible="showCommonTagManager"
      title="其他设置"
      @ok="saveCommonTagManagerModal"
      @cancel="showCommonTagManager = false"
      width="50%" height="50%"
      okText="保存"
      cancelText="关闭"
  >
    <a-form size="mini">
      <a-row :gutter="24">
        <a-col :span="24">
          <a-form-item label="标签" size="mini"  tooltip="为此点位打上标签，可供js等筛选。">
            <a-input-tag v-model="otherConfig.commonTag"  @change="commonTagChange" placeholder="输入文本后按Enter，如果录入内容带有逗号，则会拆分为多个标签" allow-clear/>
          </a-form-item>
        </a-col>

      </a-row>
      <a-row :gutter="24">
        <a-col :span="24">
          <a-form-item label="区分怪物拾取" size="mini"  tooltip="只有启用此配置，在调度中的只拾取精英配置才会生效，如果该脚本无精英怪，则无脑开启即可（和调度器配置同时开启后，没有标记精英的点位，将不再拾取）。">
            <a-checkbox :value="true" v-model="otherConfig.enableMonsterLootSplit"></a-checkbox>
          </a-form-item>
        </a-col>

      </a-row>
    </a-form>
    
  </a-modal>
  
  
  <!-- 添加点位的模态框 -->
  <a-modal
    v-model:visible="showAddPointModal"
    title="添加新点位"
    @ok="handleAddPointFromModal"
    @cancel="showAddPointModal = false"
  >
    <a-form :model="{ x: newPointX, y: newPointY }">
      <a-form-item field="x" label="X坐标">
        <a-input-number v-model="newPointX" placeholder="请输入X坐标" />
      </a-form-item>
      <a-form-item field="y" label="Y坐标">
        <a-input-number v-model="newPointY" placeholder="请输入Y坐标" />
      </a-form-item>
    </a-form>
  </a-modal>
  <a-modal
      v-model:visible="showEditPointModal"
      title="修改点位坐标"
      @ok="updatePointModal"
      @cancel="showEditPointModal = false"
  >
    <a-form :model="{ x: newPointX, y: newPointY }">
      <a-form-item field="x" label="X坐标">
        <a-input-number v-model="newPointX" placeholder="请输入X坐标" />
      </a-form-item>
      <a-form-item field="y" label="Y坐标">
        <a-input-number v-model="newPointY" placeholder="请输入Y坐标" />
      </a-form-item>
    </a-form>
  </a-modal>
  <!-- 导出模态框 -->
  <a-modal
    v-model:visible="showExportModal"
    title="导出路径"
    @ok="handleExport"
    @cancel="showExportModal = false"
  >
    <a-form :model="{ author: exportAuthor, version: exportVersion }">
      <a-form-item field="author" label="作者">
        <a-input v-model="exportAuthor" placeholder="请输入作者" />
      </a-form-item>
      <a-form-item field="version" label="版本">
        <a-input v-model="exportVersion" placeholder="请输入版本号,从1.0开始" />
      </a-form-item>
      <a-form-item field="description" label="描述">
        <a-textarea v-model="exportDescription" placeholder="请输入描述" :auto-size="{ minRows: 3, maxRows: 5 }" />
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<script>
const columns = [
  { title: '#', dataIndex: 'id' , slotName: 'id'},
  { title: '坐标', dataIndex: 'xy', slotName: 'xy' },
/*  { title: 'X坐标', dataIndex: 'x', slotName: 'x' },
  { title: 'Y坐标', dataIndex: 'y', slotName: 'y' },*/
  { title: '类型', dataIndex: 'type', slotName: 'type' },
  { title: '移动方式', dataIndex: 'move_mode', slotName: 'move_mode' },
  { title: '动作', dataIndex: 'action', slotName: 'action' },
  { title: '操作', slotName: 'operations' },
];
</script>
<style scoped>
:deep(.arco-table-tr.locked td){
  border-top: 2px red solid;
}
</style>
<style>
.layout {
  height: 100vh;
}

#map {
  height: 100%;
  width: 100%;
}

.arco-layout-sider {
  background: #fff;
}

.arco-layout-content {
  padding: 16px;
  background: #f0f2f5;
  overflow-y: auto;
}

.arco-table-tr-active {
  background-color: #e6f7ff;
}

.highlight-marker {
  z-index: 1000; /* 确保高亮标记显示在其他标记之上 */
}

.arco-table .arco-table-cell {
    padding: 8px 8px !important;
}
</style>
