import type { NodeBase } from '@/entrypoints/background/record-replay/types';
import { STEP_TYPES } from 'brauzio-shared';

export function validateNode(n: NodeBase): string[] {
  const errs: string[] = [];
  const c: any = n.config || {};

  switch (n.type) {
    case STEP_TYPES.CLICK:
    case STEP_TYPES.DBLCLICK:
    case 'fill': {
      const hasCandidate = !!c?.target?.candidates?.length;
      if (!hasCandidate) errs.push('لا يوجد محدد هدف');
      if (n.type === 'fill' && (!('value' in c) || c.value === undefined)) errs.push('قيمة الإدخال مفقودة');
      break;
    }
    case STEP_TYPES.WAIT: {
      if (!c?.condition) errs.push('شرط الانتظار مفقود');
      break;
    }
    case STEP_TYPES.ASSERT: {
      if (!c?.assert) errs.push('شرط التحقق مفقود');
      break;
    }
    case STEP_TYPES.NAVIGATE: {
      if (!c?.url) errs.push('عنوان URL مفقود');
      break;
    }
    case STEP_TYPES.HTTP: {
      if (!c?.url) errs.push('HTTP: عنوان URL مفقود');
      if (c?.assign && typeof c.assign === 'object') {
        const pathRe = /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+|\[\d+\])*$/;
        for (const v of Object.values(c.assign)) {
          const s = String(v);
          if (!pathRe.test(s)) errs.push(`Assign: مسار غير صالح ${s}`);
        }
      }
      break;
    }
    case STEP_TYPES.HANDLE_DOWNLOAD: {
      // filenameContains اختياري
      break;
    }
    case STEP_TYPES.EXTRACT: {
      if (!c?.saveAs) errs.push('Extract: يجب إدخال اسم متغير الحفظ');
      if (!c?.selector && !c?.js) errs.push('Extract: يجب توفير selector أو js');
      break;
    }
    case STEP_TYPES.SWITCH_TAB: {
      if (!c?.tabId && !c?.urlContains && !c?.titleContains)
        errs.push('SwitchTab: يجب توفير tabId أو مطابقة URL/العنوان');
      break;
    }
    case STEP_TYPES.SCREENSHOT: {
      // Brauzio internal note.
      break;
    }
    case STEP_TYPES.TRIGGER_EVENT: {
      const hasCandidate = !!c?.target?.candidates?.length;
      if (!hasCandidate) errs.push('لا يوجد محدد هدف');
      if (!String(c?.event || '').trim()) errs.push('يجب تحديد نوع الحدث');
      break;
    }
    case STEP_TYPES.IF: {
      const arr = Array.isArray(c?.branches) ? c.branches : [];
      if (arr.length === 0) errs.push('يجب إضافة فرع شرطي واحد على الأقل');
      for (let i = 0; i < arr.length; i++) {
        if (!String(arr[i]?.expr || '').trim()) errs.push(`فرع${i + 1}: يجب إدخال تعبير الشرط`);
      }
      break;
    }
    case STEP_TYPES.SET_ATTRIBUTE: {
      const hasCandidate = !!c?.target?.candidates?.length;
      if (!hasCandidate) errs.push('لا يوجد محدد هدف');
      if (!String(c?.name || '').trim()) errs.push('يجب إدخال اسم الخاصية');
      break;
    }
    case STEP_TYPES.LOOP_ELEMENTS: {
      if (!String(c?.selector || '').trim()) errs.push('يجب توفير محدد العنصر');
      if (!String(c?.subflowId || '').trim()) errs.push('يجب توفير معرف التدفق الفرعي');
      break;
    }
    case STEP_TYPES.SWITCH_FRAME: {
      // Both index/urlContains optional; empty means switch back to top frame
      break;
    }
    case STEP_TYPES.EXECUTE_FLOW: {
      if (!String(c?.flowId || '').trim()) errs.push('يجب اختيار سير العمل المراد تشغيله');
      break;
    }
    case STEP_TYPES.CLOSE_TAB: {
      // Brauzio internal note.
      break;
    }
    case STEP_TYPES.SCRIPT: {
      // Brauzio internal note.
      const hasAssign = c?.assign && Object.keys(c.assign).length > 0;
      if ((c?.saveAs || hasAssign) && !String(c?.code || '').trim())
        errs.push('Script: تم إعداد الحفظ/الربط لكن الكود مفقود');
      if (hasAssign) {
        const pathRe = /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+|\[\d+\])*$/;
        for (const v of Object.values(c.assign || {})) {
          const s = String(v);
          if (!pathRe.test(s)) errs.push(`Assign: مسار غير صالح ${s}`);
        }
      }
      break;
    }
  }
  return errs;
}

export function validateFlow(nodes: NodeBase[]): {
  totalErrors: number;
  nodeErrors: Record<string, string[]>;
} {
  const nodeErrors: Record<string, string[]> = {};
  let totalErrors = 0;
  for (const n of nodes) {
    const e = validateNode(n);
    if (e.length) {
      nodeErrors[n.id] = e;
      totalErrors += e.length;
    }
  }
  return { totalErrors, nodeErrors };
}
