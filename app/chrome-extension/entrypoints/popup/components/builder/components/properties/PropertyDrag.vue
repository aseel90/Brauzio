<template>
  <div>
    <SelectorEditor :node="node" :allowPick="true" title="起点المحدد" targetKey="start" />
    <SelectorEditor :node="node" :allowPick="true" title="终点المحدد" targetKey="end" />
    <div class="hint">
      <small>提示：المسار（path）通常在录制时自动生成，手动إنشاء时可留空。</small>
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
