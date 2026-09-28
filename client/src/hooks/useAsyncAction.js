import { useRef, useState } from "react";

// The ref locks immediately, including two clicks before React renders again.
export default function useAsyncAction() {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  async function runAction(task) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      return await task();
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return { busy, runAction };
}
