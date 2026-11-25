<script setup>
import {nextTick, ref, watch} from 'vue';

const props = defineProps({
  anchor: {type: Object, default: null},
  items: {type: Array, required: true},
});
const emit = defineEmits(['dismiss', 'select']);
const menu = ref(null);
const position = ref({left: '0px', top: '0px'});

function dismiss() {
  emit('dismiss');
}

function dismissOutside(event) {
  if (!(event.target instanceof Node) || !menu.value?.contains(event.target)) dismiss();
}

watch(() => props.anchor, async (anchor, _, onCleanup) => {
  if (!anchor) return;

  position.value = {left: `${anchor.x}px`, top: `${anchor.y}px`};
  document.addEventListener('pointerdown', dismissOutside, true);
  window.addEventListener('scroll', dismissOutside, true);
  window.addEventListener('resize', dismiss);
  onCleanup(() => {
    document.removeEventListener('pointerdown', dismissOutside, true);
    window.removeEventListener('scroll', dismissOutside, true);
    window.removeEventListener('resize', dismiss);
  });

  await nextTick();
  if (props.anchor !== anchor || !menu.value) return;

  const {offsetWidth, offsetHeight} = menu.value;
  position.value = {
    left: `${Math.max(8, Math.min(anchor.x, window.innerWidth - offsetWidth - 8))}px`,
    top: `${Math.max(8, Math.min(anchor.y, window.innerHeight - offsetHeight - 8))}px`,
  };
  menu.value.querySelector('button')?.focus({preventScroll: true});
});

function handleKeydown(event) {
  if (event.key === 'Escape' || event.key === 'Tab') {
    if (event.key === 'Escape') event.preventDefault();
    event.stopPropagation();
    emit('dismiss', true);
    return;
  }

  const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  event.preventDefault();

  const buttons = [...menu.value.querySelectorAll('button')];
  const current = buttons.indexOf(document.activeElement);
  let target = 0;
  if (event.key === 'End') target = buttons.length - 1;
  if (event.key === 'ArrowDown') target = (current + 1) % buttons.length;
  if (event.key === 'ArrowUp') target = (current - 1 + buttons.length) % buttons.length;
  buttons[target]?.focus();
}
</script>

<template>
  <Teleport to="body">
    <Transition name="point-menu">
      <div
          v-if="anchor"
          ref="menu"
          class="point-context-menu"
          :style="position"
          role="menu"
          aria-label="点位操作"
          @contextmenu.prevent
          @keydown="handleKeydown"
      >
        <button
            v-for="item in items"
            :key="item.id"
            type="button"
            role="menuitem"
            tabindex="-1"
            :class="{'is-danger': item.danger}"
            @click="emit('select', item.id)"
        >
          {{ item.label }}
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.point-context-menu {
  position: fixed;
  z-index: 3200;
  display: grid;
  min-width: 144px;
  max-height: calc(100vh - 16px);
  overflow: auto;
  overscroll-behavior: contain;
  padding: 5px;
  border-radius: 10px;
  background: var(--color-bg-popup, #fff);
  box-shadow: 0 8px 24px rgb(31 48 76 / 20%);
}

.point-context-menu button {
  min-height: 34px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  color: var(--text-primary);
  background: transparent;
  font: inherit;
  text-align: left;
  white-space: nowrap;
}

.point-context-menu button:hover,
.point-context-menu button:focus-visible {
  outline: none;
  background: var(--brand-soft);
}

.point-context-menu .is-danger {
  color: var(--danger, #e84646);
}

.point-context-menu .is-danger:hover,
.point-context-menu .is-danger:focus-visible {
  background: var(--danger-soft);
}

.point-menu-enter-active,
.point-menu-leave-active {
  transition: opacity 120ms ease, transform 120ms ease;
}

.point-menu-enter-from,
.point-menu-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}

.point-menu-leave-active {
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .point-menu-enter-active,
  .point-menu-leave-active {
    transition: none;
  }
}
</style>
