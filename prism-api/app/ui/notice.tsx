import type { Notice } from "../utils/notice.ts";
import { Icon } from "./icons.tsx";

export function NoticeBar() {
  return ({ notice }: { notice: Notice | null }) =>
    notice ? (
      <div class={`notice ${notice.type}`} role={notice.type === "error" ? "alert" : "status"}>
        <Icon name={notice.type === "error" ? "alert" : "check"} />
        <span>{notice.text}</span>
      </div>
    ) : null;
}

export function ErrorList() {
  return ({ title, errors }: { title: string; errors: string[] }) =>
    errors.length > 0 ? (
      <div class="notice error" role="alert">
        <Icon name="alert" />
        <div>
          <strong>{title}</strong>
          <ul>
            {errors.map((error) => (
              <li>{error}</li>
            ))}
          </ul>
        </div>
      </div>
    ) : null;
}
