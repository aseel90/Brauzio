<template>
  <div class="form-section">
    <div class="form-group">
      <label class="form-label">文件名包含（اختياري）</label>
      <input
        class="form-input"
        v-model="(node as any).config.filenameContains"
        placeholder="子串مطابقة文件名或URL"
      />
    </div>
    <div class="form-group">
      <label class="form-label">超时(ms)</label>
      <input class="form-input" v-model="(node as any).config.timeoutMs" placeholder="افتراضي 60000" />
    </div>
    <div class="form-group checkbox-group">
      <label class="checkbox-label"
        ><input type="checkbox" v-model="(node as any).config.waitForComplete" />
        انتظار下载完成</label
      >
    </div>
    <div class="form-group">
      <label class="form-label">حفظ到المتغير</label>
      <input class="form-input" v-model="(node as any).config.saveAs" placeholder="افتراضي download" />
    </div>
  </div>
</template>

<script lang="ts" setup>
/* eslint-disable vue/no-mutating-props */
import type { NodeBase } from '@/entrypoints/background/record-replay/types';
defineProps<{ node: NodeBase }>();
</script>

<style scoped></style>
