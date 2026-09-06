<template>
  <div class="form-section">
    <div class="form-group">
      <label class="form-label">العنصرالمحدد</label>
      <input class="form-input" v-model="(node as any).config.selector" placeholder="محدد CSS" />
    </div>
    <div class="form-group">
      <label class="form-label">اسم متغير القائمة</label>
      <input class="form-input" v-model="(node as any).config.saveAs" placeholder="افتراضي elements" />
    </div>
    <div class="form-group">
      <label class="form-label">اسم متغير عنصر التكرار</label>
      <input class="form-input" v-model="(node as any).config.itemVar" placeholder="افتراضي item" />
    </div>
    <div class="form-group">
      <label class="form-label">التدفق الفرعي ID</label>
      <input
        class="form-input"
        v-model="(node as any).config.subflowId"
        placeholder="اختيارأوإنشاء تدفق فرعي"
      />
      <button class="btn-sm" style="margin-top: 8px" @click="onCreateSubflow">إنشاء تدفق فرعي</button>
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
