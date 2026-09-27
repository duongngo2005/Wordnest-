import { cookies } from "next/headers";
import { DEFAULT_STUDY_TIMEZONE, normalizeTimezone, TIMEZONE_COOKIE_KEY } from "./study-timezone";

/**
 * Resolves the study timezone on the server by reading the cookie `wordnest.timezone.v1`.
 * Validates and normalizes to an IANA timezone, falling back safely to DEFAULT_STUDY_TIMEZONE ("Asia/Ho_Chi_Minh").
 */
export async function getServerStudyTimezone(): Promise<string> {
  try {
    const cookieStore = await cookies();
    const candidate = cookieStore.get(TIMEZONE_COOKIE_KEY)?.value;
    return normalizeTimezone(candidate);
  } catch {
    // In contexts where cookies() is not available (e.g. background tasks or unit tests),
    // fallback gracefully to default study timezone.
    return DEFAULT_STUDY_TIMEZONE;
  }
}
