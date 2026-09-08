<script setup>
import {
  computed,
  getCurrentInstance,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useAttrs,
  watch,
} from 'vue';

defineOptions({inheritAttrs: false});

const props = defineProps({
  modelValue: {
    type: [String, Number, Boolean, Array],
    default: '',
  },
  options: {
    type: Array,
    default: () => [],
  },
  placeholder: {
    type: String,
    default: '请选择',
  },
  disabled: Boolean,
  clearable: Boolean,
  multiple: Boolean,
  searchable: Boolean,
  inputValue: {
    type: String,
    default: '',
  },
  size: {
    type: String,
    default: 'regular',
    validator: (value) => ['compact', 'regular'].includes(value),
  },
});

const emit = defineEmits([
  'update:modelValue',
  'update:inputValue',
  'change',
  'search',
  'dropdown-reach-bottom',
  'popup-visible-change',
]);
const attrs = useAttrs();
const instance = getCurrentInstance();
const rootElement = ref(null);
const triggerElement = ref(null);
const popupElement = ref(null);
const submenuElement = ref(null);
const searchInputElement = ref(null);
const isOpen = ref(false);
const opensUpward = ref(false);
const activeIndex = ref(-1);
const submenuParentIndex = ref(-1);
const activeChildIndex = ref(-1);
const popupStyle = ref({});
const submenuStyle = ref({});
const listboxId = `comfort-select-${instance?.uid ?? Math.random().toString(36).slice(2)}`;

let triggerResizeObserver = null;
let typeahead = '';
let typeaheadTimer = null;
let popupPositionFrame = 0;
let submenuPositionFrame = 0;

const rootClass = computed(() => attrs.class);
const rootStyle = computed(() => attrs.style);
const triggerAttrs = computed(() => {
  const result = {...attrs};
  delete result.class;
  delete result.style;
  return result;
});
const selectableOptions = computed(() => props.options.flatMap((option) => (
  option.group ? [] : option.children?.length ? option.children : [option]
)));
const selectedIndex = computed(() => props.options.findIndex((option) => {
  const candidates = option.children?.length ? option.children : [option];
  return candidates.some((candidate) => (
    props.multiple && Array.isArray(props.modelValue)
      ? props.modelValue.includes(candidate.value)
      : candidate.value === props.modelValue
  ));
}));
const selectedOption = computed(() => selectableOptions.value.find((option) => option.value === props.modelValue) || null);
const selectedOptions = computed(() => {
  if (!props.multiple || !Array.isArray(props.modelValue)) return [];
  return selectableOptions.value.filter((option) => props.modelValue.includes(option.value));
});
const hasSelection = computed(() => props.multiple ? selectedOptions.value.length > 0 : Boolean(selectedOption.value));

function isOptionEnabled(index) {
  return index >= 0
    && index < props.options.length
    && !props.options[index]?.disabled
    && !props.options[index]?.group;
}

function isOptionSelected(option) {
  return props.multiple
    ? Array.isArray(props.modelValue) && props.modelValue.includes(option.value)
    : option.value === props.modelValue;
}

function optionContainsSelection(option) {
  return option.children?.some(isOptionSelected) || false;
}

function findEnabledIndex(start, direction) {
  if (!props.options.length) return -1;
  let index = start;
  for (let count = 0; count < props.options.length; count += 1) {
    index = (index + direction + props.options.length) % props.options.length;
    if (isOptionEnabled(index)) return index;
  }
  return -1;
}

function scrollActiveIntoView() {
  nextTick(() => {
    popupElement.value
      ?.querySelector(`[data-option-index="${activeIndex.value}"]`)
      ?.scrollIntoView({block: 'nearest'});
  });
}

