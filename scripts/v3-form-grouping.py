from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Expected source block not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


path = "app/chrome-extension/entrypoints/background/runtime-v3/types.ts"
replace_once(path, """export interface V3Frame {
""", """export interface V3FormSummary {
  formId: string;
  backendNodeId: number;
  documentId: string;
  frameId: string;
  id?: string;
  name?: string;
  action?: string;
  method?: string;
  fields: string[];
}

export interface V3Frame {
""")
replace_once(path, """  tabs: V3TabSummary[];
  frames: V3Frame[];
  elements: V3Element[];
""", """  tabs: V3TabSummary[];
  frames: V3Frame[];
  forms: V3FormSummary[];
  elements: V3Element[];
""")

path = "app/chrome-extension/entrypoints/background/runtime-v3/observation-service.ts"
replace_once(path, """  V3Element,
  V3Frame,
  V3ObservationSnapshot,
""", """  V3Element,
  V3FormSummary,
  V3Frame,
  V3ObservationSnapshot,
""")
replace_once(path, """    const elements: V3Element[] = [];
    let focusedEid: string | undefined;
""", """    const elements: V3Element[] = [];
    const forms = new Map<string, V3FormSummary>();
    let focusedEid: string | undefined;
""")
replace_once(path, """        const nodes = document.nodes || {};
        const layout = layoutMap(document);
        const backendIds: number[] = Array.isArray(nodes.backendNodeId) ? nodes.backendNodeId : [];
        for (let nodeIndex = 0; nodeIndex < backendIds.length; nodeIndex += 1) {
""", """        const nodes = document.nodes || {};
        const layout = layoutMap(document);
        const backendIds: number[] = Array.isArray(nodes.backendNodeId) ? nodes.backendNodeId : [];
        const parentIndexes: number[] = Array.isArray(nodes.parentIndex) ? nodes.parentIndex : [];
        const effectiveSessionId = context.sessionId || loader?.sessionId;
        const effectiveTargetId = context.targetId || loader?.targetId;
        const formIdByIndex = new Map<number, string>();

        for (let formIndex = 0; formIndex < backendIds.length; formIndex += 1) {
          const formTag = readString(strings, nodes.nodeName?.[formIndex]).toUpperCase();
          if (formTag !== 'FORM') continue;
          const formBackendNodeId = Number(backendIds[formIndex] || 0);
          if (!formBackendNodeId) continue;
          const attrs = attributesAt(nodes, formIndex, strings);
          const formId = makeElementId(documentId, formBackendNodeId, effectiveSessionId).replace(/^e_/, 'f_');
          formIdByIndex.set(formIndex, formId);
          forms.set(formId, {
            formId,
            backendNodeId: formBackendNodeId,
            documentId,
            frameId,
            id: attrs.id || undefined,
            name: attrs.name || undefined,
            action: attrs.action || undefined,
            method: String(attrs.method || 'get').toLowerCase(),
            fields: [],
          });
        }

        const owningFormId = (nodeIndex: number): string | undefined => {
          let current = Number(parentIndexes[nodeIndex]);
          let guard = 0;
          while (Number.isInteger(current) && current >= 0 && guard++ < 80) {
            const formId = formIdByIndex.get(current);
            if (formId) return formId;
            current = Number(parentIndexes[current]);
          }
          return undefined;
        };

        for (let nodeIndex = 0; nodeIndex < backendIds.length; nodeIndex += 1) {
""")
replace_once(path, """          const effectiveSessionId = context.sessionId || loader?.sessionId;
          const effectiveTargetId = context.targetId || loader?.targetId;
          const eid = makeElementId(documentId, backendNodeId, effectiveSessionId);
""", """          const eid = makeElementId(documentId, backendNodeId, effectiveSessionId);
""")
replace_once(path, """          const element: V3Element = { ...elementBase, signature: elementSignature(elementBase) };
          elements.push(element);
          if (boolish(axProp(ax, 'focused')) === true) focusedEid = eid;
""", """          const element: V3Element = { ...elementBase, signature: elementSignature(elementBase) };
          elements.push(element);
          const formId = owningFormId(nodeIndex);
          if (formId && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tag)) {
            const form = forms.get(formId);
            if (form && !form.fields.includes(eid)) form.fields.push(eid);
          }
          if (boolish(axProp(ax, 'focused')) === true) focusedEid = eid;
""")
replace_once(path, """      tabs,
      frames,
      elements: limited,
""", """      tabs,
      frames,
      forms: [...forms.values()].filter((form) => form.fields.length > 0),
      elements: limited,
""")

print("form grouping transforms applied")
