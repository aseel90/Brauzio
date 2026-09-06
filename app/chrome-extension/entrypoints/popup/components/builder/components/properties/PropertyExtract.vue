<template>
  <div class="form-section">
    <div class="form-group">
      <label class="form-label">العنصرالمحدد（اختياري）</label>
      <input class="form-input" v-model="(node as any).config.selector" placeholder="محدد CSS" />
    </div>
    <div class="form-group">
      <label class="form-label">الخاصية</label>
      <input
        class="form-input"
        v-model="(node as any).config.attr"
        placeholder="text/textContent أو اسم الخاصية"
      />
    </div>
    <div class="form-group">
      <label class="form-label">自定义 JS（رجوع值）</label>
      <textarea
        class="form-textarea"
        v-model="(node as any).config.js"
        rows="3"
        placeholder="return document.title"
      ></textarea>
    </div>
    <div class="form-group" :class="{ invalid: !(node as any).config?.saveAs }">
      <label class="form-label">حفظ为المتغير</label>
      <input class="form-input" v-model="(node as any).config.saveAs" placeholder="اسم المتغير" />
    </div>
  </div>
</template>

<script lang="ts" setup>
/* eslint-disable vue/no-mutating-props */
import type { NodeBase } from '@/entrypoints/background/record-replay/types';
defineProps<{ node: NodeBase }>();
</script>

<style scoped></style>
