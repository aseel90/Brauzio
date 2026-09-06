<template>
  <div class="form-section">
    <div class="form-group checkbox-group">
      <label class="checkbox-label"
        ><input type="checkbox" v-model="cfg.enabled" /> تفعيلمشغّل</label
      >
    </div>
    <div class="form-group">
      <label class="form-label">描述（اختياري）</label>
      <input class="form-input" v-model="cfg.description" placeholder="说明此مشغّل的用途" />
    </div>
  </div>

  <div class="divider"></div>

  <div class="form-section">
    <div class="section-header"><span class="section-title">触发方式</span></div>
    <div class="form-group checkbox-group">
      <label class="checkbox-label"
        ><input type="checkbox" v-model="cfg.modes.manual" /> 手动</label
      >
      <label class="checkbox-label"
        ><input type="checkbox" v-model="cfg.modes.url" /> 访问 URL</label
      >
      <label class="checkbox-label"
        ><input type="checkbox" v-model="cfg.modes.contextMenu" /> 右键菜单</label
      >
      <label class="checkbox-label"
        ><input type="checkbox" v-model="cfg.modes.command" /> 快捷键</label
      >
      <label class="checkbox-label"
        ><input type="checkbox" v-model="cfg.modes.dom" /> تغير DOM</label
      >
      <label class="checkbox-label"
        ><input type="checkbox" v-model="cfg.modes.schedule" /> 定时</label
      >
    </div>
  </div>

  <div v-if="cfg.modes.url" class="form-section">
    <div class="section-title">访问 URL مطابقة</div>
    <div class="selector-list">
      <div v-for="(r, i) in urlRules" :key="i" class="selector-item">
        <select class="form-select-sm" v-model="r.kind">
          <option value="url">بادئة URL</option>
          <option value="domain">النطاق包含</option>
          <option value="path">بادئة المسار</option>
        </select>
        <input
          class="form-input-sm flex-1"
          v-model="r.value"
          placeholder="例如 https://example.com/app"
        />
        <button class="btn-icon-sm" @click="move(urlRules, i, -1)" :disabled="i === 0">↑</button>
        <button
          class="btn-icon-sm"
          @click="move(urlRules, i, 1)"
          :disabled="i === urlRules.length - 1"
          >↓</button
        >
        <button class="btn-icon-sm danger" @click="urlRules.splice(i, 1)">×</button>
      </div>
    </div>
    <button class="btn-sm" @click="urlRules.push({ kind: 'url', value: '' })">+ إضافة مطابقة</button>
  </div>

  <div v-if="cfg.modes.contextMenu" class="form-section">
    <div class="section-title">右键菜单</div>
    <div class="form-group">
      <label class="form-label">العنوان</label>
      <input class="form-input" v-model="cfg.contextMenu.title" placeholder="菜单العنوان" />
    </div>
    <div class="form-group">
      <label class="form-label">نطاق التطبيق</label>
      <div class="checkbox-group">
        <label class="checkbox-label" v-for="c in menuContexts" :key="c">
          <input type="checkbox" :value="c" v-model="cfg.contextMenu.contexts" /> {{ c }}
        </label>
      </div>
    </div>
  </div>

  <div v-if="cfg.modes.command" class="form-section">
    <div class="section-title">快捷键</div>
    <div class="form-group">
      <label class="form-label">命令键（يجب预先在 manifest commands 中声明）</label>
      <input
        class="form-input"
        v-model="cfg.command.commandKey"
        placeholder="例如 run_quick_trigger_1"
      />
    </div>
    <div class="text-xs text-slate-500" style="padding: 0 20px"
      >提示：Chrome 扩展快捷键يحتاج在 manifest 里固定声明，تعذرتشغيل时动态إضافة。</div
    >
  </div>

  <div v-if="cfg.modes.dom" class="form-section">
    <div class="section-title">تغير DOM</div>
    <div class="form-group">
      <label class="form-label">المحدد</label>
      <input class="form-input" v-model="cfg.dom.selector" placeholder="#app .item" />
    </div>
    <div class="form-group checkbox-group">
      <label class="checkbox-label"
        ><input type="checkbox" v-model="cfg.dom.appear" /> 出现时触发</label
      >
      <label class="checkbox-label"
        ><input type="checkbox" v-model="cfg.dom.once" /> تشغيل مرة واحدة فقط</label
      >
    </div>
    <div class="form-group">
      <label class="form-label">去抖(ms)</label>
      <input class="form-input" type="number" min="0" v-model.number="cfg.dom.debounceMs" />
    </div>
  </div>

  <div v-if="cfg.modes.schedule" class="form-section">
    <div class="section-title">定时</div>
    <div class="selector-list">
      <div v-for="(s, i) in schedules" :key="i" class="selector-item">
        <select class="form-select-sm" v-model="s.type">
          <option value="interval">الفاصل (بالدقائق)</option>
          <option value="daily">يوميًا(HH:mm)</option>
          <option value="once">مرة واحدة (وقت ISO)</option>
        </select>
        <input
          class="form-input-sm flex-1"
          v-model="s.when"
          placeholder="5 或 09:00 或 2025-01-01T10:00:00"
        />
        <label class="checkbox-label"><input type="checkbox" v-model="s.enabled" /> تفعيل</label>
        <button class="btn-icon-sm" @click="move(schedules, i, -1)" :disabled="i === 0">↑</button>
        <button
          class="btn-icon-sm"
          @click="move(schedules, i, 1)"
          :disabled="i === schedules.length - 1"
          >↓</button
        >
        <button class="btn-icon-sm danger" @click="schedules.splice(i, 1)">×</button>
      </div>
    </div>
    <button class="btn-sm" @click="schedules.push({ type: 'interval', when: '5', enabled: true })"
      >+ إضافة جدولة</button
    >
  </div>

  <div class="divider"></div>
  <div class="form-section">
    <div class="text-xs text-slate-500" style="padding: 0 20px"
      >说明：
      مشغّل会在حفظسير العمل时同步到后台触发表（URL/右键/快捷键/DOM）和جدول任务（间隔/يوميًا/مرة واحدة）。
    </div>
  </div>
