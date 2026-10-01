/**
 * 简易策略脚本的命令和参数元数据。
 *
 * 编辑器补全和帮助面板共用这份数据，避免两处文案逐渐不一致。
 */

function defineKey(value, title, category, description) {
  return {
    value,
    virtualKey: `VK_${value}`,
    title,
    category,
    description: description || `${title}对应的 Windows 虚拟按键。`,
  };
}

const letterKeys = Array.from({length: 26}, (_, index) => {
  const value = String.fromCharCode(65 + index);
  return defineKey(value, `${value} 键`, '字母键', `键盘上的 ${value} 字母键。`);
});
const digitKeys = Array.from({length: 10}, (_, index) => (
  defineKey(String(index), `${index} 键`, '数字键', `键盘主键区的 ${index} 数字键。`)
));
const functionKeys = Array.from({length: 24}, (_, index) => {
  const value = `F${index + 1}`;
  return defineKey(value, `${value} 键`, '功能键', `键盘上的 ${value} 功能键。`);
});
const numpadKeys = Array.from({length: 10}, (_, index) => (
  defineKey(`NUMPAD${index}`, `数字键盘 ${index} 键`, '数字键盘')
));

export const COMBAT_SCRIPT_KEY_DEFINITIONS = [
  ...letterKeys,
  ...digitKeys,
  ...functionKeys,
  defineKey('LBUTTON', '鼠标左键', '鼠标按键'),
  defineKey('RBUTTON', '鼠标右键', '鼠标按键'),
  defineKey('MBUTTON', '鼠标中键', '鼠标按键'),
  defineKey('XBUTTON1', '鼠标 X1 键', '鼠标按键'),
  defineKey('XBUTTON2', '鼠标 X2 键', '鼠标按键'),
  defineKey('CANCEL', '控制中断键', '控制键'),
  defineKey('BACK', 'Backspace 键', '编辑键'),
  defineKey('TAB', 'Tab 键', '控制键'),
  defineKey('CLEAR', 'Clear 键', '编辑键'),
  defineKey('RETURN', 'Enter 回车键', '控制键'),
  defineKey('SHIFT', 'Shift 键', '修饰键'),
  defineKey('CONTROL', 'Ctrl 键', '修饰键'),
  defineKey('MENU', 'Alt 键', '修饰键'),
  defineKey('PAUSE', 'Pause 键', '控制键'),
  defineKey('CAPITAL', 'Caps Lock 键', '锁定键'),
  defineKey('ESCAPE', 'Esc 键', '控制键', '取消或退出当前操作，具体效果取决于游戏当前界面。'),
  defineKey('SPACE', '空格键', '控制键'),
  defineKey('PRIOR', 'Page Up 键', '导航键'),
  defineKey('NEXT', 'Page Down 键', '导航键'),
  defineKey('END', 'End 键', '导航键'),
  defineKey('HOME', 'Home 键', '导航键'),
  defineKey('LEFT', '向左方向键', '方向键'),
  defineKey('UP', '向上方向键', '方向键'),
  defineKey('RIGHT', '向右方向键', '方向键'),
  defineKey('DOWN', '向下方向键', '方向键'),
  defineKey('SELECT', 'Select 键', '控制键'),
  defineKey('PRINT', 'Print 键', '控制键'),
  defineKey('EXECUTE', 'Execute 键', '控制键'),
  defineKey('SNAPSHOT', 'Print Screen 键', '控制键'),
  defineKey('INSERT', 'Insert 键', '编辑键'),
  defineKey('DELETE', 'Delete 键', '编辑键'),
  defineKey('HELP', 'Help 键', '控制键'),
  defineKey('LWIN', '左 Windows 键', '系统键'),
  defineKey('RWIN', '右 Windows 键', '系统键'),
  defineKey('APPS', '应用菜单键', '系统键'),
  ...numpadKeys,
  defineKey('MULTIPLY', '数字键盘乘号键', '数字键盘'),
  defineKey('ADD', '数字键盘加号键', '数字键盘'),
  defineKey('SEPARATOR', '数字键盘分隔符键', '数字键盘'),
  defineKey('SUBTRACT', '数字键盘减号键', '数字键盘'),
  defineKey('DECIMAL', '数字键盘小数点键', '数字键盘'),
  defineKey('DIVIDE', '数字键盘除号键', '数字键盘'),
  defineKey('NUMLOCK', 'Num Lock 键', '锁定键'),
  defineKey('SCROLL', 'Scroll Lock 键', '锁定键'),
  defineKey('LSHIFT', '左 Shift 键', '修饰键'),
  defineKey('RSHIFT', '右 Shift 键', '修饰键'),
  defineKey('LCONTROL', '左 Ctrl 键', '修饰键'),
  defineKey('RCONTROL', '右 Ctrl 键', '修饰键'),
  defineKey('LMENU', '左 Alt 键', '修饰键'),
  defineKey('RMENU', '右 Alt 键', '修饰键'),
];

