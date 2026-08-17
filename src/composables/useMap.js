/**
 * Leaflet 地图生命周期。
 *
 * 负责底图初始化、瓦片加载和切换地图，不拥有路线点位数据。
 */
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import {CoordinateConverter} from '../utils/coordinateConverter';
import {MAPS} from '../config/mapConfig';
import {getTileUrl, hasTiles} from '../utils/tileIndex';
import {
  mode,
  currentMapName,
  currentMapConfig,
  coordinateConverter,
  imageWidth,
  imageHeight,
  map,
  polylines,
} from '../stores/editor';

// 画完折线后交给路线模块建档
let onPolylineCreate = null;
// 地图上改点后同步表格坐标
let onMapPointChange = null;

/**
 * 注入路线层在地图事件里需要调用的处理函数。
 */
export function bindMapRouteHandlers(handlers) {
  onPolylineCreate = handlers.onPolylineCreate;
  onMapPointChange = handlers.onMapPointChange;
}

/**
 * 加载各地图的瓦片 meta。
 *
 * single 模式使用构建期注入的 __TILE_META__，其他模式通过 script 标签加载 meta.js。
 */
export async function loadTileMeta() {
  if (import.meta.env.VITE_MODE === 'single' && __TILE_META__) {
    for (const mapItem of Object.values(MAPS)) {
      mapItem.meta = __TILE_META__[mapItem.name] || null;
    }
  } else {
    await new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = './tiles/meta.js';
      s.onload = resolve;
      s.onerror = resolve;
      document.head.appendChild(s);
    });
    for (const mapItem of Object.values(MAPS)) {
      mapItem.meta = window.__TILE_META__?.[mapItem.name] || null;
    }
  }
}

/**
 * 按 URL 的 map 参数切换当前地图，并清掉地址栏中的该参数。
 */
export function applyMapFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const mapParam = urlParams.get('map');

  if (mapParam && MAPS[mapParam]) {
    currentMapName.value = mapParam;
    coordinateConverter.value = new CoordinateConverter(currentMapConfig.value);
  }

  if (location.protocol !== 'file:') {
    urlParams.delete('map');
    let p = urlParams.toString();
    let newUrl = `${window.location.pathname}${p ? '?' + p : ''}`;
    window.history.replaceState(null, '', newUrl);
  }
}

/**
 * 通知 BGI 宿主切换地图配置。
 *
 * 仅 single 模式有效；在线版失败时只打日志。
 */
export function changeBgiMapSettingsName(mapName) {
  if (mode !== 'single') {
    return;
  }
  try {
    const mapEditorWebBridge = chrome.webview.hostObjects.mapEditorWebBridge;
    const jsonString = mapEditorWebBridge.ChangeMapName(mapName);
    return JSON.parse(jsonString);
  } catch (e) {
    console.log('切换bgi地图配置失败，如果是在线版，请无视这个提示。');
  }
}

/**
 * 根据当前地图配置创建 Leaflet 实例和底图图层。
 */
export async function initMap() {
  if (map.value) {
    map.value.remove();
    map.value = null;
  }

  const config = currentMapConfig.value;
  const meta = config.enableTiles ? config.meta : null;
  const useTiles = meta !== null;

  let w, h;

  if (useTiles) {
    w = meta.imageWidth;
    h = meta.imageHeight;
  } else {
    await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        w = img.width;
        h = img.height;
        resolve();
      };
      img.src = config.mapImage;
    });
  }

  // 按实际图片高度计算 pixelScale，换图后不用改配置
  const actualPixelScale = h / (config.gameMapRows * 1024);
  coordinateConverter.value.pixelScale = actualPixelScale;

  let crs;
  if (useTiles) {
    const maxDim = Math.max(w, h);
    const s = 512 / maxDim;
    crs = L.extend({}, L.CRS.Simple, {
      transformation: new L.Transformation(s, 0, s, 0),
    });
  } else {
    crs = L.CRS.Simple;
  }

  map.value = L.map('map', {
    attributionControl: false,
    crs,
    minZoom: useTiles ? 0 : -4,
    maxZoom: useTiles ? meta.maxTileZoom + 4 : 5,
    maxBounds: [[0, 0], [h, w]],
    maxBoundsViscosity: 1.0,
  });

  // 路线始终位于分层地图之上、编辑顶点与提示之下。
  const routePane = map.value.createPane('routePane');
  routePane.style.zIndex = '550';
  routePane.style.pointerEvents = 'auto';

  if (useTiles) {
    if (mode === 'single' && hasTiles) {
      const tileOpts = {
        tileSize: meta.tileSize || 512,
        minNativeZoom: 0,
        maxNativeZoom: meta.maxTileZoom,
        bounds: [[0, 0], [h, w]],
        noWrap: true,
      };
      const tileLayer = L.tileLayer('', tileOpts);
      tileLayer.getTileUrl = function (coords) {
        return getTileUrl(`${config.name}/${coords.z}/${coords.x}/${coords.y}.webp`) || '';
      };
      tileLayer.addTo(map.value);
    } else {
      L.tileLayer(`${config.tileDir}/{z}/{x}/{y}.webp`, {
        tileSize: meta.tileSize || 512,
        minNativeZoom: 0,
        maxNativeZoom: meta.maxTileZoom,
        bounds: [[0, 0], [h, w]],
        noWrap: true,
      }).addTo(map.value);
    }
  } else {
    L.imageOverlay(config.mapImage, [[0, 0], [h, w]]).addTo(map.value);
  }

  imageWidth.value = w;
  imageHeight.value = h;

  // 等布局完成再 fitBounds，避免容器尺寸为 0 时地图吸顶
  await new Promise((resolve) => requestAnimationFrame(resolve));
  map.value.invalidateSize();
  map.value.fitBounds([[0, 0], [h, w]]);
  map.value.setZoom(1);

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

  map.value.pm.setLang('zh');

  map.value.pm.setGlobalOptions({
    pathOptions: {
      color: 'red',
      weight: 3,
      pane: 'routePane',
    }
  });

  map.value.on('pm:create', (e) => {
    if (e.layer instanceof L.Polyline) {
      onPolylineCreate?.(e.layer);
      e.layer.on('pm:edit', onMapPointChange);
    }
  });
}

/**
 * 切换到指定地图并清空已绘制路线。
 */
export async function switchMap(mapName) {
  changeBgiMapSettingsName(mapName);

  currentMapName.value = mapName;
  coordinateConverter.value = new CoordinateConverter(currentMapConfig.value);

  polylines.value = [];
  if (map.value) {
    map.value.eachLayer((layer) => {
      if (layer instanceof L.Polyline || layer instanceof L.Marker) {
        map.value.removeLayer(layer);
      }
    });
  }

  await initMap();
}
