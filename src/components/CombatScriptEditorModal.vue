<script setup>
/**
 * 简易策略脚本的独立编辑弹窗。
 *
 * 弹窗内维护草稿，只有点击确定才把结果交还给点位表格。
 */
import {computed, ref, watch} from 'vue';
import CombatScriptCodeEditor from './CombatScriptCodeEditor.vue';
import {
  COMBAT_SCRIPT_COMMANDS,
  combatScriptCommand,
  combatScriptKey,
} from '../constants/combatScriptLanguage';
import {
  combatScriptEditorMode,
  combatScriptEditorValue,
  showCombatScriptEditorModal,
} from '../stores/editor';
import {
  closeCombatScriptEditor,
  saveCombatScriptEditor,
} from '../composables/useCombatScripts';

const draft = ref('');
const activeHelp = ref(null);
const showDiscardConfirm = ref(false);

const editorTitle = computed(() => (
  combatScriptEditorMode.value === 'preset' ? '添加战斗策略' : '编辑简易策略脚本'
));
const hasUnsavedChanges = computed(() => draft.value !== (combatScriptEditorValue.value || ''));
const activeCommand = computed(() => combatScriptCommand(activeHelp.value?.command));
const activeKey = computed(() => (
  activeHelp.value?.type === 'key' ? combatScriptKey(activeHelp.value.value) : null
));
const activeKeyExamples = computed(() => {
  if (!activeKey.value) return [];
  const commands = ['keypress', 'keydown', 'keyup'];
  const preferredCommand = activeHelp.value?.command;
  if (preferredCommand && commands.includes(preferredCommand)) {
    commands.splice(commands.indexOf(preferredCommand), 1);
    commands.unshift(preferredCommand);
  }
  return commands.map((command) => `${command}(${activeKey.value.value})`);
});

watch(
  showCombatScriptEditorModal,
  (visible) => {
    if (!visible) {
      closeCombatScriptEditor();
      return;
    }
    draft.value = combatScriptEditorValue.value || '';
    activeHelp.value = null;
    showDiscardConfirm.value = false;
  },
);

function beforeOk() {
  return saveCombatScriptEditor(draft.value);
}

function beforeCancel() {
  if (!hasUnsavedChanges.value) return true;
  showDiscardConfirm.value = true;
  return false;
}

function discardChanges() {
  showDiscardConfirm.value = false;
  closeCombatScriptEditor();
}

function showCommandHelp(command) {
  activeHelp.value = {type: 'command', command};
}

function showCommandIndex() {
  activeHelp.value = null;
}

</script>