</template>

<script lang="ts" setup>
/* eslint-disable vue/no-mutating-props */
import { computed } from 'vue';
import type { NodeBase } from '@/entrypoints/background/record-replay/types';

const props = defineProps<{ node: NodeBase }>();

function ensure() {
  const n: any = props.node;
  if (!n.config) n.config = {};
  if (!n.config.modes)
    n.config.modes = {
      manual: true,
      url: false,
      contextMenu: false,
      command: false,
      dom: false,
      schedule: false,
    };
  if (!n.config.url) n.config.url = { rules: [] };
  if (!n.config.contextMenu)
    n.config.contextMenu = { title: 'تشغيلسير العمل', contexts: ['all'], enabled: false };
  if (!n.config.command) n.config.command = { commandKey: '', enabled: false };
  if (!n.config.dom)
    n.config.dom = { selector: '', appear: true, once: true, debounceMs: 800, enabled: false };
  if (!Array.isArray(n.config.schedules)) n.config.schedules = [];
}

const cfg = computed<any>({
  get() {
    ensure();
    return (props.node as any).config;
  },
  set(v) {
    (props.node as any).config = v;
  },
});

const urlRules = computed({
  get() {
    ensure();
    return (props.node as any).config.url.rules as Array<any>;
  },
  set(v) {
    (props.node as any).config.url.rules = v;
  },
});

const schedules = computed({
  get() {
    ensure();
    return (props.node as any).config.schedules as Array<any>;
  },
  set(v) {
    (props.node as any).config.schedules = v;
  },
});

const menuContexts = ['all', 'page', 'selection', 'image', 'link', 'video', 'audio'];

function move(arr: any[], i: number, d: number) {
  const j = i + d;
  if (j < 0 || j >= arr.length) return;
  const t = arr[i];
  arr[i] = arr[j];
  arr[j] = t;
}
</script>

<style scoped></style>
