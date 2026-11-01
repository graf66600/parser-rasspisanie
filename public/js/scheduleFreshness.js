// Более старое облачное расписание не должно перекрывать опубликованный импорт.
import { safeFetchJson, PWA_VERSION } from './cacheHelper.js';

let publishedMetadata;

export function isRemoteScheduleCurrent(remoteUpdatedAt, publishedUpdatedAt) {
  const publishedTime = Date.parse(publishedUpdatedAt);
  if (!Number.isFinite(publishedTime)) return true;
  const remoteTime = Date.parse(remoteUpdatedAt);
  return Number.isFinite(remoteTime) && remoteTime >= publishedTime;
}

export async function canUseRemoteSchedule(remoteUpdatedAt) {
  publishedMetadata ||= safeFetchJson(`./data/schedule-source.json?v=${PWA_VERSION}`, 2000);
  const metadata = await publishedMetadata;
  return isRemoteScheduleCurrent(remoteUpdatedAt, metadata?.updatedAt);
}
