<script setup>
/**
 * 简易策略脚本 CodeMirror 编辑器。
 *
 * 只编辑传入的草稿；路线数据由外层模态框确认后再写回。
 */
import {onBeforeUnmount, onMounted, ref, watch} from 'vue';
import {basicSetup, EditorView} from 'codemirror';
import {autocompletion, selectedCompletion} from '@codemirror/autocomplete';
import {
  COMBAT_SCRIPT_COMMANDS,
  combatScriptArgumentOptions,
  combatScriptKey,
} from '../constants/combatScriptLanguage';
import {
  combatScriptCommandAt,
  combatScriptCompletionContext,
  numberRangeNearCursor,
} from '../utils/combatScriptParser';

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['update:modelValue', 'active-help-change']);
const editorElement = ref(null);
let editorView = null;
let activeHelpKey = '';

function commandApply(command, label) {
  return (view, completion, from, to) => {
    const text = command.insertParens ? `${label}()` : label;
    const anchor = from + text.length - (command.insertParens ? 1 : 0);
    view.dispatch({
      changes: {from, to, insert: text},
      selection: {anchor},
    });
  };
}

function commandCompletions() {
  return COMBAT_SCRIPT_COMMANDS.flatMap((command) => {
    const labels = [command.name, ...(command.aliases || [])];
    return labels.map((label) => ({
      label,
      type: command.aliases?.includes(label) ? 'text' : 'function',
      detail: command.aliases?.includes(label) ? `${command.title}（${command.name} 的别名）` : command.title,
      info: `${command.signature}\n${command.description}`,
      apply: commandApply(command, label),
      help: {type: 'command', command: command.name},
      boost: label === command.name ? 1 : 0,
    }));
  });
}

const allCommandCompletions = commandCompletions();

function completionSource(context) {
  const text = context.state.doc.toString();
  const scriptContext = combatScriptCompletionContext(text, context.pos);
  if (!scriptContext) return null;

  if (scriptContext.type === 'command') {
    if (!scriptContext.text && !context.explicit) return null;
    return {
      from: scriptContext.from,
      to: scriptContext.to,
      options: allCommandCompletions,
      validFor: /^[A-Za-z_]*$/,
    };
  }

  const options = combatScriptArgumentOptions(scriptContext.command, scriptContext.argumentIndex);
  if (!options.length) return null;
  return {
    from: scriptContext.from,
    to: scriptContext.to,
    options: options.map((option) => {
      const isKey = typeof option === 'object';
      return {
        label: isKey ? option.value : option,
        type: 'constant',
        detail: isKey ? option.title : scriptContext.command?.title,
        info: isKey ? `${option.virtualKey}\n${option.description}` : undefined,
        help: isKey
          ? {type: 'key', command: scriptContext.command?.name, value: option.value}
          : {type: 'command', command: scriptContext.command?.name},
      };
    }),
    validFor: /^[A-Za-z_0-9]*$/,
  };
}

function decimalPlaces(value) {
  const text = String(value).toLowerCase();
  if (text.includes('e-')) return Number(text.split('e-')[1]) || 0;
  return text.includes('.') ? text.length - text.indexOf('.') - 1 : 0;
}

function adjustedNumber(value, step, direction) {
  const precision = Math.min(8, Math.max(decimalPlaces(value), decimalPlaces(step)));
  const scale = 10 ** precision;
  const result = (Math.round(Number(value) * scale) + direction * Math.round(step * scale)) / scale;
  return Object.is(result, -0) ? '0' : String(result);
}

function handleWheel(event, view) {
  if (!event.deltaY) return false;
  const selection = view.state.selection.main;
  if (!selection.empty) return false;

  const text = view.state.doc.toString();
  const range = numberRangeNearCursor(text, selection.head);
  if (!range) return false;

  const step = event.ctrlKey ? 0.1 : event.shiftKey ? 10 : 1;
  const direction = event.deltaY < 0 ? 1 : -1;
  const replacement = adjustedNumber(range.text, step, direction);
  view.dispatch({
    changes: {from: range.from, to: range.to, insert: replacement},
    selection: {anchor: range.from + replacement.length},
    userEvent: 'input.mouse',
  });
  event.preventDefault();
  return true;
}

function notifyActiveHelp(view) {
  const completion = selectedCompletion(view.state);
  const text = view.state.doc.toString();
  const position = view.state.selection.main.head;
  const cursorContext = combatScriptCompletionContext(text, position);
  const cursorCommand = combatScriptCommandAt(text, position);
  const cursorKey = cursorContext?.type === 'argument' && cursorContext.command?.argumentSource === 'keyCodes'
    ? combatScriptKey(cursorContext.text)
    : null;
  const cursorHelp = cursorKey
    ? {type: 'key', command: cursorContext.command.name, value: cursorKey.value}
    : cursorCommand ? {type: 'command', command: cursorCommand.name} : null;
  const nextHelp = completion?.help || cursorHelp;
  const nextHelpKey = nextHelp
    ? `${nextHelp.type}:${nextHelp.command || ''}:${nextHelp.value || ''}`
    : '';
  if (nextHelpKey === activeHelpKey) return;
  activeHelpKey = nextHelpKey;
  emit('active-help-change', nextHelp);
}

onMounted(() => {
  editorView = new EditorView({
    doc: props.modelValue || '',
    parent: editorElement.value,
    extensions: [
      basicSetup,
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        'aria-label': '简易策略脚本代码编辑器',
        spellcheck: 'false',
      }),
      autocompletion({
        override: [completionSource],
        activateOnTyping: true,
        closeOnBlur: true,
      }),
      EditorView.domEventHandlers({wheel: handleWheel}),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) emit('update:modelValue', update.state.doc.toString());
        // 候选项上下移动只会改变自动完成状态，不一定改变文档或光标。
        notifyActiveHelp(update.view);
      }),
      EditorView.theme({
        '&': {
          height: '100%',
          fontSize: '13px',
          backgroundColor: '#fff',
        },
        '.cm-scroller': {
          overflow: 'auto',
          fontFamily: 'Consolas, "SFMono-Regular", Menlo, monospace',
        },
        '.cm-content': {
          minHeight: '310px',
          padding: '10px 0',
        },
        '.cm-gutters': {
          backgroundColor: '#f7f8fa',
          borderRight: '1px solid #e5e6eb',
        },
        '&.cm-focused': {
          outline: 'none',
        },
      }),
    ],
  });
  notifyActiveHelp(editorView);
  editorView.focus();
});

watch(
  () => props.modelValue,
  (value) => {
    if (!editorView) return;
    const nextValue = value || '';
    const currentValue = editorView.state.doc.toString();
    if (nextValue === currentValue) return;
    editorView.dispatch({changes: {from: 0, to: currentValue.length, insert: nextValue}});
  },
);

onBeforeUnmount(() => {
  editorView?.destroy();
  editorView = null;
});
</script>

<template>
  <div ref="editorElement" class="combat-script-code-editor"/>
</template>

<style scoped>
.combat-script-code-editor {
  height: 350px;
  overflow: hidden;
  border: 1px solid var(--color-border-2);
  border-radius: 6px;
}

.combat-script-code-editor:focus-within {
  border-color: rgb(var(--primary-6));
  box-shadow: 0 0 0 2px rgba(var(--primary-6), 0.1);
}
</style>
