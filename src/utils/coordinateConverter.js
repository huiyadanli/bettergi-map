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
   * @param {number} config.gameMapBlockWidth - 游戏地图块的长宽
   */
  constructor(config) {
    this.GameMapRows = config.gameMapRows;
    this.GameMapCols = config.gameMapCols;
    this.GameMapUpRows = config.gameMapUpRows;
    this.GameMapLeftCols = config.gameMapLeftCols;
    this.GameMapBlockWidth = config.gameMapBlockWidth;
  }

  /**
   * 原神游戏坐标系 -> 主地图1024区块坐标系
   * @param {number} x - 游戏坐标系的x坐标
   * @param {number} y - 游戏坐标系的y坐标
   * @returns {Object} - 包含x和y坐标的对象
   */
  gameToMain1024(x, y) {
    return {
      x: (this.GameMapLeftCols + 1) * this.GameMapBlockWidth - x,
      y: this.transformOriginY((this.GameMapUpRows + 1) * this.GameMapBlockWidth - y)
    };
  }

  /**
   * 主地图1024区块坐标系 -> 原神游戏坐标系
   * @param {number} x - 主地图1024区块坐标系的x坐标
   * @param {number} y - 主地图1024区块坐标系的y坐标
   * @returns {Object} - 包含x和y坐标的对象
   */
  main1024ToGame(x, y) {
    return {
      x: (this.GameMapLeftCols + 1) * this.GameMapBlockWidth - x,
      y: (this.GameMapUpRows + 1) * this.GameMapBlockWidth - this.transformOriginY(y)
    };
  }

  /**
   * 转换Y坐标原点
   * @param {number} y - Y坐标
   * @returns {number} - 转换后的Y坐标
   */
  transformOriginY(y) {
    return this.GameMapRows * this.GameMapBlockWidth - y;
  }
}

// 默认导出 Teyvat 地图的转换器实例（如果需要保持旧的导入方式兼容性）
// 或者在使用时根据地图类型动态创建实例
// export const teyvatConverter = new CoordinateConverter({
//   gameMapRows: 13,
//   gameMapCols: 18,
//   gameMapUpRows: 5,
//   gameMapLeftCols: 11,
//   gameMapBlockWidth: 1024
// });