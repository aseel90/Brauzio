<template>
  <div class="form-section">
    <div class="form-group">
      <label class="form-label">إغلاق حسب URL (اختياري)</label>
      <input class="form-input" v-model="(node as any).config.url" placeholder="مطابقة جزء من URL" />
    </div>
    <div class="form-group">
      <label class="form-label">معرفات علامات التبويب (مصفوفة JSON، اختياري)</label>
      <textarea class="form-textarea" v-model="tabIdsJson" rows="2" placeholder="[1,2]"></textarea>
    </div>
  </div>
</template>

<script lang="ts" setup>
/* eslint-disable vue/no-mutating-props */
import { computed } from 'vue';
import type { NodeBase } from '@/entrypoints/background/record-replay/types';

const props = defineProps<{ node: NodeBase }>();

const tabIdsJson = computed({
  get() {
    try {
      const arr = (props.node as any).config?.tabIds;
      return Array.isArray(arr) ? JSON.stringify(arr) : '';
    } catch {
      return '';
    }
  },
  set(v: string) {
    try {
      (props.node as any).config.tabIds = v ? JSON.parse(v) : [];
    } catch {}
  },
});
</script>

<style scoped></style>
