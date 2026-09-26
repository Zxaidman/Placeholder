import { openDB } from "idb";
const db = () =>
  openDB("thornwake", 1, {
    upgrade(d) {
      d.createObjectStore("data");
    },
  });
export async function save(key: string, value: unknown) {
  return (await db()).put("data", value, key);
}
export async function load<T>(key: string): Promise<T | undefined> {
  return (await db()).get("data", key);
}
export function download(
  name: string,
  data: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