function updatePopupPosition() {
  if (!isOpen.value || !triggerElement.value) return;
  const rect = triggerElement.value.getBoundingClientRect();
  const viewportPadding = 8;
  const popupGap = 6;
  const spaceBelow = window.innerHeight - rect.bottom - viewportPadding - popupGap;
  const spaceAbove = rect.top - viewportPadding - popupGap;
  opensUpward.value = spaceBelow < 180 && spaceAbove > spaceBelow;
  const availableHeight = opensUpward.value ? spaceAbove : spaceBelow;
  const width = Math.min(Math.max(rect.width, 132), window.innerWidth - viewportPadding * 2);
  const left = Math.min(
    Math.max(viewportPadding, rect.left),
    Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
  );

  const maxHeight = Math.max(96, Math.min(320, Math.floor(availableHeight)));
  popupStyle.value = {
    left: `${Math.round(left)}px`,
    width: `${Math.round(width)}px`,
    maxHeight: `${maxHeight}px`,
    '--comfort-select-menu-max-height': `${maxHeight}px`,
    ...(opensUpward.value
      ? {bottom: `${Math.round(window.innerHeight - rect.top + popupGap)}px`, top: 'auto'}
      : {top: `${Math.round(rect.bottom + popupGap)}px`, bottom: 'auto'}),
  };
  nextTick(updateSubmenuPosition);
}

function updateSubmenuPosition() {
  if (!isOpen.value || submenuParentIndex.value < 0 || !popupElement.value) return;
  const parent = popupElement.value.querySelector(`[data-option-index="${submenuParentIndex.value}"]`);
  if (!parent) return;
  const rect = parent.getBoundingClientRect();
  const viewportPadding = 8;
  const gap = 5;
  const children = props.options[submenuParentIndex.value]?.children || [];
  const longestLabelLength = Math.max(0, ...children.map((child) => String(child.label || '').length));
  const width = Math.min(
    Math.max(148, longestLabelLength * 13 + 48),
    240,
    window.innerWidth - viewportPadding * 2,
  );
  const opensLeft = window.innerWidth - rect.right < width + gap && rect.left > width + gap;
  const desiredLeft = opensLeft ? rect.left - width - gap : rect.right + gap;
  const left = Math.min(
    Math.max(viewportPadding, desiredLeft),
    window.innerWidth - width - viewportPadding,
  );
  const maxHeight = Math.max(96, window.innerHeight - viewportPadding * 2);
  const top = Math.min(
    Math.max(viewportPadding, rect.top - 5),
    Math.max(viewportPadding, window.innerHeight - Math.min(maxHeight, 320) - viewportPadding),
  );
  submenuStyle.value = {
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    width: `${Math.round(width)}px`,
    maxHeight: `${Math.min(maxHeight, 320)}px`,
    '--comfort-select-menu-max-height': `${Math.min(maxHeight, 320)}px`,
  };
}

function schedulePopupPosition() {
  if (popupPositionFrame) return;
  popupPositionFrame = requestAnimationFrame(() => {
    popupPositionFrame = 0;
    updatePopupPosition();
  });
}

function scheduleSubmenuPosition() {
  if (submenuPositionFrame || submenuParentIndex.value < 0) return;
  submenuPositionFrame = requestAnimationFrame(() => {
    submenuPositionFrame = 0;
    updateSubmenuPosition();
  });
}

function handleCapturedScroll(event) {
  const target = event.target;
  if (target instanceof Node && popupElement.value?.contains(target)) {
    scheduleSubmenuPosition();
    return;
  }
  if (target instanceof Node && submenuElement.value?.contains(target)) return;
  schedulePopupPosition();
}

function handleOutsidePointer(event) {
  if (rootElement.value?.contains(event.target)
    || popupElement.value?.contains(event.target)
    || submenuElement.value?.contains(event.target)) return;
  closePopup(false);
}

function bindPopupListeners() {
  document.addEventListener('pointerdown', handleOutsidePointer, true);
  window.addEventListener('resize', schedulePopupPosition);
  window.addEventListener('scroll', handleCapturedScroll, true);
}

function unbindPopupListeners() {
  document.removeEventListener('pointerdown', handleOutsidePointer, true);
  window.removeEventListener('resize', schedulePopupPosition);
  window.removeEventListener('scroll', handleCapturedScroll, true);
}

