import { useEffect, useState } from "react";

export default function UserAvatar({ name, src, large = false }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 font-heading font-semibold text-brand-600 ${large ? "h-20 w-20 text-2xl" : "h-9 w-9 text-sm"}`}>
      {src && !failed
        ? <img src={src} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
        : (name || "K").trim().slice(0, 1).toUpperCase() || "K"}
    </span>
  );
}
