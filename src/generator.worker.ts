import { generateRoom } from "./generator";
self.onmessage = (
  e: MessageEvent<{ id: number; seed: string; index: number }>,
) => {
  try {
    self.postMessage({
      id: e.data.id,
      result: generateRoom(e.data.seed, e.data.index),
    });
  } catch (error) {
    self.postMessage({
      id: e.data.id,
      error: error instanceof Error ? error.message : "Generation failed",
    });
  }
};