function openPopup() {
  if (props.disabled || isOpen.value || !props.options.length) return;
  isOpen.value = true;
  activeIndex.value = isOptionEnabled(selectedIndex.value)
    ? selectedIndex.value
    : findEnabledIndex(-1, 1);
  emit('popup-visible-change', true);
  bindPopupListeners();
  nextTick(() => {
    updatePopupPosition();
    scrollActiveIntoView();
    if (props.searchable) searchInputElement.value?.focus();
  });
}

function closePopup(restoreFocus = true) {
  if (!isOpen.value) return;
  isOpen.value = false;
  submenuParentIndex.value = -1;
  activeChildIndex.value = -1;
  if (props.searchable && props.inputValue) {
    emit('update:inputValue', '');
    emit('search', '');
  }
  emit('popup-visible-change', false);
  unbindPopupListeners();
  if (restoreFocus) nextTick(() => triggerElement.value?.focus());
}

function togglePopup() {
  if (isOpen.value) closePopup(false);
  else openPopup();
}

function chooseValueOption(option) {
  if (!option || option.disabled || option.group || option.children?.length) return;
  if (props.multiple) {
    const nextValue = Array.isArray(props.modelValue) ? [...props.modelValue] : [];
    const selectedValueIndex = nextValue.indexOf(option.value);
    if (selectedValueIndex >= 0) nextValue.splice(selectedValueIndex, 1);
    else nextValue.push(option.value);
    emit('update:modelValue', nextValue);
    emit('change', nextValue, option);
    return;
  }
  emit('update:modelValue', option.value);
  emit('change', option.value, option);
  closePopup();
}

function openSubmenu(index) {
  const option = props.options[index];
  if (!option?.children?.length || option.disabled) {
    submenuParentIndex.value = -1;
    activeChildIndex.value = -1;
    return;
  }
  submenuParentIndex.value = index;
  const selectedChildIndex = option.children.findIndex(isOptionSelected);
  activeChildIndex.value = selectedChildIndex >= 0
    ? selectedChildIndex
    : option.children.findIndex((child) => !child.disabled);
  nextTick(updateSubmenuPosition);
}

function chooseOption(index) {
  const option = props.options[index];
  if (option?.children?.length) {
    openSubmenu(index);
    return;
  }
  chooseValueOption(option);
}

function handleOptionPointerEnter(index) {
  if (!isOptionEnabled(index)) return;
  activeIndex.value = index;
  if (props.options[index]?.children?.length) openSubmenu(index);
  else {
    submenuParentIndex.value = -1;
    activeChildIndex.value = -1;
  }
}

function clearSelection(event) {
  event.stopPropagation();
  const emptyValue = props.multiple ? [] : '';
  emit('update:modelValue', emptyValue);
  emit('change', emptyValue, null);
  closePopup();
}

function moveActive(direction) {
  activeIndex.value = findEnabledIndex(activeIndex.value, direction);
  scrollActiveIntoView();
}

function moveActiveChild(direction) {
  const children = props.options[submenuParentIndex.value]?.children || [];
  if (!children.length) return;
  let index = activeChildIndex.value;
  for (let count = 0; count < children.length; count += 1) {
    index = (index + direction + children.length) % children.length;
    if (!children[index]?.disabled) {
      activeChildIndex.value = index;
      nextTick(() => {
        submenuElement.value
          ?.querySelector(`[data-child-index="${index}"]`)
          ?.scrollIntoView({block: 'nearest'});
      });
      return;
    }
  }
}

function handleTypeahead(key) {
  clearTimeout(typeaheadTimer);
  typeahead += key.toLocaleLowerCase();
  typeaheadTimer = window.setTimeout(() => {
    typeahead = '';
  }, 500);
  const index = props.options.findIndex((option) => (
    !option.disabled && !option.group && String(option.label).toLocaleLowerCase().startsWith(typeahead)
  ));
  if (index >= 0) {
    activeIndex.value = index;
    scrollActiveIntoView();
  }
}

