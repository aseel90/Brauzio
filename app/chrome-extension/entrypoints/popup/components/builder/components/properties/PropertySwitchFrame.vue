<template>
  <div class="form-section">
    <div class="form-group">
      <label class="form-label">按 URL يحتويمطابقة（优先）</label>
      <input
        class="form-input"
        v-model="(node as any).config.frame.urlContains"
        placeholder="النص الموجود داخل URL الإطار"
      />
    </div>
    <div class="form-group">
      <label class="form-label">المطابقة بالفهرس (يبدأ من 0، للإطارات الفرعية فقط)</label>
      <input class="form-input" v-model="(node as any).config.frame.index" placeholder="رقم الفهرس" />
    </div>
    <div class="text-xs text-slate-500" style="padding: 0 20px"
      >同源/可注入 frame 可用；留فارغ则回到顶级الصفحة</div
    >
  </div>
</template>

<script lang="ts" setup>
/* eslint-disable vue/no-mutating-props */
import type { NodeBase } from '@/entrypoints/background/record-replay/types';
defineProps<{ node: NodeBase }>();
</script>

<style scoped></style>
