import {
  Camera,
  FilePdf,
  ListChecks,
  Microphone,
  Receipt,
  Signature,
  Thermometer,
  VideoCamera,
} from "@phosphor-icons/react/dist/ssr";
import type { EvidenceType } from "@/lib/types";

export const EVIDENCE_ICON: Record<EvidenceType, typeof Camera> = {
  image: Camera,
  video: VideoCamera,
  receipt: Receipt,
  signature: Signature,
  pdf: FilePdf,
  sensor_reading: Thermometer,
  voice_note: Microphone,
  checklist: ListChecks,
};