function handleSearchInput(event) {
  const value = event.target.value;
  emit('update:inputValue', value);
  emit('search', value);
  activeIndex.value = findEnabledIndex(-1, 1);
  nextTick(updatePopupPosition);
}

function handleMenuScroll(event) {
  const element = event.currentTarget;
  if (element.scrollHeight - element.scrollTop - element.clientHeight <= 24) {
    emit('dropdown-reach-bottom');
  }
  scheduleSubmenuPosition();
}

function handleKeydown(event) {
  if (props.disabled) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (!isOpen.value) openPopup();
    else if (submenuParentIndex.value >= 0) moveActiveChild(event.key === 'ArrowDown' ? 1 : -1);
    else moveActive(event.key === 'ArrowDown' ? 1 : -1);
    return;
  }
  if (event.key === 'ArrowRight' && isOpen.value) {
    event.preventDefault();
    openSubmenu(activeIndex.value);
    return;
  }
  if (event.key === 'ArrowLeft' && submenuParentIndex.value >= 0) {
    event.preventDefault();
    submenuParentIndex.value = -1;
    activeChildIndex.value = -1;
    return;
  }
  if (event.key === 'Home' || event.key === 'End') {
    if (!isOpen.value) return;
    event.preventDefault();
    const start = event.key === 'Home' ? -1 : 0;
    const direction = event.key === 'Home' ? 1 : -1;
    if (submenuParentIndex.value >= 0) {
      const children = props.options[submenuParentIndex.value]?.children || [];
      const ordered = event.key === 'Home' ? children : [...children].reverse();
      const child = ordered.find((item) => !item.disabled);
      activeChildIndex.value = children.indexOf(child);
    } else {
      activeIndex.value = findEnabledIndex(start, direction);
      scrollActiveIntoView();
    }
    return;
  }
  if (event.key === 'Enter' || (event.key === ' ' && !props.searchable)) {
    event.preventDefault();
    if (!isOpen.value) openPopup();
    else if (submenuParentIndex.value >= 0 && activeChildIndex.value >= 0) {
      chooseValueOption(props.options[submenuParentIndex.value]?.children?.[activeChildIndex.value]);
    } else if (isOptionEnabled(activeIndex.value)) chooseOption(activeIndex.value);
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    if (submenuParentIndex.value >= 0) {
      submenuParentIndex.value = -1;
      activeChildIndex.value = -1;
    } else closePopup();
    return;
  }
  if (event.key === 'Tab') {
    closePopup(false);
    return;
  }
  if (!props.searchable && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    if (!isOpen.value) openPopup();
    handleTypeahead(event.key);
  }
}

watch(() => props.modelValue, () => {
  if (isOpen.value) activeIndex.value = selectedIndex.value;
});

watch(() => props.options, () => {
  if (!isOpen.value) return;
  activeIndex.value = isOptionEnabled(selectedIndex.value)
    ? selectedIndex.value
    : findEnabledIndex(-1, 1);
  nextTick(updatePopupPosition);
}, {deep: true});

onMounted(() => {
  triggerResizeObserver = new ResizeObserver(schedulePopupPosition);
  if (triggerElement.value) triggerResizeObserver.observe(triggerElement.value);
});

onBeforeUnmount(() => {
  triggerResizeObserver?.disconnect();
  clearTimeout(typeaheadTimer);
  if (popupPositionFrame) cancelAnimationFrame(popupPositionFrame);
  if (submenuPositionFrame) cancelAnimationFrame(submenuPositionFrame);
  unbindPopupListeners();
});
</script>

