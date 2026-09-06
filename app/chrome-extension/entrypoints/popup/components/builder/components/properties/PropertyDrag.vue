<template>
  <div>
    <SelectorEditor :node="node" :allowPick="true" title="البدايةالمحدد" targetKey="start" />
    <SelectorEditor :node="node" :allowPick="true" title="النهايةالمحدد" targetKey="end" />
    <div class="hint">
      <small>ملاحظة: يُنشأ المسار (path) تلقائيًا عادةً أثناء التسجيل ويمكن تركه فارغًا عند الإنشاء اليدوي.</small>
    </div>
  </div>
</template>

<script lang="ts" setup>
/* eslint-disable vue/no-mutating-props */
import type { NodeBase } from '@/entrypoints/background/record-replay/types';
import SelectorEditor from './SelectorEditor.vue';

defineProps<{ node: NodeBase }>();
</script>

<style scoped>
.hint {
  color: #64748b;
  margin-top: 8px;
}
</style>
