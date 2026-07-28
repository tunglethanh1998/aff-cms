"use client";

import { AccountMediaFolderPanel } from "@/components/account-media-folder-panel";

export function AccountBackgroundsPanel({ accountId }: { accountId: string }) {
  return <AccountMediaFolderPanel accountId={accountId} kind="backgrounds" />;
}
