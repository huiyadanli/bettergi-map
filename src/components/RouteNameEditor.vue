<script setup>
import {nextTick, ref} from 'vue';

const props = defineProps({name: String, label: String});
const emit = defineEmits(['confirm', 'editing-end']);
const editing = ref(false);
const draft = ref('');
const input = ref(null);

async function startEditing() {
  draft.value = props.name || '';
  editing.value = true;
  await nextTick();
  input.value?.focus();
  input.value?.select();
}

function confirm() {
  if (!editing.value) return;
  editing.value = false;
  const name = draft.value.trim();
  if (name && name !== props.name) emit('confirm', name);
  emit('editing-end');
}

function handleKeydown(event) {
  event.stopPropagation();
  if (event.isComposing) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    confirm();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    editing.value = false;
    emit('editing-end');
  }
}
</script>

<template>
  <div class="route-name-editor" @click.stop>
    <input v-if="editing" ref="input" v-model="draft" class="name-input"
           :aria-label="label" @blur="confirm" @keydown="handleKeydown" />
    <template v-else>
      <span class="name-text" :title="name">{{ name }}</span>
      <button class="name-edit" type="button" :aria-label="`编辑${label}`" title="重命名" @click="startEditing">
        <icon-edit />
      </button>
    </template>
  </div>
</template>

<style scoped>
.route-name-editor {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  height: 34px;
  gap: 2px;
}

.name-text,
.name-input {
  min-width: 0;
  padding: 0 7px;
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
}

.name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.name-input {
  width: 100%;
  height: 34px;
  box-sizing: border-box;
  border: 0;
  border-radius: 6px;
  outline: none;
  background: rgb(65 126 200 / 8%);
}

.name-edit {
  display: grid;
  place-items: center;
  flex: none;
  width: 30px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #71839b;
  cursor: pointer;
  font-size: 15px;
  transition: color 120ms ease, background-color 120ms ease;
}

.name-edit:hover,
.name-edit:focus-visible {
  color: var(--brand);
  background: var(--brand-soft);
}
</style>
