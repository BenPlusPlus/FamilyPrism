import type { Handle } from "remix/component";

import type { Notice } from "../utils/notice.ts";
import { Icon } from "./icons.tsx";

export function NoticeBar(handle: Handle<{ notice: Notice | null }>) {
  return () => {
    let { notice } = handle.props;
    return notice ? (
      <div class={`notice ${notice.type}`} role={notice.type === "error" ? "alert" : "status"}>
        <Icon name={notice.type === "error" ? "alert" : "check"} />
        <span>{notice.text}</span>
      </div>
    ) : null;
  };
}

export function ErrorList(handle: Handle<{ title: string; errors: string[] }>) {
  return () =>
    handle.props.errors.length > 0 ? (
      <div class="notice error" role="alert">
        <Icon name="alert" />
        <div>
          <strong>{handle.props.title}</strong>
          <ul>
            {handle.props.errors.map((error) => (
              <li>{error}</li>
            ))}
          </ul>
        </div>
      </div>
    ) : null;
}
