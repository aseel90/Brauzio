/**
  * Brauzio internal note.
  * Brauzio internal note.
 */

import type { JsonValue, UnixMillis } from './json';

/* Brauzio internal note. */
export type VariableName = string;

/* Brauzio internal note. */
export type PersistentVariableName = `$${string}`;

/* Brauzio internal note. */
export type VariableScope = 'run' | 'flow' | 'persistent';

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export interface VariablePointer {
  /* Brauzio internal note. */
  scope: VariableScope;
  /* Brauzio internal note. */
  name: VariableName;
  /* Brauzio internal note. */
  path?: ReadonlyArray<string | number>;
}

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export interface VariableDefinition {
  /* Brauzio internal note. */
  name: VariableName;
  /* Brauzio internal note. */
  label?: string;
  /* Brauzio internal note. */
  description?: string;
  /* Brauzio internal note. */
  sensitive?: boolean;
  /* Brauzio internal note. */
  required?: boolean;
  /* Brauzio internal note. */
  default?: JsonValue;
  /* Brauzio internal note. */
  scope?: Exclude<VariableScope, 'persistent'>;
}

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export interface PersistentVarRecord {
  /* Brauzio internal note. */
  key: PersistentVariableName;
  /* Brauzio internal note. */
  value: JsonValue;
  /* Brauzio internal note. */
  updatedAt: UnixMillis;
  /* Brauzio internal note. */
  version: number;
}

/**
  * Brauzio internal note.
 */
export function isPersistentVariable(name: string): name is PersistentVariableName {
  return name.startsWith('$');
}

/**
  * Brauzio internal note.
 * @example "$user.name" -> { scope: 'persistent', name: '$user', path: ['name'] }
 */
export function parseVariablePointer(ref: string): VariablePointer | null {
  if (!ref) return null;

  const parts = ref.split('.');
  const name = parts[0];
  const path = parts.slice(1);

  if (isPersistentVariable(name)) {
    return {
      scope: 'persistent',
      name,
      path: path.length > 0 ? path : undefined,
    };
  }

  // Brauzio internal note.
  return {
    scope: 'run',
    name,
    path: path.length > 0 ? path : undefined,
  };
}
