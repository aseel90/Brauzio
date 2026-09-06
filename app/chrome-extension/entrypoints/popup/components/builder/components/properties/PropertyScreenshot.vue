<template>
  <div class="form-section">
    <div class="form-group">
      <label class="form-label">العنصرالمحدد（اختياري）</label>
      <input
        class="form-input"
        v-model="(node as any).config.selector"
        placeholder="اتركه فارغًا لالتقاط المنطقة المرئية أو الصفحة كاملة"
      />
    </div>
    <div class="form-group checkbox-group">
      <label class="checkbox-label"
        ><input type="checkbox" v-model="(node as any).config.fullPage" /> الصفحة كاملةلقطة شاشة</label
      >
    </div>
    <div class="form-group">
      <label class="form-label">حفظ为المتغير</label>
      <input
        class="form-input"
        v-model="(node as any).config.saveAs"
        placeholder="اسم المتغير，例如 shot"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
/* eslint-disable vue/no-mutating-props */
import type { NodeBase } from '@/entrypoints/background/record-replay/types';
defineProps<{ node: NodeBase }>();
</script>

<style scoped></style>
