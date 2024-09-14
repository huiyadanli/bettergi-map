const GameMapRows = 13; // 游戏坐标下地图块的行数
const GameMapCols = 16; // 游戏坐标下地图块的列数

// 游戏坐标下 左上角离地图原点的行数
const GameMapUpRows = 5;

// 游戏坐标下 左上角离地图原点的列数
const GameMapLeftCols = 9;

// 游戏地图块的长宽
const GameMapBlockWidth = 1024;

/**
 * 原神游戏坐标系 -> 主地图1024区块坐标系
 * @param {number} x - 游戏坐标系的x坐标
 * @param {number} y - 游戏坐标系的y坐标
 * @returns {Object} - 包含x和y坐标的对象
 */
export function gameToMain1024(x, y) {
    // 转换1024区块坐标，大地图坐标系正轴是往左上方向的
    // 这里写最左上角的区块坐标(GameMapUpRows, GameMapLeftCols)/(上, 左), 截止4.5版本，最左上角的区块坐标是(5, 7)

    return {
        x: (GameMapLeftCols + 1) * GameMapBlockWidth - x,
        y: transformOriginY((GameMapUpRows + 1) * GameMapBlockWidth - y)
    };
}

/**
 * 主地图1024区块坐标系 -> 原神游戏坐标系
 * @param {number} x - 主地图1024区块坐标系的x坐标
 * @param {number} y - 主地图1024区块坐标系的y坐标
 * @returns {Object} - 包含x和y坐标的对象
 */
export function main1024ToGame(x, y) {
    return {
        x: (GameMapLeftCols + 1) * GameMapBlockWidth - x,
        y: (GameMapUpRows + 1) * GameMapBlockWidth - transformOriginY(y)
    };
}

export function transformOriginY(y) {
    return GameMapRows * GameMapBlockWidth - y;
}