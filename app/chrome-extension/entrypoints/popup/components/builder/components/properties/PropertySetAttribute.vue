<template>
  <div>
    <SelectorEditor :node="node" :allowPick="true" />
    <div class="form-section">
      <div class="form-group">
        <label class="form-label">اسم الخاصية</label>
        <input
          class="form-input"
          v-model="(node as any).config.name"
          placeholder="مثل value/src/disabled وغيرها"
        />
      </div>
      <div class="form-group">
        <label class="form-label">قيمة الخاصية (اتركها فارغة وحدد حذف لإزالتها)</label>
        <input class="form-input" v-model="(node as any).config.value" placeholder="قيمة الخاصية" />
      </div>
      <div class="form-group checkbox-group">
        <label class="checkbox-label"
          ><input type="checkbox" v-model="(node as any).config.remove" /> حذفالخاصية</label
        >
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
/* eslint-disable vue/no-mutating-props */
import type { NodeBase } from '@/entrypoints/background/record-replay/types';
import SelectorEditor from './SelectorEditor.vue';

defineProps<{ node: NodeBase }>();
</script>

<style scoped></style>
