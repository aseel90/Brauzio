<template>
  <div class="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-slate-50">
    <div v-if="messages.length === 0" class="text-xs text-slate-500 text-center mt-4">
      ابدأ محادثة عبر Brauzio Cloud. يتم تنفيذ أوامر المتصفح من خلال اتصال MCP البعيد.
    </div>

    <MessageItem v-for="message in messages" :key="message.id" :message="message" />
  </div>
</template>

<script lang="ts" setup>
import type { AgentMessage } from 'brauzio-shared';
import MessageItem from './MessageItem.vue';

defineProps<{
  messages: AgentMessage[];
}>();
</script>