<template>
  <a-modal
      v-model:visible="showCombatScriptEditorModal"
      :title="editorTitle"
      width="900px"
      :mask-closable="false"
      :unmount-on-close="true"
      ok-text="确定"
      cancel-text="取消"
      :on-before-ok="beforeOk"
      :on-before-cancel="beforeCancel"
      @cancel="closeCombatScriptEditor"
  >
    <div v-if="showCombatScriptEditorModal" class="script-editor-layout">
      <section class="editor-column">
        <CombatScriptCodeEditor
            v-model="draft"
            @active-help-change="activeHelp = $event"
        />
        <div class="editor-hints">
          <span><kbd>Ctrl</kbd> + <kbd>Space</kbd> 手动触发提示</span>
          <span>数字处滚轮：默认 ±1，<kbd>Shift</kbd> ±10，<kbd>Ctrl</kbd> ±0.1</span>
        </div>
      </section>

      <aside class="script-docs" aria-live="polite">
        <template v-if="activeKey">
          <div class="docs-heading">
            <div class="docs-title-row">
              <a-button
                  class="docs-back-button"
                  type="text"
                  size="mini"
                  shape="circle"
                  :aria-label="`返回 ${activeCommand?.title || '指令详情'}`"
                  @click="showCommandHelp(activeHelp.command)"
              >
                <template #icon><icon-arrow-left/></template>
              </a-button>
              <strong>{{ activeKey.value }}</strong>
            </div>
            <code>{{ activeKey.virtualKey }}</code>
          </div>
          <p>{{ activeKey.title }}</p>
          <p>{{ activeKey.description }}</p>
          <div class="docs-section">
            <span>分类</span>
            <p>{{ activeKey.category }}</p>
          </div>
          <div class="docs-section">
            <span>参数写法</span>
            <code>{{ activeKey.value }}</code>
            <p><code>VK_</code> 前缀可以省略。</p>
          </div>
          <div class="docs-section">
            <span>示例</span>
            <code v-for="example in activeKeyExamples" :key="example">{{ example }}</code>
          </div>
        </template>
        <template v-else-if="activeCommand">
          <div class="docs-heading">
            <div class="docs-title-row">
              <a-button
                  class="docs-back-button"
                  type="text"
                  size="mini"
                  shape="circle"
                  aria-label="返回指令速查"
                  @click="showCommandIndex"
              >
                <template #icon><icon-arrow-left/></template>
              </a-button>
              <strong>{{ activeCommand.title }}</strong>
            </div>
            <code>{{ activeCommand.signature }}</code>
          </div>
          <p>{{ activeCommand.description }}</p>
          <div v-if="activeCommand.parameters" class="docs-section">
            <span>参数</span>
            <p v-for="parameter in activeCommand.parameters" :key="parameter">{{ parameter }}</p>
          </div>
          <div class="docs-section">
            <span>示例</span>
            <code v-for="example in activeCommand.examples" :key="example">{{ example }}</code>
          </div>
        </template>
        <template v-else>
          <div class="docs-heading">
            <strong>脚本速查</strong>
          </div>
          <p>输入命令即可看到候选；将光标移入已有命令可查看说明。</p>
          <p>动作可使用英文逗号、分号或换行分隔，<code>//</code> 开头表示注释。</p>
          <div class="command-index">
            <button
                v-for="command in COMBAT_SCRIPT_COMMANDS"
                :key="command.name"
                type="button"
                @click="showCommandHelp(command.name)"
            >
              <code>{{ command.name }}</code>
              <span>{{ command.title }}</span>
            </button>
          </div>
        </template>
      </aside>
    </div>
  </a-modal>

  <a-modal
      v-model:visible="showDiscardConfirm"
      title="未保存的更改"
      width="420px"
      hide-cancel
      ok-text="丢弃所有更改"
      :ok-button-props="{status: 'danger'}"
      :mask-closable="true"
      :esc-to-close="true"
      @ok="discardChanges"
  >
    <p class="discard-warning">当前有未保存的更改，关闭编辑器将丢失全部变更。</p>
  </a-modal>
</template>

<style scoped>
.script-editor-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  align-items: stretch;
  gap: 16px;
  height: clamp(300px, calc(100vh - 210px), 386px);
  min-height: 0;
}

.editor-column {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.editor-column :deep(.combat-script-code-editor) {
  flex: 1 1 auto;
  height: auto;
  min-height: 0;
}

.editor-hints {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px 16px;
  margin-top: 8px;
  color: var(--color-text-3);
  font-size: 12px;
}

kbd {
  padding: 1px 4px;
  border: 1px solid var(--color-border-3);
  border-bottom-width: 2px;
  border-radius: 3px;
  background: var(--color-fill-2);
  font-family: inherit;
}

.script-docs {
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-gutter: stable;
  padding: 14px;
  border: 1px solid var(--color-border-2);
  border-radius: 6px;
  background: var(--color-fill-1);
  color: var(--color-text-2);
}

.script-docs p {
  margin: 8px 0 0;
  line-height: 1.6;
}

.docs-heading {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  color: var(--color-text-1);
}

.docs-heading strong {
  font-size: 16px;
}

.docs-title-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.docs-back-button {
  flex: 0 0 auto;
  margin-left: -6px;
  color: var(--color-text-2);
}

.script-docs code {
  padding: 2px 5px;
  border-radius: 3px;
  background: var(--color-fill-3);
  color: rgb(var(--primary-6));
  font-family: Consolas, "SFMono-Regular", Menlo, monospace;
}

.docs-section {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  margin-top: 16px;
}

.docs-section > span {
  color: var(--color-text-3);
  font-size: 12px;
}

.docs-section p {
  margin: 0;
}

.command-index {
  display: grid;
  gap: 4px;
  margin-top: 14px;
}

.command-index button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-2);
  cursor: pointer;
  text-align: left;
}

.command-index button:hover,
.command-index button:focus-visible {
  background: var(--color-fill-3);
  outline: none;
}

.command-index button span {
  font-size: 12px;
}

.discard-warning {
  margin: 0;
  color: var(--color-text-2);
  line-height: 1.7;
}

@media (max-width: 760px) {
  .script-editor-layout {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(240px, 1fr) minmax(160px, 220px);
    height: clamp(420px, calc(100vh - 180px), 620px);
  }

  .script-docs {
    height: 100%;
  }
}
</style>
