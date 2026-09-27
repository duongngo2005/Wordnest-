export type PwaWindow = {
  isSecureContext: boolean;
  matchMedia: (query: string) => Pick<MediaQueryList, "matches">;
  navigator: { userAgent: string; standalone?: boolean };
};

export function isStandalonePwa(windowLike: PwaWindow): boolean {
  return Boolean(windowLike.navigator.standalone) || windowLike.matchMedia("(display-mode: standalone)").matches;
}

export function isIosDevice(userAgent: string): boolean {
  return /iphone|ipad|ipod/i.test(userAgent);
}

export function isPwaSecureContext(windowLike: Pick<PwaWindow, "isSecureContext">): boolean {
  return windowLike.isSecureContext;
}

export function isSafePwaUpdatePath(pathname: string): boolean {
  return !/\/(study|quiz|practice|review)$/.test(pathname);
}
