<template>
  <div class="form-section">
    <div class="form-group">
      <label class="form-label">معرف علامة التبويب (اختياري)</label>
      <input
        class="form-input"
        type="number"
        v-model.number="(node as any).config.tabId"
        placeholder="رقم"
      />
    </div>
    <div class="form-group" :class="{ invalid: needOne && !hasAny }">
      <label class="form-label">يحتوي URL على (اختياري)</label>
      <input class="form-input" v-model="(node as any).config.urlContains" placeholder="مطابقة جزء من النص" />
    </div>
    <div class="form-group" :class="{ invalid: needOne && !hasAny }">
      <label class="form-label">العنوانيحتوي（اختياري）</label>
      <input
        class="form-input"
        v-model="(node as any).config.titleContains"
        placeholder="مطابقة جزء من النص"
      />
    </div>
    <div
      v-if="needOne && !hasAny"
      class="text-xs text-slate-500"
      style="padding: 0 20px; color: var(--rr-danger)"
      >يجب توفير tabId أو مطابقة URL/العنوان</div
    >
  </div>
</template>

<script lang="ts" setup>
/* eslint-disable vue/no-mutating-props */
import { computed } from 'vue';
import type { NodeBase } from '@/entrypoints/background/record-replay/types';

const props = defineProps<{ node: NodeBase }>();
const needOne = true;
const hasAny = computed(() => {
  const c: any = (props.node as any).config || {};
  return !!(c.tabId || c.urlContains || c.titleContains);
});
</script>

<style scoped></style>