export const COMBAT_SCRIPT_KEY_MAP = new Map(
  COMBAT_SCRIPT_KEY_DEFINITIONS.map((key) => [key.value, key]),
);

export function combatScriptKey(value) {
  const normalizedValue = String(value || '').toUpperCase();
  const keyValue = normalizedValue.startsWith('VK_') ? normalizedValue.slice(3) : normalizedValue;
  return COMBAT_SCRIPT_KEY_MAP.get(keyValue) || null;
}

export const COMBAT_SCRIPT_COMMANDS = [
  {
    name: 'skill',
    aliases: ['e'],
    title: '元素战技',
    signature: 'skill([hold][,wait])',
    description: '释放元素战技。hold 表示长按，wait 表示等待技能冷却结束。',
    parameters: [
      'hold：长按元素战技，可选',
      'wait：等待技能冷却结束，可选',
    ],
    examples: ['skill', 'e', 'e(hold)', 'e(hold,wait)'],
    argumentOptions: {0: ['hold', 'wait'], 1: ['wait']},
    insertParens: true,
  },
  {
    name: 'burst',
    aliases: ['q'],
    title: '元素爆发',
    signature: 'burst',
    description: '释放元素爆发，动作自身至少等待约 1.7 秒。',
    examples: ['burst', 'q'],
  },
  {
    name: 'attack',
    title: '普通攻击',
    signature: 'attack([seconds])',
    description: '连续普通攻击，每约 200ms 点击一次鼠标左键。',
    parameters: ['seconds：持续时间，单位秒，可选'],
    examples: ['attack', 'attack(5.5)'],
    insertParens: true,
  },
  {
    name: 'charge',
    title: '重击',
    signature: 'charge([seconds])',
    description: '长按鼠标左键执行重击。',
    parameters: ['seconds：长按持续时间，单位秒，可选'],
    examples: ['charge', 'charge(6)'],
    insertParens: true,
  },
  {
    name: 'wait',
    title: '等待',
    signature: 'wait(seconds)',
    description: '等待指定时间后继续执行。',
    parameters: ['seconds：等待时间，单位秒，必填'],
    examples: ['wait(0.5)'],
    insertParens: true,
  },
  {
    name: 'ready',
    title: '准备就绪',
    signature: 'ready',
    description: '等待元素爆发动画结束，四星角色无效，等待上限为 4 秒。',
    examples: ['ready'],
  },
  {
    name: 'dash',
    title: '冲刺',
    signature: 'dash([seconds])',
    description: '朝当前方向冲刺。',
    parameters: ['seconds：冲刺时间，单位秒，可选'],
    examples: ['dash', 'dash(2)'],
    insertParens: true,
  },
  {
    name: 'jump',
    aliases: ['j'],
    title: '跳跃',
    signature: 'jump',
    description: '跳跃一次。',
    examples: ['jump', 'j'],
  },
  {
    name: 'walk',
    title: '行走',
    signature: 'walk(direction,seconds)',
    description: '按下指定方向键行走一段时间。',
    parameters: [
      'direction：行走方向，w/a/s/d，必填',
      'seconds：持续时间，单位秒，必填',
    ],
    examples: ['walk(w,0.2)'],
    argumentOptions: {0: ['w', 'a', 's', 'd']},
    insertParens: true,
  },
  ...[
    ['w', '向前行走'],
    ['a', '向左行走'],
    ['s', '向后行走'],
    ['d', '向右行走'],
  ].map(([name, title]) => ({
    name,
    title,
    signature: `${name}(seconds)`,
    description: `${title}指定时间，等效于 walk(${name},seconds)。`,
    parameters: ['seconds：持续时间，单位秒，必填'],
    examples: [`${name}(0.2)`],
    insertParens: true,
  })),
  {
    name: 'check',
    title: '结束检测',
    signature: 'check',
    description: '执行一次战斗结束检测，依赖自动战斗的相关配置。',
    examples: ['check'],
  },
  {
    name: 'mousedown',
    title: '鼠标按下',
    signature: 'mousedown([button])',
    description: '按下鼠标按键，不填写时默认为左键。',
    parameters: ['button：left/right/middle，可选'],
    examples: ['mousedown', 'mousedown(left)'],
    argumentOptions: {0: ['left', 'right', 'middle']},
    insertParens: true,
  },
  {
    name: 'mouseup',
    title: '鼠标松开',
    signature: 'mouseup([button])',
    description: '松开鼠标按键，不填写时默认为左键。',
    parameters: ['button：left/right/middle，可选'],
    examples: ['mouseup', 'mouseup(right)'],
    argumentOptions: {0: ['left', 'right', 'middle']},
    insertParens: true,
  },
  {
    name: 'click',
    title: '鼠标单击',
    signature: 'click([button])',
    description: '单击鼠标按键，不填写时默认为左键。',
    parameters: ['button：left/right/middle，可选'],
    examples: ['click', 'click(middle)'],
    argumentOptions: {0: ['left', 'right', 'middle']},
    insertParens: true,
  },
  {
    name: 'moveby',
    title: '鼠标相对移动',
    signature: 'moveby(x,y)',
    description: '按相对距离移动鼠标；左和上为负数，右和下为正数。',
    parameters: [
      'x：水平相对距离，必填',
      'y：垂直相对距离，必填',
    ],
    examples: ['moveby(500,0)', 'moveby(100,-100)'],
    insertParens: true,
  },
  {
    name: 'scroll',
    title: '滚轮滚动',
    signature: 'scroll(amount)',
    description: '滚动鼠标滚轮，向下为正数，向上为负数。',
    parameters: ['amount：滚动格数，必填'],
    examples: ['scroll(1)', 'scroll(-1)'],
    insertParens: true,
  },
  ...[
    ['keydown', '键盘按下', '按下指定键盘按键。'],
    ['keyup', '键盘松开', '松开指定键盘按键。'],
    ['keypress', '键盘点按', '点按指定键盘按键。'],
  ].map(([name, title, description]) => ({
    name,
    title,
    signature: `${name}(key)`,
    description,
    parameters: ['key：虚拟键名称，VK_ 前缀可以省略，必填'],
    examples: [`${name}(${name === 'keypress' ? 'F1' : name === 'keydown' ? 'A' : 'D'})`],
    argumentSource: 'keyCodes',
    insertParens: true,
  })),
];

export const COMBAT_SCRIPT_COMMAND_MAP = new Map();

for (const command of COMBAT_SCRIPT_COMMANDS) {
  COMBAT_SCRIPT_COMMAND_MAP.set(command.name, command);
  for (const alias of command.aliases || []) {
    COMBAT_SCRIPT_COMMAND_MAP.set(alias, command);
  }
}

export function combatScriptCommand(name) {
  return COMBAT_SCRIPT_COMMAND_MAP.get(String(name || '').toLowerCase()) || null;
}

export function combatScriptArgumentOptions(command, argumentIndex) {
  if (!command) return [];
  if (command.argumentSource === 'keyCodes' && argumentIndex === 0) {
    return COMBAT_SCRIPT_KEY_DEFINITIONS;
  }
  return command.argumentOptions?.[argumentIndex] || [];
}
