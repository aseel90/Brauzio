/**
  * Brauzio internal note.
  * Brauzio internal note.
 */

/* Brauzio internal note. */
export type JsonPrimitive = string | number | boolean | null;

/* Brauzio internal note. */
export interface JsonObject {
  [key: string]: JsonValue;
}

/* Brauzio internal note. */
export type JsonArray = JsonValue[];

/* Brauzio internal note. */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/* Brauzio internal note. */
export type ISODateTimeString = string;

/* Brauzio internal note. */
export type UnixMillis = number;
