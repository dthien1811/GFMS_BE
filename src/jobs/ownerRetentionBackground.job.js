import ownerRetentionSyncService from "../service/ownerRetentionSync.service";

const INTERVAL_MS = Number(process.env.OWNER_RETENTION_SYNC_MS || 10 * 60 * 1000);

export function startOwnerRetentionBackgroundJob() {
  const run = async () => {
    try {
      const result = await ownerRetentionSyncService.syncPastUnmarkedGlobally();
      if (result?.processed > 0) {
        console.log(`[OwnerRetentionSync] Đã xử lý ${result.processed} buổi quá giờ chưa điểm danh.`);
      }
    } catch (e) {
      console.error("[OwnerRetentionSync]", e.message);
    }
  };

  run();
  setInterval(run, INTERVAL_MS);
}
