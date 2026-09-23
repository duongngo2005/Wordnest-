import { NextResponse } from "next/server";
export async function PATCH() {
  return NextResponse.json(
    {
      success: false,
      error: "Trạng thái học được tạo từ lịch ôn và không thể chỉnh sửa thủ công.",
    },
    { status: 405 }
  );
}