<template>
  <div
      ref="rootElement"
      class="comfort-select"
      :class="[rootClass, `comfort-select-${size}`, {'is-open': isOpen, 'is-disabled': disabled}]"
      :style="rootStyle"
      @mousedown.stop
      @dragstart.stop.prevent
  >
    <button
        ref="triggerElement"
        v-bind="triggerAttrs"
        type="button"
        class="comfort-select-trigger"
        :disabled="disabled"
        role="combobox"
        :aria-expanded="isOpen"
        aria-haspopup="listbox"
        :aria-controls="listboxId"
        :aria-activedescendant="isOpen && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined"
        @click="togglePopup"
        @keydown="handleKeydown"
    >
      <span
          v-if="!multiple"
          class="comfort-select-value"
          :class="{'is-placeholder': !selectedOption}"
      >{{ selectedOption?.label ?? placeholder }}</span>
      <span v-else-if="selectedOptions.length" class="comfort-select-multiple-value">
        <span v-for="option in selectedOptions" :key="option.value" class="comfort-select-chip">
          {{ option.label }}
        </span>
      </span>
      <span v-else class="comfort-select-value is-placeholder">{{ placeholder }}</span>
      <span
          v-if="clearable && hasSelection && !disabled"
          class="comfort-select-clear"
          role="button"
          aria-label="清除选择"
          tabindex="-1"
          @click="clearSelection"
      >×</span>
      <svg class="comfort-select-chevron" viewBox="0 0 12 8" aria-hidden="true">
        <path d="M1 1.25 6 6.25l5-5"/>
      </svg>
    </button>

    <Teleport to="body">
      <Transition name="comfort-select-popup">
        <div
            v-if="isOpen"
            :id="listboxId"
            ref="popupElement"
            class="comfort-select-menu"
            :class="{'opens-upward': opensUpward}"
            :style="popupStyle"
            role="listbox"
            :aria-multiselectable="multiple || undefined"
            :aria-label="triggerAttrs['aria-label'] || placeholder"
        >
          <div class="comfort-select-menu-scroll" @scroll="handleMenuScroll">
            <div v-if="searchable" class="comfort-select-search-wrap">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="7" cy="7" r="4.5"/>
                <path d="m10.5 10.5 3 3"/>
              </svg>
              <input
                  ref="searchInputElement"
                  class="comfort-select-search"
                  type="text"
                  :value="inputValue"
                  placeholder="搜索"
                  aria-label="搜索选项"
                  @input="handleSearchInput"
                  @keydown="handleKeydown"
              />
            </div>
            <template
                v-for="(option, index) in options"
                :key="option.group || option.children?.length ? `section-${index}` : option.value"
            >
              <div v-if="option.group" class="comfort-select-group">{{ option.label }}</div>
              <button
                  v-else
                  :id="`${listboxId}-${index}`"
                  type="button"
                  class="comfort-select-option"
                  :class="{
                    'is-active': activeIndex === index,
                    'is-selected': isOptionSelected(option),
                    'contains-selection': optionContainsSelection(option),
                    'has-children': option.children?.length,
                  }"
                  :disabled="option.disabled"
                  :data-option-index="index"
                  role="option"
                  :aria-selected="isOptionSelected(option) || optionContainsSelection(option)"
                  :aria-haspopup="option.children?.length ? 'listbox' : undefined"
                  :aria-expanded="option.children?.length ? submenuParentIndex === index : undefined"
                  @pointerenter="handleOptionPointerEnter(index)"
                  @click="chooseOption(index)"
              >
                <span>{{ option.label }}</span>
                <span v-if="option.meta" class="comfort-select-option-meta">{{ option.meta }}</span>
                <svg v-if="option.children?.length" class="comfort-select-submenu-chevron" viewBox="0 0 10 16" aria-hidden="true">
                  <path d="m2 2 6 6-6 6"/>
                </svg>
                <svg v-else-if="isOptionSelected(option)" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="m3 8.5 3.1 3.1L13 4.8"/>
                </svg>
              </button>
            </template>
          </div>
        </div>
      </Transition>
      <Transition name="comfort-select-submenu">
        <div
            v-if="isOpen && submenuParentIndex >= 0"
            ref="submenuElement"
            class="comfort-select-menu comfort-select-submenu"
            :style="submenuStyle"
            role="listbox"
            aria-label="二级选项"
        >
          <div class="comfort-select-menu-scroll">
            <button
                v-for="(child, childIndex) in options[submenuParentIndex]?.children || []"
                :key="child.value"
                type="button"
                class="comfort-select-option"
                :class="{'is-active': activeChildIndex === childIndex, 'is-selected': isOptionSelected(child)}"
                :disabled="child.disabled"
                :data-child-index="childIndex"
                role="option"
                :aria-selected="isOptionSelected(child)"
                @pointerenter="!child.disabled && (activeChildIndex = childIndex)"
                @click="chooseValueOption(child)"
            >
              <span>{{ child.label }}</span>
              <span v-if="child.meta" class="comfort-select-option-meta">{{ child.meta }}</span>
              <svg v-if="isOptionSelected(child)" viewBox="0 0 16 16" aria-hidden="true">
                <path d="m3 8.5 3.1 3.1L13 4.8"/>
              </svg>
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.comfort-select {
  position: relative;
  display: inline-flex;
  min-width: 0;
  height: var(--comfort-select-height, auto);
  vertical-align: middle;
}

