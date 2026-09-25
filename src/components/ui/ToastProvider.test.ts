import { describe, it, expect, vi } from "vitest";
import { wnToast } from "./ToastProvider";
import { toast as sonnerToast } from "sonner";
import * as soundLib from "@/lib/ui-sound";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn().mockReturnValue("toast-success-id"),
    error: vi.fn().mockReturnValue("toast-error-id"),
    info: vi.fn().mockReturnValue("toast-info-id"),
    dismiss: vi.fn(),
  },
  Toaster: () => null,
}));

describe("wnToast helper", () => {
  it("triggers sound and delegates to sonner on success", () => {
    const playSpy = vi.spyOn(soundLib, "playUISound").mockImplementation(() => {});

    const id = wnToast.success("Đã thêm 12 thẻ.");
    expect(id).toBe("toast-success-id");
    expect(playSpy).toHaveBeenCalledWith("success");
    expect(sonnerToast.success).toHaveBeenCalledWith("Đã thêm 12 thẻ.", {
      description: undefined,
      duration: 4000,
    });
  });

  it("triggers sound and delegates to sonner on error", () => {
    const playSpy = vi.spyOn(soundLib, "playUISound").mockImplementation(() => {});

    const id = wnToast.error("Không thể tạo truyện.");
    expect(id).toBe("toast-error-id");
    expect(playSpy).toHaveBeenCalledWith("error");
    expect(sonnerToast.error).toHaveBeenCalledWith("Không thể tạo truyện.", {
      description: undefined,
      duration: 5000,
    });
  });

  it("delegates dismiss to sonner", () => {
    wnToast.dismiss("some-id");
    expect(sonnerToast.dismiss).toHaveBeenCalledWith("some-id");
  });
});
