import { Suspense } from "react";
import { OrbPreview } from "./preview";

export default function OrbPreviewPage() {
  return (
    <Suspense>
      <OrbPreview />
    </Suspense>
  );
}
