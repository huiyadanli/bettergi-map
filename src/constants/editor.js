/**
 * 路径编辑器的稳定选项和表格列。
 *
 * 本模块只提供常量，不拥有运行时状态。
 */

// 撤销重做最多保留的快照数
export const MAX_HISTORY = 50;

// 战斗策略本地存储键
export const COMBAT_SCRIPT_KEY = '_combatScriptData';

// 点位表格基础列；运行列由 editor store 统一插入。
export const columnsBase = [
  {title: '#', dataIndex: 'id', slotName: 'id', width: 52},
  {title: '坐标', dataIndex: 'xy', slotName: 'xy', width: 150},
  {title: '类型', dataIndex: 'type', slotName: 'type', width: 110},
  {title: '移动方式', dataIndex: 'move_mode', slotName: 'move_mode', width: 126},
  {title: '动作', dataIndex: 'action', slotName: 'action', width: 290},
  {title: '操作', slotName: 'operations', width: 120, fixed: 'right'},
];

// 点位动作级联选项
export const actionOptionsTree = [
  {label: '无', value: ''},
  {label: '战斗', value: 'fight'},
  {label: '简易策略脚本', value: 'combat_script'},
  {label: '纳西妲长E收集', value: 'nahida_collect'},
  {label: '下落攻击', value: 'stop_flying'},
  {label: '四叶印', value: 'up_down_grab_leaf'},
  {label: '挖矿', value: 'mining'},
  {label: '莉奈娅挖矿', value: 'linnea_mining'},
  {label: '钓鱼', value: 'fishing'},
  {label: '聚集材料', value: 'pick_up_collect'},
  {label: '在附近拾取', value: 'pick_around'},
  {label: '使用小道具', value: 'use_gadget'},
  {
    label: '元素力采集',
    value: 'element',
    children: [
      {label: '水元素力采集', value: 'hydro_collect'},
      {label: '雷元素力采集', value: 'electro_collect'},
      {label: '风元素力采集', value: 'anemo_collect'},
      {label: '火元素力采集', value: 'pyro_collect'},
    ]
  },
  {
    label: '其他',
    value: 'system',
    children: [
      {label: '强制传送', value: 'force_tp'},
      {label: '输出日志', value: 'log_output'},
      {label: '退出重新登录', value: 'exit_and_relogin'},
      {label: '进出千星奇域', value: 'wonderland_cycle'},
      {label: '设置时间', value: 'set_time'},
    ]
  }
];

// 点位扩展参数默认值
export const defaultPointExtParams = {
  misidentification: {
    type: ['unrecognized'],
    handling_mode: 'previousDetectedPoint',
    arrival_time: 0
  },
  description: '',
  monster_tag: ''
};

// 战斗策略管理表格列
export const combatScriptColumns = [
  {
    title: '策略参数',
    dataIndex: 'value',
  },
  {
    title: '是否默认',
    dataIndex: 'def',
    slotName: 'def'
  },
  {
    title: '操作',
    dataIndex: 'operations',
    slotName: 'operations'
  }
];
