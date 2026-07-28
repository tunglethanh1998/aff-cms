"use client";

import { AccountMediaFolderPanel } from "@/components/account-media-folder-panel";

export function AccountPortraitsPanel({ accountId }: { accountId: string }) {
  return <AccountMediaFolderPanel accountId={accountId} kind="portraits" />;
}
