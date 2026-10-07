import { invoke } from "@tauri-apps/api/core";

export interface AppInfo {
  name: string;
  version: string;
  identifier: string;
  git_version: string | null;
  libgit2_version: string;
}

export async function getAppInfo(): Promise<AppInfo> {
  return await invoke<AppInfo>("app_info");
}
