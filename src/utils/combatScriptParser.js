import {combatScriptCommand} from '../constants/combatScriptLanguage';

const IDENTIFIER_CHARACTER = /[A-Za-z_]/;
const ARGUMENT_CHARACTER = /[A-Za-z_0-9]/;
const NUMBER_PATTERN = /[-+]?(?:\d+(?:\.\d*)?|\.\d+)/g;

function tokenRange(text, position, characterPattern) {
  let from = position;
  let to = position;
  while (from > 0 && characterPattern.test(text[from - 1])) from--;
  while (to < text.length && characterPattern.test(text[to])) to++;
  return {from, to, text: text.slice(from, to)};
}

function identifierRange(text, position) {
  return tokenRange(text, position, IDENTIFIER_CHARACTER);
}

function lineHasCommentBefore(text, position) {
  const lineStart = text.lastIndexOf('\n', position - 1) + 1;
  const commentStart = text.indexOf('//', lineStart);
  return commentStart !== -1 && commentStart < position;
}

/**
 * 返回光标处的补全上下文，只识别这门小语法需要的括号与参数层级。
 */
export function combatScriptCompletionContext(text, position) {
  if (lineHasCommentBefore(text, position)) return null;

  const stack = [];
  let inComment = false;

  for (let index = 0; index < position; index++) {
    const character = text[index];
    const next = text[index + 1];
    if (!inComment && character === '/' && next === '/') {
      inComment = true;
      index++;
      continue;
    }
    if (inComment) {
      if (character === '\n') inComment = false;
      continue;
    }
    if (character === '(') {
      const methodRange = identifierRange(text, index);
      stack.push({name: methodRange.text, argumentIndex: 0});
    } else if (character === ',' && stack.length) {
      stack[stack.length - 1].argumentIndex++;
    } else if (character === ')' && stack.length) {
      stack.pop();
    }
  }

  if (stack.length) {
    const frame = stack[stack.length - 1];
    return {
      type: 'argument',
      command: combatScriptCommand(frame.name),
      argumentIndex: frame.argumentIndex,
      ...tokenRange(text, position, ARGUMENT_CHARACTER),
    };
  }

  return {type: 'command', ...identifierRange(text, position)};
}

/** 查找光标所在或紧邻的数字。 */
export function numberRangeNearCursor(text, position) {
  const lineStart = text.lastIndexOf('\n', Math.max(0, position - 1)) + 1;
  const nextLineBreak = text.indexOf('\n', position);
  const lineEnd = nextLineBreak === -1 ? text.length : nextLineBreak;
  const line = text.slice(lineStart, lineEnd);

  NUMBER_PATTERN.lastIndex = 0;
  let match;
  while ((match = NUMBER_PATTERN.exec(line))) {
    const from = lineStart + match.index;
    const to = from + match[0].length;
    if (position >= from && position <= to) {
      return {from, to, text: match[0]};
    }
  }
  return null;
}

/** 返回光标所在调用的命令定义，供帮助面板跟随光标。 */
export function combatScriptCommandAt(text, position) {
  const context = combatScriptCompletionContext(text, position);
  if (context?.type === 'argument') return context.command;

  const range = identifierRange(text, position);
  return combatScriptCommand(range.text);
}
