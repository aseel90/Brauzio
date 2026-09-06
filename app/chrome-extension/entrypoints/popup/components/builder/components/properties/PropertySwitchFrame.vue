<template>
  <div class="form-section">
    <div class="form-group">
      <label class="form-label">المطابقة باحتواء URL (أولوية)</label>
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
      >يعمل مع الإطارات من نفس المصدر أو القابلة للحقن؛ اتركه فارغًا للعودة إلى الصفحة الرئيسية</div
    >
  </div>
</template>

<script lang="ts" setup>
/* eslint-disable vue/no-mutating-props */
import type { NodeBase } from '@/entrypoints/background/record-replay/types';
defineProps<{ node: NodeBase }>();
</script>

<style scoped></style>
