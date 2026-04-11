/**
 * 坐标转换器类
 */
export class CoordinateConverter {
  /**
   * @param {object} config - 地图配置
   * @param {number} config.gameMapRows - 游戏坐标下地图块的行数
   * @param {number} config.gameMapCols - 游戏坐标下地图块的列数
   * @param {number} config.gameMapUpRows - 游戏坐标下 左上角离地图原点的行数
   * @param {number} config.gameMapLeftCols - 游戏坐标下 左上角离地图原点的列数
   */
  constructor(config) {
    this.GameMapRows = config.gameMapRows;
    this.GameMapCols = config.gameMapCols;
    this.GameMapUpRows = config.gameMapUpRows;
    this.GameMapLeftCols = config.gameMapLeftCols;
    this.pixelScale = config.pixelScale || 1;
    this.maxGridY = this.GameMapRows * 1024;
  }

  /**
   * 原神游戏坐标系 -> 图像像素坐标系（用于 Leaflet lat/lng）
   * @param {number} x - 游戏坐标系的x坐标
   * @param {number} y - 游戏坐标系的y坐标
   * @returns {Object} - 包含x和y坐标的对象
   */
  gameToMain1024(x, y) {
    const rawX = (this.GameMapLeftCols + 1) * 1024 - x;
    const rawY = this.transformOriginY((this.GameMapUpRows + 1) * 1024 - y);
    // rawY 向上递增，CRS y 向下递增，需要翻转
    return {
      x: rawX * this.pixelScale,
      y: (this.maxGridY - rawY) * this.pixelScale
    };
  }

  /**
   * 图像像素坐标系（Leaflet lat/lng）-> 原神游戏坐标系
   * @param {number} x - 图像像素x坐标
   * @param {number} y - 图像像素y坐标
   * @returns {Object} - 包含x和y坐标的对象
   */
  main1024ToGame(x, y) {
    const rawX = x / this.pixelScale;
    const rawY = this.maxGridY - y / this.pixelScale;
    return {
      x: (this.GameMapLeftCols + 1) * 1024 - rawX,
      y: (this.GameMapUpRows + 1) * 1024 - this.transformOriginY(rawY)
    };
  }

  /**
   * 转换Y坐标原点
   * @param {number} y - Y坐标
   * @returns {number} - 转换后的Y坐标
   */
  transformOriginY(y) {
    return this.GameMapRows * 1024 - y;
  }
}