.comfort-select-trigger {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 38px;
  gap: 7px;
  padding: 0 11px 0 13px;
  border: 0;
  border-radius: 9px;
  color: #2d4158;
  background: #f0f4f8;
  box-shadow: none;
  cursor: pointer;
  outline: 0;
  text-align: left;
  transition: color 130ms ease, background-color 130ms ease, box-shadow 130ms ease, transform 100ms ease;
}

.comfort-select-compact .comfort-select-trigger {
  min-height: 32px;
  padding-right: 9px;
  padding-left: 11px;
  border-radius: 8px;
  font-size: 13px;
}

.comfort-select-trigger:hover {
  color: #185f9f;
  background: #e7f0fa;
}

.comfort-select.is-open .comfort-select-trigger,
.comfort-select-trigger:focus-visible {
  color: #155d9f;
  background: #dfedfb;
  box-shadow: 0 5px 14px rgb(38 91 145 / 13%);
}

.comfort-select-trigger:active {
  transform: scale(0.985);
}

.comfort-select-trigger:disabled {
  color: #a2adba;
  background: #f3f5f7;
  box-shadow: none;
  cursor: not-allowed;
}

.comfort-select-value {
  overflow: hidden;
  min-width: 0;
  font-weight: 520;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comfort-select-value.is-placeholder {
  color: #8d9baa;
  font-weight: 400;
}

.comfort-select-multiple-value {
  display: flex;
  flex-wrap: wrap;
  min-width: 0;
  gap: 4px;
  padding: 4px 0;
}

.comfort-select-chip {
  overflow: hidden;
  max-width: 100%;
  padding: 3px 7px;
  border-radius: 6px;
  color: #155d9f;
  background: #dbeafa;
  font-size: 12px;
  font-weight: 550;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comfort-select-chevron {
  width: 11px;
  height: 7px;
  overflow: visible;
  color: #6e8094;
  transition: color 130ms ease, transform 160ms cubic-bezier(.22, .8, .3, 1);
}

.comfort-select-chevron path {
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.6;
}

.comfort-select.is-open .comfort-select-chevron {
  color: #176db9;
  transform: rotate(180deg);
}

.comfort-select-clear {
  display: inline-grid;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  color: #7f8fa1;
  background: transparent;
  cursor: pointer;
  font-size: 17px;
  line-height: 1;
  place-items: center;
}

.comfort-select-clear:hover {
  color: #315878;
  background: rgb(34 96 150 / 10%);
}

.comfort-select-menu {
  position: fixed;
  z-index: 3200;
  display: block;
  padding: 5px;
  overflow: hidden;
  border-radius: 11px;
  background: rgb(255 255 255 / 97%);
  box-shadow: 0 16px 38px rgb(31 48 76 / 18%), 0 2px 8px rgb(31 48 76 / 8%);
  transform-origin: center top;
}

.comfort-select-menu-scroll {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: calc(var(--comfort-select-menu-max-height, 320px) - 10px);
  overflow-x: hidden;
  overflow-y: auto;
  border-radius: 7px;
  overscroll-behavior: contain;
  scrollbar-color: rgb(104 123 145 / 58%) transparent;
  scrollbar-width: thin;
}

.comfort-select-menu-scroll::-webkit-scrollbar {
  width: 6px;
}

.comfort-select-menu-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.comfort-select-menu-scroll::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgb(104 123 145 / 52%);
}

.comfort-select-menu-scroll::-webkit-scrollbar-button {
  display: none;
  width: 0;
  height: 0;
}

.comfort-select-menu.opens-upward {
  transform-origin: center bottom;
}

.comfort-select-search-wrap {
  position: sticky;
  top: 0;
  z-index: 2;
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  margin: -1px -1px 3px;
  padding: 7px 9px;
  border-radius: 8px;
  color: #718397;
  background: rgb(247 250 253 / 98%);
}

.comfort-select-search-wrap svg {
  width: 15px;
  height: 15px;
}

.comfort-select-search-wrap svg circle,
.comfort-select-search-wrap svg path {
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-width: 1.5;
}

.comfort-select-search {
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  color: #2d4158;
  background: transparent;
  font-size: 13px;
  line-height: 24px;
  outline: 0;
}

.comfort-select-search::placeholder {
  color: #9aa7b5;
}

.comfort-select-group {
  padding: 8px 10px 4px;
  color: #8a98a8;
  font-size: 11px;
  font-weight: 650;
}

.comfort-select-option {
  display: flex;
  align-items: center;
  flex: none;
  width: 100%;
  min-height: 36px;
  gap: 9px;
  padding: 6px 10px;
  border: 0;
  border-radius: 8px;
  color: #364b62;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  text-align: left;
  transition: color 100ms ease, background-color 100ms ease, transform 100ms ease;
}

.comfort-select-option:hover,
.comfort-select-option.is-active {
  color: #174f83;
  background: #eaf3fc;
}

.comfort-select-option.is-selected {
  color: #1264ad;
  background: #deedfb;
  font-weight: 600;
}

.comfort-select-option.contains-selection {
  color: #1766aa;
  background: #edf5fc;
  font-weight: 600;
}

.comfort-select-option:active {
  transform: scale(0.985);
}

.comfort-select-option:disabled {
  color: #adb7c2;
  background: transparent;
  cursor: not-allowed;
}

.comfort-select-option > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comfort-select-option > span:first-child {
  flex: 1 1 auto;
  min-width: 0;
}

.comfort-select-option-meta {
  flex: none;
  color: #8a98a8;
  font-size: 11px;
  font-weight: 400;
}

.comfort-select-option svg {
  flex: none;
  width: 15px;
  height: 15px;
  color: #1677c8;
}

.comfort-select-option svg path {
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.comfort-select-submenu-chevron {
  color: #7b8da0 !important;
}

.comfort-select-option.is-active .comfort-select-submenu-chevron {
  color: #176db9 !important;
}

.comfort-select-submenu {
  z-index: 3201;
  transform-origin: left top;
}

.comfort-select-popup-enter-active,
.comfort-select-popup-leave-active {
  transition: opacity 120ms ease, transform 150ms cubic-bezier(.22, .8, .3, 1);
}

.comfort-select-popup-enter-from,
.comfort-select-popup-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.985);
}

.comfort-select-menu.opens-upward.comfort-select-popup-enter-from,
.comfort-select-menu.opens-upward.comfort-select-popup-leave-to {
  transform: translateY(4px) scale(0.985);
}

.comfort-select-submenu-enter-active,
.comfort-select-submenu-leave-active {
  transition: opacity 110ms ease, transform 140ms cubic-bezier(.22, .8, .3, 1);
}

.comfort-select-submenu-enter-from,
.comfort-select-submenu-leave-to {
  opacity: 0;
  transform: translateX(-4px) scale(0.985);
}

@media (prefers-reduced-motion: reduce) {
  .comfort-select-trigger,
  .comfort-select-chevron,
  .comfort-select-option,
  .comfort-select-popup-enter-active,
  .comfort-select-popup-leave-active,
  .comfort-select-submenu-enter-active,
  .comfort-select-submenu-leave-active {
    transition: none;
  }
}
</style>
