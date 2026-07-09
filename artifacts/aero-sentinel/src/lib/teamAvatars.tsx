import { Plane, PlaneTakeoff, PlaneLanding, Compass, CloudLightning, Wind, Radar, Satellite, Waves, Zap, type LucideIcon } from "lucide-react";

export interface AvatarPreset {
  id: string;
  label: string;
  color: string;
  Icon: LucideIcon;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: "plane", label: "Jet", color: "#3b82f6", Icon: Plane },
  { id: "takeoff", label: "Takeoff", color: "#f97316", Icon: PlaneTakeoff },
  { id: "landing", label: "Landing", color: "#10b981", Icon: PlaneLanding },
  { id: "compass", label: "Compass", color: "#f59e0b", Icon: Compass },
  { id: "storm", label: "Storm Cell", color: "#8b5cf6", Icon: CloudLightning },
  { id: "wind", label: "Crosswind", color: "#06b6d4", Icon: Wind },
  { id: "radar", label: "Radar", color: "#ec4899", Icon: Radar },
  { id: "satellite", label: "Satellite", color: "#6366f1", Icon: Satellite },
  { id: "waves", label: "Turbulence", color: "#14b8a6", Icon: Waves },
  { id: "bolt", label: "Lightning", color: "#ef4444", Icon: Zap },
];

const DEFAULT_PRESET_ID = "plane";

export function getAvatarPreset(id: string): AvatarPreset | undefined {
  return AVATAR_PRESETS.find((p) => p.id === id);
}

export function presetAvatarValue(id: string): string {
  return `preset:${id}`;
}

export function defaultAvatarValue(): string {
  return presetAvatarValue(DEFAULT_PRESET_ID);
}

/** Renders a member's avatar: a custom uploaded image, a built-in preset icon, or a neutral fallback. */
export function TeamAvatarView({ avatar, size = 32 }: { avatar?: string | null; size?: number }) {
  if (avatar && avatar.startsWith("data:image/")) {
    return (
      <img
        src={avatar}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    );
  }

  const presetId = avatar?.startsWith("preset:") ? avatar.slice(7) : undefined;
  const preset = presetId ? getAvatarPreset(presetId) : undefined;

  if (!preset) {
    return (
      <div
        style={{
          width: size, height: size, borderRadius: "50%", flexShrink: 0,
          backgroundColor: "rgba(148,163,184,0.15)",
          border: "1px solid rgba(148,163,184,0.3)",
        }}
      />
    );
  }

  const { Icon, color } = preset;
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        backgroundColor: `${color}22`,
        border: `1px solid ${color}55`,
      }}
    >
      <Icon size={Math.round(size * 0.55)} color={color} strokeWidth={2.25} />
    </div>
  );
}

export const MAX_AVATAR_UPLOAD_BYTES = 5 * 1024 * 1024;
const UPLOAD_TARGET_SIZE = 128;

/** Center-crops and downsizes an uploaded image file to a small square PNG data URL, so custom avatars stay cheap to store and send. */
export function resizeImageToAvatarDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("File must be an image"));
      return;
    }
    if (file.size > MAX_AVATAR_UPLOAD_BYTES) {
      reject(new Error("Image is too large (max 5MB)"));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not decode image"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = UPLOAD_TARGET_SIZE;
        canvas.height = UPLOAD_TARGET_SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas not supported"));
          return;
        }
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, UPLOAD_TARGET_SIZE, UPLOAD_TARGET_SIZE);
        resolve(canvas.toDataURL("image/png", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
