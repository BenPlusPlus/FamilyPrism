import { getNotice } from "../../utils/notice.ts";

export function renderNotice(notice: NonNullable<ReturnType<typeof getNotice>>) {
  return (
    <div class={`notice ${notice.type}`}>
      <strong>{notice.type === "error" ? "Error" : "Success"}:</strong>{" "}
      {notice.text}
    </div>
  );
}
