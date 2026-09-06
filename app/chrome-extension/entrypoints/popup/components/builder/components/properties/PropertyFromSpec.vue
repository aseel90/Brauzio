<template>
  <PropertyFormRenderer v-if="node && hasSpec" :node="node" :variables="variables" />
  <div v-else class="form-section">
    <div class="section-title">غير موجودالعقدة规范</div>
    <div class="help">该العقدة尚未توفير NodeSpec，تم回退到افتراضيالخاصية面板。</div>
  </div>
  <!-- 将通用字段留给外层 PropertyPanel 渲染（timeoutMs/screenshotOnFail等） -->
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import PropertyFormRenderer from './PropertyFormRenderer.vue';
import { getNodeSpec } from '@/entrypoints/popup/components/builder/model/node-spec-registry';

const props = defineProps<{
  node: any;
  variables?: Array<{ key: string; origin?: string; nodeId?: string; nodeName?: string }>;
}>();
const hasSpec = computed(() => !!getNodeSpec(props.node?.type));
</script>

<style scoped>
.form-section {
  padding: 8px 12px;
}
.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--rr-text);
  margin-bottom: 6px;
}
.help {
  font-size: 12px;
  color: var(--rr-dim);
}
</style>
