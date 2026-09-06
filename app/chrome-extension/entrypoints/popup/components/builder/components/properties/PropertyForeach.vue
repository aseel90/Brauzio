<template>
  <div class="form-section">
    <div class="form-group">
      <label class="form-label">列表المتغير</label>
      <input
        class="form-input"
        v-model="(node as any).config.listVar"
        placeholder="workflow.list"
      />
    </div>
    <div class="form-group">
      <label class="form-label">تكرار项اسم المتغير</label>
      <input class="form-input" v-model="(node as any).config.itemVar" placeholder="افتراضي item" />
    </div>
    <div class="form-group">
      <label class="form-label">التدفق الفرعي ID</label>
      <input
        class="form-input"
        v-model="(node as any).config.subflowId"
        placeholder="اختيار或新建التدفق الفرعي"
      />
      <button class="btn-sm" style="margin-top: 8px" @click="onCreateSubflow">新建التدفق الفرعي</button>
    </div>
  </div>
</template>

<script lang="ts" setup>
/* eslint-disable vue/no-mutating-props */
import type { NodeBase } from '@/entrypoints/background/record-replay/types';

const props = defineProps<{ node: NodeBase }>();
const emit = defineEmits<{ (e: 'create-subflow', id: string): void }>();

function onCreateSubflow() {
  const id = prompt('أدخل معرف التدفق الفرعي الجديد');
  if (!id) return;
  emit('create-subflow', id);
  const n = props.node as any;
  if (n && n.config) n.config.subflowId = id;
}
</script>

<style scoped></style>
