// Retain links and device preferences from the duplicate TurboHome import.
const aliases = new Map([
  ['4d14f53c-7186-518f-85c6-63f0752a1614', '082fc48b-9cd7-4ae9-ba7a-18bf1ec83dd7'],
]);

export function canonicalWorldId(id: string): string {
  return aliases.get(id) ?? id;
}
